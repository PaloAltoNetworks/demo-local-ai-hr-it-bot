/**
 * HR Tools MCP Server
 * Pure data/tools MCP server — no LLM, no coordinator registration.
 * Exposes HR employee database as MCP tools for external LLM hosts to consume.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'crypto';
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

/**
 * Argument formats enforced at the MCP boundary. The SDK rejects a tools/call whose arguments
 * fail these schemas before the handler runs; SQL always binds values as parameters on top of that.
 */
const EMPLOYEE_ID = z.string().regex(/^EMP-\d{3}$/, 'Expected EMP-NNN');

function registerTools(server) {
  server.tool(
    'get_employee',
    'Get a specific employee by employee ID, name, or email address. Returns full employee profile including employee_id, role, department, salary, leave balance, manager_id, manager_name, and manager comments.',
    {
      identifier: z.string().min(1).max(254).describe('Employee ID (e.g. "EMP-008"), name, or email address')
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
      query: z.string().min(1).max(100).describe('Search term')
    },
    async ({ query }) => {
      const employees = service.searchEmployees(query);
      return json({ count: employees.length, employees });
    }
  );

  server.tool(
    'get_direct_reports',
    'Get all employees who report to a specific manager by manager employee ID. Use get_employee first to resolve a name to an employee ID.',
    {
      manager_id: EMPLOYEE_ID.describe('Manager employee ID (e.g. "EMP-001")')
    },
    async ({ manager_id }) => {
      const manager = service.getEmployeeById(manager_id);
      const reports = service.getEmployeesByManager(manager_id);
      return json({ count: reports.length, manager_id, manager_name: manager?.name, direct_reports: reports });
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
    res.json({ status: 'healthy', name: 'hr-tools', timestamp: new Date().toISOString() });
  });

  // --- Streamable HTTP transport (stateful — Portkey MCP Gateway requires sessions) ---
  const httpTransports = {};

  app.post('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    let transport = sessionId ? httpTransports[sessionId] : undefined;
    if (!transport) {
      // New session — the transport assigns a session id on initialize and echoes it back.
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => { httpTransports[sid] = transport; },
      });
      transport.onclose = () => { if (transport.sessionId) delete httpTransports[transport.sessionId]; };
      await createServer().connect(transport);
    }
    await transport.handleRequest(req, res);
  });

  // GET (SSE stream) + DELETE (session close) for an established Streamable HTTP session
  const bySession = async (req, res) => {
    const transport = httpTransports[req.headers['mcp-session-id']];
    if (!transport) return res.status(400).json({ error: 'Invalid or missing session' });
    await transport.handleRequest(req, res);
  };
  app.get('/mcp', bySession);
  app.delete('/mcp', bySession);

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
