/**
 * IT Triage Agent — MCP Server
 *
 * MCP on the outside: exposes tools via MCP protocol (Streamable HTTP + SSE).
 * ToolLoopAgent on the inside: each tool invocation triggers multi-step agent reasoning.
 *
 * Registers with LiteLLM as an MCP server alongside hr-tools and it-tools.
 * Any MCP client (chatbot-v2, Claude Desktop, Cursor) can discover and call its tools.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express from 'express';
import { z } from 'zod';
import { initMCPClient, closeMCPClient, runTriageAgent, runSlaCheck } from './agent.js';

const PORT = process.env.PORT || 3000;

function registerTools(server) {
  server.tool(
    'triage_it_request',
    `Triage and execute IT support requests end-to-end using multi-step AI reasoning.

This tool owns the ENTIRE IT support lifecycle:
1. INITIAL TRIAGE — looks up the employee profile, finds the relevant IT process, classifies severity, determines team assignment, and checks approval requirements. Returns a structured triage summary with any missing information needed from the user.
2. TICKET CREATION — once the user provides all required information, call this tool AGAIN with the full context (original request + user's answers). The agent will create the ticket with proper classification, routing, priority, and approval status. Never call create_ticket or update_ticket_status directly — always delegate through this tool.

Use for: USB access, software install, hardware issues, VPN, password reset, onboarding, access permissions, data recovery, and any other IT support request.
Do NOT use for: simple read-only lookups like "show my tickets" or "what's the status of INC-2025-0001" — use individual data tools for those.`,
    {
      query: z.string().describe('The user\'s IT request in natural language. For follow-ups, include the full context: original request + user\'s answers to missing information.'),
      employee_id: z.string().describe('Employee ID of the requesting user (e.g. "EMP-034")'),
    },
    async ({ query, employee_id }) => {
      try {
        console.log(`[mcp] triage_it_request: employee=${employee_id}, query="${query.substring(0, 80)}"`);
        const result = await runTriageAgent({ query, employeeId: employee_id });
        return { content: [{ type: 'text', text: result }] };
      } catch (err) {
        console.error(`[mcp] triage_it_request error: ${err.message}`);
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: 'triage_failed', message: err.message }) }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'check_ticket_sla',
    'Check SLA compliance for an existing IT ticket. The agent looks up the ticket, determines its severity, and checks if it is within the SLA target window.',
    {
      ticket_id: z.string().describe('Ticket ID in INC-XXXX-XXXX format'),
    },
    async ({ ticket_id }) => {
      try {
        console.log(`[mcp] check_ticket_sla: ticket=${ticket_id}`);
        const result = await runSlaCheck({ ticketId: ticket_id });
        return { content: [{ type: 'text', text: result }] };
      } catch (err) {
        console.error(`[mcp] check_ticket_sla error: ${err.message}`);
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: 'sla_check_failed', message: err.message }) }],
          isError: true,
        };
      }
    }
  );

}

function createServer() {
  const server = new McpServer({ name: 'it-triage-agent', version: '1.0.0' });
  registerTools(server);
  return server;
}

// --- Express + MCP Transport ---

async function main() {
  // Connect to LiteLLM /mcp for consuming hr-tools + it-tools
  await initMCPClient();

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
    res.json({ status: 'healthy', name: 'it-triage-agent', timestamp: new Date().toISOString() });
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
    console.log(`IT Triage Agent MCP Server running on port ${PORT}`);
    console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
    console.log(`Health check: http://localhost:${PORT}/health`);
  });
}

main().catch(err => {
  console.error('Failed to start IT Triage Agent:', err);
  process.exit(1);
});

async function shutdown() {
  console.log('Shutting down...');
  await closeMCPClient();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
