/**
 * IT Tools MCP Server
 * Pure data/tools MCP server — no LLM, no coordinator registration.
 * Exposes IT ticket database as MCP tools for external LLM hosts to consume.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express from 'express';
import { z } from 'zod';
import { initializeLogger } from './utils/logger.js';
import { ITService } from './service.js';

initializeLogger('it-tools-mcp-server');

const PORT = process.env.PORT || 3000;

const service = new ITService();

function registerTools(server) {
  server.tool(
    'get_ticket',
    'Get a specific IT ticket by its ID (e.g. INC-2025-0120). Returns full ticket details and discussion history.',
    {
      ticket_id: z.string().describe('Ticket ID in INC-XXXX-XXXX format')
    },
    async ({ ticket_id }) => {
      const ticket = service.getTicketById(ticket_id);
      if (!ticket) {
        return { content: [{ type: 'text', text: `Ticket ${ticket_id} not found` }] };
      }

      const discussions = service.getTicketDiscussions(ticket_id);
      const discussionsText = discussions.length > 0
        ? discussions.map(d => {
          const flag = d.is_internal ? '[INTERNAL]' : '[PUBLIC]';
          return `${flag} ${d.author_name} (${d.author_email}) - ${d.created_at}\nType: ${d.comment_type}\n${d.content}`;
        }).join('\n\n')
        : 'No discussions yet';

      const text = `TICKET: ${ticket.ticket_id}
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

      return { content: [{ type: 'text', text }] };
    }
  );

  server.tool(
    'search_tickets',
    'Search IT tickets by keyword. Searches across ticket ID, employee name, email, description, and category.',
    {
      query: z.string().describe('Search term')
    },
    async ({ query }) => {
      const tickets = service.searchTickets(query);
      if (tickets.length === 0) {
        return { content: [{ type: 'text', text: `No tickets found matching "${query}"` }] };
      }

      const text = `Found ${tickets.length} ticket(s):\n\n` + tickets.map(t =>
        `${t.ticket_id} | ${t.employee_name} (${t.employee_email}) | ${t.status} | ${t.priority} | ${t.category} | ${t.description.substring(0, 100)}...`
      ).join('\n');

      return { content: [{ type: 'text', text }] };
    }
  );

  server.tool(
    'list_tickets',
    'List all IT tickets, optionally filtered by status, priority, or category.',
    {
      status: z.string().optional().describe('Filter by status (Open, In Progress, Resolved, Closed)'),
      priority: z.string().optional().describe('Filter by priority (Critical, High, Medium, Low)'),
      category: z.string().optional().describe('Filter by category')
    },
    async ({ status, priority, category }) => {
      let tickets;
      if (status) {
        tickets = service.getTicketsByStatus(status);
      } else if (priority) {
        tickets = service.getTicketsByPriority(priority);
      } else if (category) {
        tickets = service.getTicketsByCategory(category);
      } else {
        tickets = service.getAllTickets();
      }

      if (tickets.length === 0) {
        return { content: [{ type: 'text', text: 'No tickets found' }] };
      }

      const text = `${tickets.length} ticket(s):\n\n` + tickets.map(t =>
        `${t.ticket_id} | ${t.employee_name} | ${t.status} | ${t.priority} | ${t.category}`
      ).join('\n');

      return { content: [{ type: 'text', text }] };
    }
  );

  server.tool(
    'get_tickets_by_employee',
    'Get all tickets for a specific employee by their email address.',
    {
      employee_email: z.string().describe('Employee email address')
    },
    async ({ employee_email }) => {
      const tickets = service.getTicketsByEmployee(employee_email);
      if (tickets.length === 0) {
        return { content: [{ type: 'text', text: `No tickets found for ${employee_email}` }] };
      }

      const text = `${tickets.length} ticket(s) for ${employee_email}:\n\n` + tickets.map(t =>
        `${t.ticket_id} | ${t.status} | ${t.priority} | ${t.category} | ${t.description.substring(0, 100)}...`
      ).join('\n');

      return { content: [{ type: 'text', text }] };
    }
  );

  server.tool(
    'get_ticket_statistics',
    'Get IT ticket statistics: totals by status, priority, category, and assignee.',
    {},
    async () => {
      const stats = service.getStatistics();
      const text = `IT Ticket Statistics:

Total: ${stats.total}

By Status:
${stats.byStatus.map(s => `  ${s.status}: ${s.count}`).join('\n')}

By Priority:
${stats.byPriority.map(p => `  ${p.priority}: ${p.count}`).join('\n')}

By Assignee:
${stats.byAssignee.map(a => `  ${a.name} (${a.email}): ${a.count}`).join('\n')}`;

      return { content: [{ type: 'text', text }] };
    }
  );
}

function createServer() {
  const server = new McpServer({ name: 'it-tools', version: '1.0.0' });
  registerTools(server);
  return server;
}

// --- Express + MCP Transport ---

async function main() {
  await service.init();
  console.log('IT Tools service initialized');

  const app = express();
  // Ensure MCP clients can always reach Streamable HTTP transport
  // (some clients like LiteLLM don't send the required Accept header)
  // Must patch both headers object AND rawHeaders array since @hono/node-server reads rawHeaders
  app.use('/mcp', (req, _res, next) => {
    req.headers['accept'] = 'application/json, text/event-stream';
    const idx = req.rawHeaders.findIndex(h => h.toLowerCase() === 'accept');
    if (idx !== -1) {
      req.rawHeaders[idx + 1] = 'application/json, text/event-stream';
    } else {
      req.rawHeaders.push('Accept', 'application/json, text/event-stream');
    }
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'healthy', name: 'it-tools', timestamp: new Date().toISOString() });
  });

  // --- Streamable HTTP transport (POST /mcp) ---
  app.post('/mcp', async (req, res) => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  });

  // --- SSE transport (GET /sse + POST /messages) ---
  const sseTransports = {};

  app.get('/sse', async (_req, res) => {
    const server = createServer();
    const transport = new SSEServerTransport('/messages', res);
    sseTransports[transport.sessionId] = transport;
    res.on('close', () => { delete sseTransports[transport.sessionId]; });
    await server.connect(transport);
  });

  app.post('/messages', async (req, res) => {
    const sessionId = req.query.sessionId;
    const transport = sseTransports[sessionId];
    if (!transport) {
      return res.status(400).json({ error: 'Invalid or expired session' });
    }
    await transport.handlePostMessage(req, res);
  });

  app.get('/mcp', async (_req, res) => {
    res.status(405).json({ error: 'GET not supported — use POST for MCP requests' });
  });

  app.listen(PORT, () => {
    console.log(`IT Tools MCP Server running on port ${PORT}`);
    console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
    console.log(`Health check: http://localhost:${PORT}/health`);
  });
}

main().catch(err => {
  console.error('Failed to start IT Tools MCP Server:', err);
  process.exit(1);
});
