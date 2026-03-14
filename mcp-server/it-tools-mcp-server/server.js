/**
 * IT Tools MCP Server
 * Pure data/tools MCP server — no LLM, no coordinator registration.
 * Exposes IT ticket database, assets, and IT processes as MCP tools.
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

function json(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function registerTools(server) {
  // --- Ticket read tools ---

  server.tool(
    'get_ticket',
    'Get a specific IT ticket by its ID (e.g. INC-2025-0120). Returns full ticket details and discussion history.',
    {
      ticket_id: z.string().describe('Ticket ID in INC-XXXX-XXXX format')
    },
    async ({ ticket_id }) => {
      const ticket = service.getTicketById(ticket_id);
      if (!ticket) {
        return json({ error: 'not_found', message: `Ticket ${ticket_id} not found` });
      }
      const discussions = service.getTicketDiscussions(ticket_id);
      return json({ ...ticket, discussions });
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
      return json({ count: tickets.length, tickets });
    }
  );

  server.tool(
    'list_tickets',
    'List all IT tickets, optionally filtered by status, priority, or category.',
    {
      status: z.string().optional().describe('Filter by status (Open, In Progress, Pending Approval, Approved, Rejected, Resolved, Closed)'),
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
      return json({ count: tickets.length, filters: { status, priority, category }, tickets });
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
      return json({ count: tickets.length, employee_email, tickets });
    }
  );

  server.tool(
    'get_ticket_statistics',
    'Get IT ticket statistics: totals by status, priority, category, and assignee.',
    {},
    async () => {
      return json(service.getStatistics());
    }
  );

  // --- Ticket mutation tools ---

  server.tool(
    'create_ticket',
    'Create a new IT ticket. Returns the new ticket ID. Use this when an employee needs to open a support request, such as USB access, software installation, hardware replacement, etc.',
    {
      employee_email: z.string().describe('Email of the employee requesting support'),
      employee_name: z.string().describe('Full name of the employee'),
      description: z.string().describe('Detailed description of the request or issue'),
      priority: z.enum(['Critical', 'High', 'Medium', 'Low']).default('Medium').describe('Ticket priority'),
      category: z.string().describe('Category (e.g. USB Access, Software, Hardware, Network, Security, Email, Onboarding)'),
      status: z.enum(['Open', 'Pending Approval']).default('Open').describe('Initial status. Use "Pending Approval" for requests that require manager approval.'),
      asset_id: z.string().optional().describe('Asset ID if the request is linked to a specific device'),
    },
    async ({ employee_email, employee_name, description, priority, category, status, asset_id }) => {
      const result = service.createTicket({
        employee_email,
        employee_name,
        description: asset_id ? `${description} [Asset: ${asset_id}]` : description,
        priority,
        category,
        status,
        tags: category.toLowerCase(),
      });
      if (!result) {
        return json({ error: 'creation_failed', message: 'Failed to create ticket' });
      }
      return json({ success: true, ...result, message: `Ticket ${result.ticket_id} created successfully` });
    }
  );

  server.tool(
    'update_ticket_status',
    'Update the status of an existing IT ticket. Use this to approve, reject, resolve, or close tickets.',
    {
      ticket_id: z.string().describe('Ticket ID to update'),
      status: z.enum(['Open', 'In Progress', 'Pending Approval', 'Approved', 'Rejected', 'Resolved', 'Closed']).describe('New status'),
      approver_email: z.string().optional().describe('Email of the person approving/rejecting (required for approval actions)'),
      approver_name: z.string().optional().describe('Name of the person approving/rejecting'),
    },
    async ({ ticket_id, status, approver_email, approver_name }) => {
      const result = service.updateTicketStatus(ticket_id, status, approver_email, approver_name);
      if (!result) {
        return json({ error: 'update_failed', message: `Ticket ${ticket_id} not found or update failed` });
      }
      return json({ success: true, ...result, message: `Ticket ${ticket_id} status updated to "${status}"` });
    }
  );

  // --- Asset tools ---

  server.tool(
    'get_employee_assets',
    'Get all IT assets (laptops, devices) assigned to an employee by their email address. Use this to find which devices an employee has before creating device-specific requests.',
    {
      employee_email: z.string().describe('Employee email address')
    },
    async ({ employee_email }) => {
      const assets = service.getAssetsByEmployee(employee_email);
      return json({ count: assets.length, employee_email, assets });
    }
  );

  server.tool(
    'get_asset',
    'Get details of a specific IT asset by its asset ID.',
    {
      asset_id: z.string().describe('Asset ID (e.g. ASSET-00001)')
    },
    async ({ asset_id }) => {
      const asset = service.getAssetById(asset_id);
      if (!asset) {
        return json({ error: 'not_found', message: `Asset ${asset_id} not found` });
      }
      return json(asset);
    }
  );

  // --- IT Process tools ---

  server.tool(
    'search_it_processes',
    'Search IT processes and procedures by keyword. Returns the step-by-step process, required information, and whether manager approval is needed. Use this when an employee asks how to do something IT-related (e.g. "how do I get USB access", "I need new software").',
    {
      query: z.string().describe('Search term (e.g. "usb", "software install", "vpn", "password reset")')
    },
    async ({ query }) => {
      const processes = service.searchProcesses(query);
      return json({ count: processes.length, query, processes });
    }
  );

  server.tool(
    'get_it_process',
    'Get a specific IT process by its ID.',
    {
      process_id: z.number().describe('Process ID')
    },
    async ({ process_id }) => {
      const process = service.getProcessById(process_id);
      if (!process) {
        return json({ error: 'not_found', message: `Process ${process_id} not found` });
      }
      return json(process);
    }
  );

  server.tool(
    'list_it_processes',
    'List all available IT processes and procedures.',
    {},
    async () => {
      const processes = service.getAllProcesses();
      return json({ count: processes.length, processes });
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

  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} from ${req.ip}`);
    next();
  });

  // Ensure MCP clients can always reach Streamable HTTP transport
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

  app.get('/sse', async (req, res) => {
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
