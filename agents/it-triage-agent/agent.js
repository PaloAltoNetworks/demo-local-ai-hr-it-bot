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
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Configuration ---

const PORTKEY_BASE_URL = process.env.PORTKEY_BASE_URL || 'https://api.portkey.ai/v1';
const PORTKEY_API_KEY = process.env.PORTKEY_API_KEY || '';
const AWS_PROVIDER = process.env.PORTKEY_AWS_PROVIDER || '@bedrock-prod';
const MODEL_ID = process.env.IT_TRIAGE_MODEL || process.env.PORTKEY_DEFAULT_MODEL || `${AWS_PROVIDER}/eu.anthropic.claude-sonnet-4-6`;

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

const openai = createOpenAI({
  baseURL: PORTKEY_BASE_URL,
  apiKey: PORTKEY_API_KEY,
  fetch: async (url, init) => {
    const headers = new Headers(init?.headers);
    headers.set('x-portkey-api-key', PORTKEY_API_KEY);
    return fetch(url, { ...init, headers });
  },
});

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

const reflect = tool({
  description: 'Record your observation from the last tool result and state your next action. Call this: (1) after every data tool result (get_employee, search_tickets, etc.), (2) before every decision tool (classify_severity, assign_team, check_approval_required). This enforces the ReAct loop: Observe → Reason → Decide.',
  inputSchema: z.object({
    phase: z.enum(['observe', 'reason', 'decide']).describe('Current ReAct phase'),
    observation: z.string().describe('What did the last tool return? Was it expected? Any surprises?'),
    gaps: z.string().describe('What is still unknown or ambiguous?'),
    next_action: z.string().describe('What will you do next and why?'),
  }),
  execute: async ({ phase, observation, gaps, next_action }) => {
    console.log(`[react:${phase}] ${observation} | gaps: ${gaps} | next: ${next_action}`);
    return { phase, acknowledged: true };
  },
});

// --- Agent Instructions ---

const TRIAGE_INSTRUCTIONS = `You are an IT Triage Agent — a specialized assistant that handles IT support requests with structured reasoning.

You have access to three types of tools:
1. LOCAL PROCESS TOOLS (search_it_processes, get_it_process, list_it_processes) — look up IT process definitions, steps, and requirements
2. LOCAL TRIAGE TOOLS (classify_severity, assign_team, check_approval_required) — deterministic business logic for evaluating and routing IT requests
3. MCP DATA TOOLS (prefixed with server names) — for reading actual data (employees, tickets, assets)

## Reasoning before acting

Before each tool call, think:
- What do I know so far? What am I still missing?
- Which tools can I call in parallel (independent) vs. must I call sequentially (one depends on another's result)?
- Am I about to call a tool I've already called with the same arguments? If yes, stop and reason instead.

## After each tool result, assess:

After search_it_processes:
- Did I get a matching process? If 0 results, try synonyms (e.g. "flash drive" for "usb", "remote access" for "vpn") before continuing.
- If still no match after reformulation, proceed with the closest category and note the ambiguity.

After get_employee:
- Is the employee found? If not found, note it explicitly in the final summary — do not fabricate employee data.
- Is the employee a director or above? That determines VIP escalation in severity classification.

After classify_severity + assign_team + check_approval_required:
- Do the results make sense together? (e.g. Critical severity should always route to escalation team)
- If something looks inconsistent, reason about it before finalizing.

## Workflow (enforce ReAct loop):
1. Think: what category is this request? Call search_it_processes.
2. reflect({ phase: 'observe', observation: <what search returned>, gaps: <what's missing>, next_action: 'fetch employee data' })
3. In parallel: get_employee + get_employee_assets.
4. reflect({ phase: 'observe', observation: <employee data summary>, gaps: <any missing fields>, next_action: 'classify and route' })
5. In parallel: classify_severity + check_approval_required + assign_team.
6. reflect({ phase: 'decide', observation: <summary of all classifications>, gaps: 'none' or <remaining unknowns>, next_action: 'return final triage result' })
7. Return structured summary.

If search_it_processes returns 0 results:
- reflect({ phase: 'reason', observation: 'no process found for query X', gaps: 'correct category unknown', next_action: 'retry with synonym Y' })
- Retry with a synonym before proceeding.

## Rules:
- ALWAYS use search_it_processes first — never assume you know the process steps
- ALWAYS use local triage tools for classification — never guess severity or team assignment
- Call MULTIPLE tools in PARALLEL when they are independent
- If a tool returns empty or unexpected data, reason about it before deciding the next step
- Be thorough but concise in your final summary
- Include all structured data (severity, team, SLA, approval requirements) in your response`;

// --- Agent Factory ---

/**
 * Run the IT triage agent for a given query.
 * Creates a fresh ToolLoopAgent per invocation with current MCP tools.
 */
export async function runTriageAgent({ query, employeeId }) {
  const mcpTools = await getMCPTools();

  const tools = {
    ...mcpTools,
    search_it_processes: searchItProcesses,
    get_it_process: getItProcess,
    list_it_processes: listItProcesses,
    classify_severity: classifySeverity,
    assign_team: assignTeam,
    check_approval_required: checkApprovalRequired,
    reflect,
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
    },
    onToolExecutionEnd: ({ toolCall, durationMs, success, error }) => {
      if (success) {
        console.log(`[it-triage] Tool done: ${toolCall.toolName} (${durationMs}ms)`);
      } else {
        console.error(`[it-triage] Tool error: ${toolCall.toolName} (${durationMs}ms): ${error}`);
      }
    },
    onEnd: ({ steps }) => {
      console.log(`[it-triage] Agent finished in ${steps.length} steps`);
    },
  });

  const result = await agent.generate({ prompt: query });
  return result.text;
}


