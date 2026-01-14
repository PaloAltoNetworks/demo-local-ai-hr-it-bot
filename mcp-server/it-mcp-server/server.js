import { MCPAgentBase } from './shared/mcp-agent-base.js';
import { QueryProcessor } from './shared/query-processor.js';
import { ITService } from './service.js';
import { config } from './config.js';

class ITAgent extends MCPAgentBase {
  constructor() {
    super(config.name, config.description);
    this.queryProcessor = new QueryProcessor(this.agentName);
  }

  async createService() {
    const service = new ITService();
    await service.init();
    return service;
  }

  async setupResources() {
    // Ticket details resource
    this.resourceManager.registerTemplateResource(
      'ticket',
      { uri: 'it://tickets/{ticketId}', params: {} },
      {
        title: 'IT Ticket Details',
        description: 'Individual IT ticket information and status',
        mimeType: 'text/plain'
      },
      async (uri, { ticketId }) => {
        try {
          const ticket = this.service.getTicketById(ticketId);

          if (!ticket) {
            return {
              contents: [{
                uri: uri.href,
                text: `Ticket ${ticketId} not found`
              }]
            };
          }

          // Get ticket discussions
          const discussions = this.service.getTicketDiscussions(ticketId);
          const discussionsText = discussions.length > 0
            ? discussions.map(d => {
              const internalFlag = d.is_internal ? '[INTERNAL]' : '[PUBLIC]';
              return `${internalFlag} ${d.author_name} (${d.author_email}) - ${d.created_at}\nType: ${d.comment_type}\n${d.content}`;
            }).join('\n\n')
            : 'No discussions yet';

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

DISCUSSIONS:
${discussionsText}
          `.trim();

          return {
            contents: [{
              uri: uri.href,
              text: ticketDetails
            }]
          };
        } catch (error) {
          this.logger.error('Failed to fetch ticket', error);
          return {
            contents: [{
              uri: uri.href,
              text: `Error fetching ticket: ${error.message}`
            }]
          };
        }
      }
    );

    // Ticket discussions resource
    this.resourceManager.registerTemplateResource(
      'ticket-discussions',
      { uri: 'it://tickets/{ticketId}/discussions', params: {} },
      {
        title: 'Ticket Discussion History',
        description: 'All discussion comments and notes for a ticket',
        mimeType: 'text/plain'
      },
      async (uri, { ticketId }) => {
        try {
          const ticket = this.service.getTicketById(ticketId);

          if (!ticket) {
            return {
              contents: [{
                uri: uri.href,
                text: `Ticket ${ticketId} not found`
              }]
            };
          }

          const discussions = this.service.getTicketDiscussions(ticketId);
          const discussionsText = discussions.length > 0
            ? discussions.map(d => {
              const internalFlag = d.is_internal ? '[INTERNAL]' : '[PUBLIC]';
              return `${internalFlag} ${d.author_name} (${d.author_email}) - ${d.created_at}\nType: ${d.comment_type}\n${d.content}`;
            }).join('\n\n')
            : 'No discussions yet';

          const ticketWithDiscussions = `
TICKET: ${ticket.ticket_id}
Employee: ${ticket.employee_name} (${ticket.employee_email})
Status: ${ticket.status}
Priority: ${ticket.priority}

DISCUSSIONS:
${discussionsText}
          `.trim();

          return {
            contents: [{
              uri: uri.href,
              text: ticketWithDiscussions
            }]
          };
        } catch (error) {
          this.logger.error('Failed to fetch discussions', error);
          return {
            contents: [{
              uri: uri.href,
              text: `Error fetching discussions: ${error.message}`
            }]
          };
        }
      }
    );

    // Query resource
    this.resourceManager.registerTemplateResource(
      'query',
      { uri: 'it://query{?q*,provider*}', params: {} },
      {
        title: 'IT Query with User Context',
        description: 'Handle IT queries with user context information',
        mimeType: 'text/plain'
      },
      async (uri) => {
        try {
          const urlObj = new URL(uri.href);
          const query = urlObj.searchParams.get('q');
          const provider = urlObj.searchParams.get('provider');

          this.logger.debug(`Processing IT query: "${query}"${provider ? ` (provider: ${provider})` : ''}`);

          if (!query) {
            throw new Error('No query parameter provided');
          }

          const response = await this.processQuery(query, provider);

          return {
            contents: [{
              uri: uri.href,
              text: response
            }]
          };
        } catch (error) {
          this.logger.error('Query processing error', error);
          return {
            contents: [{
              uri: uri.href,
              text: `Error processing query: ${error.message}`
            }]
          };
        }
      }
    );

    this.resourceManager.logResourceSummary();
  }

  getCapabilities() {
    return config.capabilities;
  }

  canHandle(query) {
    const keywords = config.keywords;
    const queryLower = query.toLowerCase();

    let score = 0;
    keywords.forEach((keyword) => {
      if (queryLower.includes(keyword.toLowerCase())) {
        score += 12;
      }
    });

    return Math.min(score, 100);
  }

  async processQuery(query, providerOverride = null) {
    this.sendThinkingMessage('Analyzing IT support request...');

    try {
      // Try to extract ticket ID from query (e.g., INC-2025-0120)
      const ticketIdMatch = query.match(/INC-\d{4}-\d{4}/);
      let context = '';

      if (ticketIdMatch) {
        const ticketId = ticketIdMatch[0];
        const ticket = this.service.getTicketById(ticketId);
        
        if (ticket) {
          // Get full ticket details with discussions
          const discussions = this.service.getTicketDiscussions(ticketId);
          const discussionsText = discussions.length > 0
            ? discussions.map(d => {
              const internalFlag = d.is_internal ? '[INTERNAL]' : '[PUBLIC]';
              return `${internalFlag} ${d.author_name} (${d.author_email}) - ${d.created_at}\nType: ${d.comment_type}\n${d.content}`;
            }).join('\n\n')
            : 'No discussions yet';

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

DISCUSSIONS:
${discussionsText}`;

          context = ticketDetails;
        } else {
          context = `Ticket ${ticketId} not found in database`;
        }
      } else {
        // No specific ticket ID found, provide database listing
        const tickets = this.service.getAllTickets();
        const ticketsText = tickets.map(t =>
          `${t.ticket_id} | ${t.employee_name} | ${t.status} | ${t.priority} | ${t.category}`
        ).join('\n');
        context = `IT Tickets Database (${tickets.length} tickets):\n${ticketsText}`;
      }

      const fullPrompt = `${config.prompt}\n\n${context}\n\nQuestion: ${query}`;

      this.logger.debug(`Fetched details for tickets: ${fullPrompt}`);

      this.sendThinkingMessage('Querying IT database...');

      return await this.queryProcessor.processWithModel(fullPrompt, query, providerOverride);
    } catch (error) {
      this.logger.error('IT Agent processing error', error);
      return 'I encountered an error while accessing IT support information. Please try again or contact IT support directly.';
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const agent = new ITAgent();
  agent.start().catch(error => {
    console.error('❌ Failed to start IT Agent:', error);
    process.exit(1);
  });
}

export { ITAgent };
