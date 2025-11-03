/**
 * IT Agent MCP Server (Refactored)
 * Specialized agent for IT support and technical issues
 */
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import { MCPAgentBase } from './shared/mcp-agent-base.js';
import { ResourceManager } from './shared/utils/resource-manager.js';
import { QueryProcessor } from './shared/utils/query-processor.js';
import { initializeDatabase } from './db-init.js';
import { getTicketService, initializeTicketService } from './ticket-db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

      // IT tickets database resource
      this.resourceManager.registerStaticResource(
        'tickets',
        'it://tickets',
        {
          title: 'IT Tickets Database',
          description: 'Complete IT support tickets database with ticket details',
          mimeType: 'text/csv'
        },
        async (uri) => ({
          contents: [
            {
              uri: uri.href,
              text: this.ticketService.getTicketsAsCSV()
            }
          ]
        })
      );

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
    const csv = this.ticketService.getTicketsAsCSV();
    
    // Build explicit summary of what's in the database
    let summary = `EXPLICIT TICKET SUMMARY FOR YOUR REFERENCE:\n`;
    summary += `✓ Total tickets in database: ${processedData.ticketCount}\n`;
    
    if (processedData.stats.byPriority) {
      summary += `\nTickets by Priority:\n`;
      processedData.stats.byPriority.forEach(p => {
        const ticketsWithPriority = tickets.filter(t => t.priority === p.priority);
        summary += `  • ${p.priority}: ${p.count} ticket(s)\n`;
        if (p.count <= 5) {
          ticketsWithPriority.forEach(t => {
            summary += `    - ${t.ticket_id}: ${t.description.substring(0, 50)}...\n`;
          });
        }
      });
    }
    
    if (processedData.stats.byStatus) {
      summary += `\nTickets by Status:\n`;
      processedData.stats.byStatus.forEach(s => {
        summary += `  • ${s.status}: ${s.count} ticket(s)\n`;
      });
    }

    let prompt = summary + `\n\n═══════════════════════════════════\nFULL TICKET DATABASE (CSV FORMAT):\n═══════════════════════════════════\n${csv}`;

    if (analysis.type.includes('status') || analysis.type.includes('ticket')) {
      prompt += `\n\nTICKET SUMMARY:\n`;
      prompt += `Statuses: ${processedData.statuses.join(', ')}\n`;
      prompt += `Priorities: ${processedData.priorities.join(', ')}\n`;
    }

    if (analysis.type.includes('assigned') || analysis.type.includes('ticket')) {
      prompt += `\n\nASSIGNMENT INFO:\n`;
      prompt += `Assigned To: ${processedData.assignees.join(', ')}\n`;
    }

    return prompt;
  }

  /**
   * Get system prompt
   */
  _getSystemPrompt() {
    return `You are an IT support specialist AI assistant with DIRECT access to the IT ticketing database.

⚠️ CRITICAL INSTRUCTIONS:
1. You MUST use ONLY data from the ticket database provided
2. Parse the CSV data carefully - each line is a ticket
3. When asked about tickets, COUNT and LIST them explicitly from the CSV
4. If asked "how many high priority tickets", COUNT all rows where priority='High'
5. NEVER say "no tickets available" if tickets exist in the CSV data

## DATABASE STRUCTURE:
The ticket database is provided in CSV format with these fields:
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

## YOUR RESPONSIBILITIES:
✅ Parse CSV data from the database
✅ Filter by priority, status, category, or employee
✅ Count and list tickets matching criteria
✅ Provide specific ticket IDs from the CSV
✅ Format results clearly

## CRITICAL RULES:
🔒 ALWAYS search the CSV for data before saying "no tickets available"
🔒 Count all matching rows from the CSV data
🔒 Only respond with data explicitly in the CSV
🔒 If a query asks for "high priority tickets", COUNT rows where priority=High
🔒 Never invent or assume ticket information
🔒 Always cite ticket IDs from the CSV

## RESPONSE FORMAT:
When answering queries, always:
1. State total count of matching tickets
2. List each ticket ID with key details
3. Group by priority/status if relevant`;
  }

  /**
   * Fetch IT ticket data
   */
  async _fetchITData() {
    try {
      return this.ticketService.getTicketsAsCSV();
    } catch (error) {
      this.logger.error('Failed to fetch IT data', error);
      throw new Error('IT tickets database is not available. Please contact IT support.');
    }
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

      // DEBUG: Log what we're sending to LLM
      this.logger.debug(`Full prompt length: ${fullPrompt.length} characters`);
      this.logger.debug(`Ticket count in processed data: ${processedData.ticketCount}`);
      
      // Log first 500 chars of contextual prompt to verify data
      const contextPreview = contextualPrompt.substring(0, 500);
      this.logger.debug(`Context preview: ${contextPreview}...`);

      this.sendThinkingMessage('Preparing IT support analysis...');

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
