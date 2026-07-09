/**
 * IT Triage Agent — ToolLoopAgent with local business logic + MCP data tools
 *
 * MCP on the outside, ToolLoopAgent on the inside.
 * - Local tools: classify severity, assign team, check approval, IT process lookup
 * - MCP tools via Portkey MCP Gateway: hr-tools (get_employee, get_employee_assets)
 *   and it-tools (get_ticket, search_tickets, create_ticket, etc.) — one client per server
 * - LLM via Portkey (api.portkey.ai/v1, OpenAI-compatible)
 */
import { ToolLoopAgent, tool, isStepCount } from 'ai';
import { createMCPClient } from '@ai-sdk/mcp';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Configuration ---

const PORTKEY_BASE_URL = process.env.PORTKEY_BASE_URL || 'https://api.portkey.ai/v1';
const PORTKEY_API_KEY = process.env.PORTKEY_API_KEY || '';
const AWS_PROVIDER = process.env.PORTKEY_AWS_PROVIDER || '@bedrock-prod';
const MODEL_ID = process.env.IT_TRIAGE_MODEL || process.env.PORTKEY_DEFAULT_MODEL || `${AWS_PROVIDER}/eu.anthropic.claude-sonnet-4-6`;
// Portkey Config ID (or inline JSON) enabling response caching. Simple/exact-match — a
// semantic cache can mis-hit mid agent loop and return a stale reasoning/tool call.
const CACHE_CONFIG = process.env.PORTKEY_CACHE_CONFIG || '';

// Portkey MCP Gateway — one endpoint per registered server (no single aggregator)
const PORTKEY_MCP_BASE = process.env.PORTKEY_MCP_BASE || 'https://mcp.portkey.ai';
const MCP_SLUGS = [process.env.PORTKEY_MCP_HR_SLUG, process.env.PORTKEY_MCP_IT_SLUG].filter(Boolean);
// IT_TRIAGE_MCP_URLS (comma-separated) points the agent's data-tool clients straight at
// the tools servers over the docker network, skipping the Portkey MCP cloud round-trip
// (~1-2s per call). The multi-step agent makes 6-9 data calls, so the nested cloud hops
// dominate latency and trip Portkey's upstream gateway timeout → 502 on the write path.
// LLM calls still go through Portkey. Falls back to Portkey slugs when unset.
const MCP_URLS = process.env.IT_TRIAGE_MCP_URLS
  ? process.env.IT_TRIAGE_MCP_URLS.split(',').map(s => s.trim()).filter(Boolean)
  : MCP_SLUGS.map(slug => `${PORTKEY_MCP_BASE}/${slug}/mcp`);

// --- IT Process Data (local — agent owns this domain) ---

const IT_PROCESSES = JSON.parse(readFileSync(join(__dirname, 'it-processes.json'), 'utf-8'));

// --- LLM Provider ---

// Per-invocation provider: injects a shared trace-id so Portkey groups all of one
// triage run's LLM steps into a single multi-step trace (not scattered tool calls),
// plus metadata for log filtering and an optional response-cache config.
function makeOpenAI({ traceId, employeeId }) {
  return createOpenAI({
    baseURL: PORTKEY_BASE_URL,
    apiKey: PORTKEY_API_KEY,
    fetch: async (url, init) => {
      const headers = new Headers(init?.headers);
      headers.set('x-portkey-api-key', PORTKEY_API_KEY);
      // trace-id is a header, NOT part of the cache key → safe to vary per run (groups
      // this run's LLM steps in Portkey). Metadata IS part of the simple-cache key, so keep
      // it stable — no per-run trace_id here, or the cache would never hit.
      headers.set('x-portkey-trace-id', traceId);
      if (CACHE_CONFIG) headers.set('x-portkey-config', CACHE_CONFIG);
      headers.set('x-portkey-metadata', JSON.stringify({
        _user: employeeId,
        app_name: 'IT Triage Agent',
        agent: 'it-triage',
      }));
      return fetch(url, { ...init, headers });
    },
  });
}

// --- MCP Clients (consume hr-tools + it-tools via Portkey MCP Gateway) ---

let mcpClients = [];

async function connectMCP(url) {
  const connectPromise = createMCPClient({
    transport: {
      type: 'http',
      url,
      headers: {
        'x-portkey-api-key': PORTKEY_API_KEY,
      },
      // v7 flipped the default to 'error'; Portkey MCP Gateway relies on redirects.
      redirect: 'follow',
    },
  });
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('MCP connection timeout (15s)')), 15000)
  );
  return Promise.race([connectPromise, timeoutPromise]);
}

export async function initMCPClient() {
  mcpClients = [];
  for (const url of MCP_URLS) {
    try {
      const client = await connectMCP(url);
      mcpClients.push({ url, client });
      console.log(`[it-triage] MCP client connected: ${url}`);
    } catch (err) {
      console.error(`[it-triage] Failed to connect MCP client ${url}: ${err.message}`);
    }
  }
}

export async function closeMCPClient() {
  for (const entry of mcpClients) {
    try { await entry.client.close(); } catch (_) {}
  }
}

/**
 * Get data tools (hr-tools, it-tools) from the Portkey MCP Gateway.
 * Each server has its own client, so no self-referential tools appear here.
 */
async function getMCPTools() {
  if (mcpClients.length === 0) return {};
  const merged = {};
  for (const entry of mcpClients) {
    try {
      const tools = await entry.client.tools();
      // @ai-sdk/mcp v1.0.26+ wraps MCP tools as dynamicTool() (type: 'dynamic') by default,
      // which would prevent ToolLoopAgent from executing them server-side. Strip the flag.
      for (const [name, t] of Object.entries(tools)) {
        if (t.type === 'dynamic') delete t.type;
        merged[name] = t;
      }
    } catch (err) {
      console.warn(`[it-triage] MCP tools unavailable from ${entry.url}: ${err.message}`);
    }
  }
  return merged;
}

// --- Local IT Process Tools ---

const searchItProcesses = tool({
  description: 'Search IT processes and procedures by keyword. Returns the step-by-step process, required information, and whether manager approval is needed. Use this when triaging an IT request to find the relevant process.',
  inputSchema: z.object({
    query: z.string().describe('Search term (e.g. "usb", "software install", "vpn", "password reset")'),
  }),
  execute: async ({ query }) => {
    const term = query.toLowerCase();
    const matches = IT_PROCESSES.filter(p =>
      p.name.toLowerCase().includes(term) ||
      p.description.toLowerCase().includes(term) ||
      p.category.toLowerCase().includes(term) ||
      p.keywords.toLowerCase().includes(term)
    );
    return { count: matches.length, query, processes: matches };
  },
});

const getItProcess = tool({
  description: 'Get a specific IT process by its ID.',
  inputSchema: z.object({
    process_id: z.number().describe('Process ID'),
  }),
  execute: async ({ process_id }) => {
    const process = IT_PROCESSES.find(p => p.id === process_id);
    if (!process) return { error: 'not_found', message: `Process ${process_id} not found` };
    return process;
  },
});

const listItProcesses = tool({
  description: 'List all available IT processes and procedures.',
  inputSchema: z.object({}),
  execute: async () => {
    return { count: IT_PROCESSES.length, processes: IT_PROCESSES };
  },
});

// --- Local Business Logic Tools ---

const classifySeverity = tool({
  description: 'Classify the severity of an IT request based on its category and description. Returns severity level and SLA target.',
  inputSchema: z.object({
    category: z.string().describe('IT category (e.g. USB Access, Software, Hardware, Network, Security, Email, Onboarding)'),
    description: z.string().describe('Description of the request or issue'),
    isVipEmployee: z.boolean().default(false).describe('Whether the employee is a director or above'),
  }),
  execute: async ({ category, description, isVipEmployee }) => {
    const descLower = description.toLowerCase();

    if (category === 'Security' || descLower.includes('breach') || descLower.includes('outage') || descLower.includes('down for everyone')) {
      return { severity: 'Critical', slaHours: 1, reason: 'Security or system-wide impact' };
    }
    if (isVipEmployee || descLower.includes('cannot work') || descLower.includes('production') || descLower.includes('urgent') || descLower.includes('deadline')) {
      return { severity: 'High', slaHours: 4, reason: isVipEmployee ? 'VIP employee escalation' : 'Work-blocking impact' };
    }
    if (['USB Access', 'Software', 'Hardware', 'Network', 'Email'].includes(category)) {
      return { severity: 'Medium', slaHours: 24, reason: 'Standard IT request' };
    }
    return { severity: 'Low', slaHours: 72, reason: 'Non-blocking request' };
  },
});

const assignTeam = tool({
  description: 'Determine which IT support team should handle a request based on category and severity.',
  inputSchema: z.object({
    category: z.string().describe('IT category'),
    severity: z.enum(['Critical', 'High', 'Medium', 'Low']).describe('Ticket severity'),
  }),
  execute: async ({ category, severity }) => {
    const teamMap = {
      'USB Access': { team: 'Endpoint Security', escalation: 'Security Ops' },
      'Software': { team: 'Desktop Engineering', escalation: 'App Platform' },
      'Hardware': { team: 'Hardware Support', escalation: 'Procurement' },
      'Network': { team: 'Network Ops', escalation: 'Network Engineering' },
      'Security': { team: 'Security Ops', escalation: 'CISO Office' },
      'Email': { team: 'Messaging Team', escalation: 'Platform Engineering' },
      'Onboarding': { team: 'IT Onboarding', escalation: 'IT Management' },
      'VPN': { team: 'Network Ops', escalation: 'Network Engineering' },
    };
    const mapping = teamMap[category] || { team: 'General IT Support', escalation: 'IT Management' };
    const needsEscalation = severity === 'Critical' || severity === 'High';
    return {
      assignedTeam: needsEscalation ? mapping.escalation : mapping.team,
      escalated: needsEscalation,
      reason: needsEscalation
        ? `${severity} severity — escalated to ${mapping.escalation}`
        : `Standard routing to ${mapping.team}`,
    };
  },
});

const checkApprovalRequired = tool({
  description: 'Check if an IT request requires manager approval based on category and process definition.',
  inputSchema: z.object({
    category: z.string().describe('IT category'),
    processRequiresApproval: z.boolean().describe('Whether the IT process definition says approval is needed'),
  }),
  execute: async ({ category, processRequiresApproval }) => {
    const alwaysApproval = ['USB Access', 'Security', 'VPN'];
    const needsApproval = processRequiresApproval || alwaysApproval.includes(category);
    return {
      approvalRequired: needsApproval,
      reason: alwaysApproval.includes(category)
        ? `${category} always requires manager approval per company policy`
        : processRequiresApproval
          ? 'Process definition requires manager approval'
          : 'No approval needed for this request type',
    };
  },
});

// --- Agent Instructions ---

const TRIAGE_INSTRUCTIONS = `You are an IT Triage Agent — you handle IT support requests end-to-end: look up the process, fetch employee data, classify, route, and create the ticket.

Tools:
1. PROCESS TOOLS (search_it_processes, get_it_process, list_it_processes) — IT process definitions and requirements
2. TRIAGE TOOLS (classify_severity, assign_team, check_approval_required) — deterministic classification/routing
3. DATA TOOLS (get_employee, get_employee_assets, create_ticket, etc.) — read/write actual data

## Workflow — be efficient, minimize steps. Batch independent tool calls into ONE step:

Step A (parallel): search_it_processes for the request category + get_employee + get_employee_assets.
Step B (parallel): classify_severity + check_approval_required + assign_team, using the process + employee data.
Step C: If all required info is present, create_ticket. If required info is missing from the user, do NOT create a ticket — return a short question listing exactly what you still need.
Step D: Return a concise structured summary (severity, team, SLA, approval status, ticket id).

## Rules:
- Do NOT narrate or "reflect" between tool calls — just call the tools and act. There is no thinking/reflect tool.
- Call independent tools in PARALLEL in a single step (process lookup + employee lookup together; the three classification tools together).
- Never call search_it_processes more than TWICE. If the first search returns 0 results, call list_it_processes ONCE, pick the closest process, and stop searching.
- Use the triage tools for classification — never guess severity or team.
- Employee is a director-or-above → VIP escalation in classify_severity. Use manager_name for approval routing.
- If the employee is not found, say so — do not fabricate data.
- Keep the final summary short.`;

// --- Agent Factory ---

/**
 * Run the IT triage agent for a given query.
 * Creates a fresh ToolLoopAgent per invocation with current MCP tools.
 */
export async function runTriageAgent({ query, employeeId, onProgress = () => {} }) {
  const mcpTools = await getMCPTools();
  const toolTimings = [];
  const traceId = `triage-${randomUUID()}`;
  const openai = makeOpenAI({ traceId, employeeId });

  const tools = {
    ...mcpTools,
    search_it_processes: searchItProcesses,
    get_it_process: getItProcess,
    list_it_processes: listItProcesses,
    classify_severity: classifySeverity,
    assign_team: assignTeam,
    check_approval_required: checkApprovalRequired,
  };

  const instructions = `${TRIAGE_INSTRUCTIONS}

The requesting employee's ID is ${employeeId}. Use this ID when looking up employee data.`;

  const agent = new ToolLoopAgent({
    model: openai.chat(MODEL_ID),
    instructions,
    tools,
    stopWhen: isStepCount(10),
    onToolExecutionStart: ({ toolCall }) => {
      console.log(`[it-triage] Tool call: ${toolCall.toolName}(${JSON.stringify(toolCall.args).substring(0, 120)})`);
      // Emit real step progress so the caller can stream bytes on the wire — keeps the
      // Cloudflare tunnel connection warm past its ~15s idle cap (prevents 502 on the
      // slow write path). Not fake: this is the agent's actual next action.
      const args = toolCall.args || {};
      const detail = args.observation || args.next_action || args.query || Object.values(args)[0];
      onProgress({ tool: toolCall.toolName, detail: typeof detail === 'string' ? detail.slice(0, 160) : '' });
    },
    onToolExecutionEnd: ({ toolCall, toolExecutionMs, toolOutput }) => {
      const ms = Math.round(toolExecutionMs);
      toolTimings.push({ tool: toolCall.toolName, ms });
      if (toolOutput?.type === 'tool-error') {
        console.error(`[it-triage] Tool error: ${toolCall.toolName} (${ms}ms): ${toolOutput.error}`);
      } else {
        console.log(`[it-triage] Tool done: ${toolCall.toolName} (${ms}ms)`);
      }
    },
    onEnd: ({ steps }) => {
      const total = toolTimings.reduce((a, t) => a + t.ms, 0);
      const breakdown = toolTimings.map(t => `${t.tool}=${t.ms}ms`).join(' ');
      console.log(`[it-triage] Agent finished in ${steps.length} steps | tool time ${total}ms | ${breakdown}`);
    },
  });

  const result = await agent.generate({ prompt: query });
  return result.text;
}


