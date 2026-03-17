/**
 * HR Tools MCP Server
 * Pure data/tools MCP server — no LLM, no coordinator registration.
 * Exposes HR employee database as MCP tools for external LLM hosts to consume.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express from 'express';
import { z } from 'zod';
import { initializeLogger } from './utils/logger.js';
import { HRService } from './service.js';

initializeLogger('hr-tools-mcp-server');

const PORT = process.env.PORT || 3000;

const service = new HRService();

function json(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function registerTools(server) {
  server.tool(
    'get_employee',
    'Get a specific employee by employee ID, name, or email address. Returns full employee profile including employee_id, role, department, salary, leave balance, manager_id, manager_name, and manager comments.',
    {
      identifier: z.string().describe('Employee ID (e.g. "EMP-008"), name, or email address')
    },
    async ({ identifier }) => {
      const employee = identifier.startsWith('EMP-')
        ? service.getEmployeeById(identifier)
        : (service.getEmployeeByEmail(identifier) || service.getEmployeeByName(identifier));
      if (!employee) {
        return json({ error: 'not_found', message: `Employee "${identifier}" not found` });
      }
      return json(employee);
    }
  );

  server.tool(
    'search_employees',
    'Search employees by keyword. Searches across employee ID, name, email, role, and department.',
    {
      query: z.string().describe('Search term')
    },
    async ({ query }) => {
      const employees = service.searchEmployees(query);
      return json({ count: employees.length, employees });
    }
  );

  server.tool(
    'list_employees',
    'List all employees, optionally filtered by department.',
    {
      department: z.string().optional().describe('Filter by department (e.g. Technology, Sales, Marketing, Human Resources, Finance, Executive, Operations, Legal, Customer Support, Quality, Business Development)')
    },
    async ({ department }) => {
      const employees = department
        ? service.getEmployeesByDepartment(department)
        : service.getAllEmployees();
      return json({ count: employees.length, department: department || 'all', employees });
    }
  );

  server.tool(
    'get_direct_reports',
    'Get all employees who report to a specific manager by manager employee ID. Use get_employee first to resolve a name to an employee ID.',
    {
      manager_id: z.string().describe('Manager employee ID (e.g. "EMP-001")')
    },
    async ({ manager_id }) => {
      const manager = service.getEmployeeById(manager_id);
      const reports = service.getEmployeesByManager(manager_id);
      return json({ count: reports.length, manager_id, manager_name: manager?.name, direct_reports: reports });
    }
  );

  server.tool(
    'get_employee_statistics',
    'Get HR statistics: total headcount, breakdown by department, and breakdown by manager (with employee IDs).',
    {},
    async () => {
      return json(service.getStatistics());
    }
  );
}

function createServer() {
  const server = new McpServer({ name: 'hr-tools', version: '1.0.0' });
  registerTools(server);
  return server;
}

// --- Express + MCP Transport ---

async function main() {
  await service.init();
  console.log('HR Tools service initialized');

  const app = express();

  // Log all incoming requests
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} from ${req.ip}`);
    console.log(`  Headers: ${JSON.stringify(req.headers)}`);
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
    res.json({ status: 'healthy', name: 'hr-tools', timestamp: new Date().toISOString() });
  });

  // --- Streamable HTTP transport (POST /mcp) ---
  app.post('/mcp', async (req, res) => {
    console.log(`[MCP] Streamable HTTP request received`);
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res);
    console.log(`[MCP] Streamable HTTP request completed — status: ${res.statusCode}`);
  });

  // --- SSE transport (GET /sse + POST /messages) ---
  const sseTransports = {};

  app.get('/sse', async (req, res) => {
    console.log(`[MCP] SSE connection opened from ${req.ip}`);
    const server = createServer();
    const transport = new SSEServerTransport('/messages', res);
    sseTransports[transport.sessionId] = transport;
    console.log(`[MCP] SSE session: ${transport.sessionId}`);
    res.on('close', () => {
      console.log(`[MCP] SSE session closed: ${transport.sessionId}`);
      delete sseTransports[transport.sessionId];
    });
    await server.connect(transport);
  });

  app.post('/messages', async (req, res) => {
    const sessionId = req.query.sessionId;
    console.log(`[MCP] SSE message for session: ${sessionId}`);
    const transport = sseTransports[sessionId];
    if (!transport) {
      console.log(`[MCP] SSE session not found: ${sessionId}`);
      return res.status(400).json({ error: 'Invalid or expired session' });
    }
    await transport.handlePostMessage(req, res);
  });

  app.get('/mcp', async (_req, res) => {
    res.status(405).json({ error: 'GET not supported — use POST for MCP requests' });
  });

  app.listen(PORT, () => {
    console.log(`HR Tools MCP Server running on port ${PORT}`);
    console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
    console.log(`Health check: http://localhost:${PORT}/health`);
  });
}

main().catch(err => {
  console.error('Failed to start HR Tools MCP Server:', err);
  process.exit(1);
});
