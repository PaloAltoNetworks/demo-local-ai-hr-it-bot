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
    this.ticketData = null;
  }

  /**
   * Setup MCP resources for IT data
   */
  setupResources() {
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
            text: await this._fetchITData()
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
          const ticketData = await this._fetchITData();
          const lines = ticketData.split('\n');
          const header = lines[0];
          const ticketRow = lines.find(
            (line) =>
              line.toLowerCase().includes(ticketId.toLowerCase()) ||
              line.startsWith(ticketId)
          );

          const result = ticketRow
            ? `${header}\n${ticketRow}`
            : `Ticket ${ticketId} not found`;

          return {
            contents: [
              {
                uri: uri.href,
                text: result
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
  _preprocessTicketData(rawData, queryAnalysis) {
    const lines = rawData.split('\n');
    const header = lines[0];
    const tickets = lines.slice(1).filter((line) => line.trim());

    const processedData = {
      header,
      tickets,
      ticketCount: tickets.length,
      statuses: new Set(),
      priorities: new Set(),
      assignees: new Set(),
      rawData
    };

    tickets.forEach((ticket) => {
      const fields = this._parseCSVLine(ticket);
      if (fields.length >= 6) {
        processedData.statuses.add(fields[3]); // status
        processedData.priorities.add(fields[4]); // priority
        processedData.assignees.add(fields[5]); // assigned_to
      }
    });

    return processedData;
  }

  /**
   * Parse CSV line
   */
  _parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result;
  }

  /**
   * Build contextual prompt for query
   */
  _buildContextualPrompt(analysis, processedData) {
    let prompt = `IT Tickets Database (${processedData.ticketCount} tickets):\n${processedData.rawData}`;

    if (analysis.type.includes('status') || analysis.type.includes('ticket')) {
      prompt += `\n\nTICKET SUMMARY:\n`;
      prompt += `Statuses: ${Array.from(processedData.statuses).join(', ')}\n`;
      prompt += `Priorities: ${Array.from(processedData.priorities).join(', ')}\n`;
    }

    if (analysis.type.includes('assigned') || analysis.type.includes('ticket')) {
      prompt += `\n\nASSIGNMENT INFO:\n`;
      prompt += `Assigned To: ${Array.from(processedData.assignees).join(', ')}\n`;
    }

    return prompt;
  }

  /**
   * Get system prompt
   */
  _getSystemPrompt() {
    return `You are an IT support specialist AI assistant with access to the IT ticketing system.

## DATABASE STRUCTURE:
- ticket_id: Unique ticket identifier (TKT-XXXX)
- title: Short description of the issue
- description: Detailed issue description
- status: Current ticket status (Open, In Progress, Resolved, Closed)
- priority: Issue priority (Critical, High, Medium, Low)
- assigned_to: Technician handling the ticket
- created_date: When the ticket was created
- resolution: How the issue was resolved
- notes: Additional notes or comments

## CORE CAPABILITIES:
✅ Ticket Lookup & Status Checking
✅ Issue Diagnosis & Troubleshooting
✅ Assignment & Responsibility Information
✅ Priority & Urgency Assessment
✅ Resolution & Closure Tracking
✅ Technical Support Guidance

## CRITICAL RULES:
🔒 NEVER invent or assume ticket information
🔒 Only use data explicitly present in the ticket database
🔒 All ticket IDs and assignments must match database exactly
🔒 When accessing sensitive systems, recommend official IT channels
🔒 If query is outside IT domain, respond with "OUTSIDE_SCOPE"

## RESPONSE GUIDELINES:
- Precise Data: Only use information from the tickets database
- Clear Formatting: Present ticket information in organized format
- Complete Context: Include ticket status, priority, and assignment
- Professional Tone: Maintain security and confidentiality standards
- Error Handling: Clearly state when ticket information is not available

## TROUBLESHOOTING APPROACH:
1. Identify the specific issue or device affected
2. Check if a related ticket already exists
3. Provide basic troubleshooting steps if available
4. Escalate to appropriate technician if needed
5. Follow up with ticket status updates`;
  }

  /**
   * Fetch IT ticket data from CSV
   */
  async _fetchITData() {
    if (this.ticketData) {
      return this.ticketData;
    }

    try {
      const csvPath = path.join(__dirname, 'tickets.csv');
      const csvData = await fs.readFile(csvPath, 'utf8');

      const lines = csvData.split('\n').filter((line) => line.trim());
      const ticketCount = Math.max(0, lines.length - 1);

      this.logger.debug(`Loaded IT tickets database: ${ticketCount} tickets`);

      this.ticketData = `IT TICKETS DATABASE (${ticketCount} tickets):
${csvData}

DATABASE FIELDS:
- ticket_id: Unique ticket identifier (TKT-XXXX)
- title: Short issue description
- description: Detailed issue description
- status: Current status (Open, In Progress, Resolved, Closed)
- priority: Priority level (Critical, High, Medium, Low)
- assigned_to: Assigned technician
- created_date: Ticket creation date
- resolution: Resolution details
- notes: Additional notes`;

      return this.ticketData;
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

      const rawTicketData = await this._fetchITData();
      const processedData = this._preprocessTicketData(rawTicketData, queryAnalysis);
      this.sendThinkingMessage(
        `Accessing ticket database (${processedData.ticketCount} tickets)...`
      );

      const contextualPrompt = this._buildContextualPrompt(queryAnalysis, processedData);

      const systemPrompt = this._getSystemPrompt();
      const fullPrompt = `${systemPrompt}\n\n## QUERY ANALYSIS:\nType: ${queryAnalysis.type}\nKeywords: ${queryAnalysis.keywords.join(', ')}\n\n## TICKET DATABASE CONTEXT:\n${contextualPrompt}`;

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
