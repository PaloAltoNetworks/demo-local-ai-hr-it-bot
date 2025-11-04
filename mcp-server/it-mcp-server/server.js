/**
 * IT Agent MCP Server (Refactored)
 * Specialized agent for IT support and technical issues
 */
import { MCPAgentBase } from './shared/mcp-agent-base.js';
import { ResourceManager } from './shared/utils/resource-manager.js';
import { QueryProcessor } from './shared/utils/query-processor.js';
import { initializeDatabase } from './database-manager.js';
import { initializeTicketService } from './ticket-db.js';

class ITAgent extends MCPAgentBase {
  constructor() {
    super(
      'it',
      'Specialized agent for IT support tickets, technical issues, and troubleshooting'
    );

    this.dataTypes = ['tickets', 'systems', 'hardware', 'software'];
    this.queryProcessor = new QueryProcessor(this.agentName);
    this.resourceManager = null;
    this.ticketService = null;
    this.db = null;
  }

  /**
   * Setup MCP resources for IT data
   */
  async setupResources() {
    // Initialize database
    try {
      await initializeDatabase();
      this.ticketService = await initializeTicketService();
      this.resourceManager = new ResourceManager(this.agentName, this.server);

      // Dynamic ticket resource
      this.resourceManager.registerTemplateResource(
        'ticket',
        {
          uri: 'it://tickets/{ticketId}',
          params: {}
        },
        {
          title: 'IT Ticket Details',
          description: 'Individual IT ticket information and status',
          mimeType: 'text/plain'
        },
        async (uri, { ticketId }) => {
          try {
            const ticket = this.ticketService.getTicketById(ticketId);

            if (!ticket) {
              return {
                contents: [
                  {
                    uri: uri.href,
                    text: `Ticket ${ticketId} not found`
                  }
                ]
              };
            }

            const ticketDetails = `
TICKET DETAILS
==============
ID: ${ticket.ticket_id}
Employee: ${ticket.employee_name} (${ticket.employee_email})
Date: ${ticket.date}
Status: ${ticket.status}
Priority: ${ticket.priority}
Category: ${ticket.category}
Assigned To: ${ticket.assigned_to} (${ticket.assigned_to_email})
Resolution Time: ${ticket.resolution_time || 'N/A'}
Tags: ${ticket.tags || 'N/A'}

DESCRIPTION:
${ticket.description}
            `.trim();

            return {
              contents: [
                {
                  uri: uri.href,
                  text: ticketDetails
                }
              ]
            };
          } catch (error) {
            this.logger.error('Failed to fetch ticket', error);
            return {
              contents: [
                {
                  uri: uri.href,
                  text: `Error fetching ticket: ${error.message}`
                }
              ]
            };
          }
        }
      );

      // Ticket discussions resource
      this.resourceManager.registerTemplateResource(
        'ticket-discussions',
        {
          uri: 'it://tickets/{ticketId}/discussions',
          params: {}
        },
        {
          title: 'Ticket Discussion History',
          description: 'All discussion comments, notes, and communication history for a ticket',
          mimeType: 'text/plain'
        },
        async (uri, { ticketId }) => {
          try {
            const ticket = this.ticketService.getTicketById(ticketId);

            if (!ticket) {
              return {
                contents: [
                  {
                    uri: uri.href,
                    text: `Ticket ${ticketId} not found`
                  }
                ]
              };
            }

            const discussions = this.ticketService.getTicketDiscussions(ticketId);
            const discussionsText = this._formatDiscussionsAsText(ticketId);

            const ticketWithDiscussions = `
TICKET: ${ticket.ticket_id}
Employee: ${ticket.employee_name} (${ticket.employee_email})
Status: ${ticket.status}
Priority: ${ticket.priority}
Assigned To: ${ticket.assigned_to}

INTERNAL NOTES:
${ticket.internal_notes || 'No internal notes'}

${discussionsText}
            `.trim();

            return {
              contents: [
                {
                  uri: uri.href,
                  text: ticketWithDiscussions
                }
              ]
            };
          } catch (error) {
            this.logger.error('Failed to fetch ticket discussions', error);
            return {
              contents: [
                {
                  uri: uri.href,
                  text: `Error fetching discussions: ${error.message}`
                }
              ]
            };
          }
        }
      );

      // Query resource for processing IT queries
      this.resourceManager.registerTemplateResource(
        'query',
        {
          uri: 'it://query{?q*}',
          params: {}
        },
        {
          title: 'IT Query with User Context',
          description: 'Handle IT queries with user context information',
          mimeType: 'text/plain'
        },
        async (uri) => {
          try {
            const urlObj = new URL(uri.href);
            const query = urlObj.searchParams.get('q');

            this.logger.debug(`Processing IT query: "${query}"`);

            if (!query) {
              throw new Error('No query parameter provided');
            }

            const response = await this.processQuery(query);

            return {
              contents: [
                {
                  uri: uri.href,
                  text: response
                }
              ]
            };
          } catch (error) {
            this.logger.error('Query processing error', error);
            return {
              contents: [
                {
                  uri: uri.href,
                  text: `Error processing query: ${error.message}`
                }
              ]
            };
          }
        }
      );

      this.resourceManager.logResourceSummary();
    } catch (error) {
      this.logger.error('Failed to setup resources', error);
      throw error;
    }
  }

  /**
   * Get available resources
   */
  getAvailableResources() {
    return this.resourceManager?.getResourcesList() || [];
  }

  /**
   * Get agent capabilities
   */
  getCapabilities() {
    return [
      'Access IT support tickets and ticket history',
      'Check ticket status and priority',
      'Find ticket assignments and responsible technicians',
      'Retrieve technical issue descriptions and symptoms',
      'Check resolution details and closure information',
      'Answer questions about system incidents',
      'Provide IT policy information',
      'Handle troubleshooting guidance for common issues'
    ];
  }

  /**
   * Get keywords for query matching
   */
  _getKeywords() {
    return [
      'ticket', 'issue', 'problem', 'error', 'bug', 'support', 'help',
      'system', 'software', 'hardware', 'network', 'connectivity',
      'password', 'login', 'access', 'permission', 'account',
      'printer', 'scanner', 'monitor', 'keyboard', 'mouse',
      'email', 'outlook', 'slack', 'teams', 'application',
      'crash', 'freeze', 'slow', 'broken', 'down',
      'status', 'resolved', 'pending', 'assigned', 'priority',
      'urgency', 'critical', 'high', 'medium', 'low'
    ];
  }

  /**
   * Check if agent can handle query
   */
  canHandle(query, context = {}) {
    const keywords = this._getKeywords();
    const queryLower = query.toLowerCase();

    let score = 0;
    keywords.forEach((keyword) => {
      if (queryLower.includes(keyword.toLowerCase())) {
        score += 12;
      }
    });

    return Math.min(score, 100);
  }

  /**
   * Analyze query to understand intent
   */
  _analyzeQuery(query) {
    const queryLower = query.toLowerCase();
    const analysis = {
      type: 'general',
      confidence: 0,
      keywords: [],
      entities: []
    };

    const patterns = {
      ticket_lookup: /ticket|find ticket|lookup ticket|search ticket|ticket id/i,
      issue_diagnosis: /issue|problem|error|troubleshoot|why|not working|slow|crash/i,
      status_check: /status|pending|resolved|assigned|priority|urgency/i,
      system_info: /system|software|hardware|network|connectivity|service/i,
      access_issue: /access|login|password|permission|account|locked|reset/i,
      device_issue: /printer|scanner|monitor|keyboard|mouse|device/i
    };

    for (const [type, pattern] of Object.entries(patterns)) {
      if (pattern.test(queryLower)) {
        analysis.type = type;
        analysis.confidence = 85;
        break;
      }
    }

    analysis.keywords = this._getKeywords().filter((keyword) =>
      queryLower.includes(keyword.toLowerCase())
    );

    // Extract ticket IDs (format: TKT-XXXX)
    const ticketPattern = /TKT-\d+/gi;
    analysis.entities = query.match(ticketPattern) || [];

    return analysis;
  }

  /**
   * Preprocess ticket data
   */
  _preprocessTicketData(queryAnalysis) {
    const tickets = this.ticketService.getAllTickets();
    const stats = this.ticketService.getStatistics();

    const processedData = {
      tickets,
      ticketCount: stats.total,
      statuses: stats.byStatus.map(s => s.status),
      priorities: stats.byPriority.map(p => p.priority),
      assignees: stats.byAssignee.map(a => a.assigned_to),
      stats
    };

    return processedData;
  }

  /**
   * Build contextual prompt for query
   */
  _buildContextualPrompt(analysis, processedData) {
    const tickets = this.ticketService.getAllTickets();
    
    // Build explicit summary of what's in the database
    let summary = `EXPLICIT TICKET SUMMARY FOR YOUR REFERENCE:\n`;
    summary += `Total tickets in database: ${processedData.ticketCount}\n`;
    
    // Include ALL ticket IDs and basic details for reference
    summary += `\n=== COMPLETE TICKET LISTING ===\n`;
    summary += `All tickets in database (${tickets.length} total):\n`;
    tickets.forEach((t, idx) => {
      summary += `  ${idx + 1}. ${t.ticket_id} - Employee: ${t.employee_name} (${t.employee_email}) | Status: ${t.status} | Priority: ${t.priority} | Category: ${t.category}\n`;
      summary += `     Description: ${t.description}\n`;
      summary += `     Assigned to: ${t.assigned_to}\n`;
      
      // For specific employees, include discussion history
      if (t.employee_name.toLowerCase().includes('sophie') || t.employee_email.includes('sophie.martin')) {
        summary += `     ⭐ SOPHIE MARTIN TICKET - INCLUDING FULL DISCUSSION HISTORY:\n`;
        const discussions = this.ticketService.getTicketDiscussions(t.ticket_id);
        if (discussions && discussions.length > 0) {
          summary += `     Discussion messages (${discussions.length}):\n`;
          discussions.forEach((d, didx) => {
            const internalFlag = d.is_internal ? '[INTERNAL]' : '[PUBLIC]';
            summary += `       ${didx + 1}. ${internalFlag} ${d.author_name} (${d.author_email}) - ${d.created_at}\n`;
            summary += `          Type: ${d.comment_type}\n`;
            summary += `          Message: ${d.content}\n`;
          });
        }
      }
      summary += `\n`;
    });
    
    // Include statistics
    if (processedData.stats.byPriority) {
      summary += `\n=== TICKETS BY PRIORITY ===\n`;
      processedData.stats.byPriority.forEach(p => {
        summary += `  • ${p.priority}: ${p.count} ticket(s)\n`;
      });
    }
    
    if (processedData.stats.byStatus) {
      summary += `\n=== TICKETS BY STATUS ===\n`;
      processedData.stats.byStatus.forEach(s => {
        summary += `  • ${s.status}: ${s.count} ticket(s)\n`;
      });
    }

    return summary;
  }

  /**
   * Format discussions as text for display
   * @private
   */
  _formatDiscussionsAsText(ticketId) {
    const discussions = this.ticketService.getTicketDiscussions(ticketId);
    
    if (discussions.length === 0) {
      return 'No discussions yet';
    }

    const lines = [
      `=== TICKET DISCUSSIONS (${discussions.length} comments) ===\n`,
      ...discussions.map(d => {
        const internalLabel = d.is_internal ? '[INTERNAL]' : '[CUSTOMER]';
        return `${internalLabel} ${d.author_name} (${d.author_email}) - ${d.created_at}
Type: ${d.comment_type}
${d.content}`;
      })
    ];

    return lines.join('\n');
  }

  /**
   * Get system prompt
   */
  _getSystemPrompt() {
    return `You are an IT support specialist AI assistant with DIRECT access to the IT ticketing database.

⚠️ CRITICAL INSTRUCTIONS - READ CAREFULLY:
1. You MUST use ONLY data from the COMPLETE TICKET DATABASE provided below
2. You have been given the COMPLETE LISTING of ALL tickets - do NOT invent or hallucinate tickets
3. When asked about ANY employee's tickets, search the provided listing by employee_name and employee_email
4. NEVER make up ticket IDs - they MUST come from the database listing provided
5. Use ticket discussion history to provide comprehensive support information
6. When asked "what are Sophie Martin's tickets?" - search for the exact employee name in the listing

## CRITICAL ANTI-HALLUCINATION RULES:
🚫 DO NOT invent ticket IDs like INC-0001-2345 or INC-0002-6789
🚫 DO NOT say "based on typical IT issues" or "similar tickets might be"
🚫 DO NOT assume information not explicitly in the database
🚫 DO NOT make up employee-ticket relationships
ONLY use ticket IDs from the provided database listing
ONLY use ticket data explicitly provided in the context
When in doubt about data, say "This information is not in the database"

## DATABASE STRUCTURE:
The ticket database contains these fields:
- ticket_id: Unique ticket identifier (INC-XXXX-XXXX format)
- employee_email: Email of employee reporting issue
- employee_name: Name of employee reporting issue
- date: Date ticket was created
- status: Current status (Open, In Progress, Resolved, Closed)
- description: Detailed issue description
- priority: Priority level (Critical, High, Medium, Low)
- category: Issue category (Application, Hardware, Security, Network, Software, etc.)
- assigned_to_email: Email of assigned technician
- assigned_to: Name of assigned technician
- resolution_time: Time to resolution
- tags: Issue tags
- ticket_discussions: Full discussion history with comments, internal notes, and updates

## YOUR RESPONSIBILITIES:
Access and analyze IT tickets from the DATABASE PROVIDED
Filter by priority, status, category, or employee
Count and list tickets matching criteria
Provide specific ticket IDs with their status
Review discussion history for comprehensive context
Format results clearly

## RESPONSE FORMAT:
When answering queries:
1. State total count of matching tickets (from the provided database)
2. List each ticket ID with key details
3. Include relevant discussion context when applicable
4. Group by priority/status if relevant
5. Include internal notes for tickets like Sophie Martin's laptop replacement`;
  }

  /**
   * Process IT query
   */
  async processQuery(query) {
    this.sendThinkingMessage('Analyzing IT support request...');

    try {
      const queryAnalysis = this._analyzeQuery(query);
      this.sendThinkingMessage(
        `Query type: ${queryAnalysis.type} (confidence: ${queryAnalysis.confidence}%)`
      );

      const processedData = this._preprocessTicketData(queryAnalysis);
      this.sendThinkingMessage(
        `Accessing ticket database (${processedData.ticketCount} tickets)...`
      );

      const contextualPrompt = this._buildContextualPrompt(queryAnalysis, processedData);

      const systemPrompt = this._getSystemPrompt();
      const fullPrompt = `${systemPrompt}\n\n## QUERY ANALYSIS:\nType: ${queryAnalysis.type}\nKeywords: ${queryAnalysis.keywords.join(', ')}\n\n## TICKET DATABASE CONTEXT:\n${contextualPrompt}`;

      const response = await this.queryProcessor.processWithModel(fullPrompt, query);

      this.sendThinkingMessage('Finalizing IT support response...');

      return response;
    } catch (error) {
      this.logger.error('IT Agent processing error', error);
      return 'I encountered an error while accessing IT support information. Please try again or contact IT support directly.';
    }
  }

  /**
   * Health check with IT-specific information
   */
  async healthCheck() {
    const baseHealth = await super.healthCheck();

    try {
      const models = await this.queryProcessor.getAvailableModels();
      return {
        ...baseHealth,
        ollama: {
          status: 'healthy',
          models
        },
        dataTypes: this.dataTypes,
        resources: this.getAvailableResources().length
      };
    } catch (error) {
      return {
        ...baseHealth,
        ollama: {
          status: 'unhealthy',
          error: error.message
        },
        dataTypes: this.dataTypes
      };
    }
  }
}

// Start the MCP server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const agent = new ITAgent();
  agent.start().catch((error) => {
    console.error('❌ Failed to start IT Agent MCP server:', error);
    process.exit(1);
  });
}

export { ITAgent };
