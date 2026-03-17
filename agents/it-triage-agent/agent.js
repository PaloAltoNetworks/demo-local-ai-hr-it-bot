/**
 * IT Triage Agent — ToolLoopAgent with local business logic + MCP data tools
 *
 * MCP on the outside, ToolLoopAgent on the inside.
 * - Local tools: classify severity, check SLA, assign team, check approval, IT process lookup
 * - MCP tools via LiteLLM /mcp: hr-tools (get_employee, get_employee_assets)
 *   and it-tools (get_ticket, search_tickets, create_ticket, etc.)
 * - LLM via LiteLLM /v1 (OpenAI-compatible)
 */
import { ToolLoopAgent, tool, stepCountIs } from 'ai';
import { createMCPClient } from '@ai-sdk/mcp';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Configuration ---

const LITELLM_BASE_URL = process.env.LITELLM_BASE_URL || 'http://localhost:8080';
const LITELLM_API_KEY = process.env.LITELLM_API_KEY || 'sk-1234';
const MODEL_ID = process.env.IT_TRIAGE_MODEL || process.env.CHATBOT_V2_MODEL || 'eu.anthropic.claude-opus-4-6-v1';
const MCP_URL = process.env.MCP_URL || `${LITELLM_BASE_URL}/mcp/`;

// --- IT Process Data (local — agent owns this domain) ---

const IT_PROCESSES = JSON.parse(readFileSync(join(__dirname, 'it-processes.json'), 'utf-8'));

// --- LLM Provider ---

const openai = createOpenAI({
  baseURL: `${LITELLM_BASE_URL}/v1`,
  apiKey: LITELLM_API_KEY,
});

// --- MCP Client (for consuming hr-tools + it-tools via LiteLLM) ---

let mcpClient = null;

export async function initMCPClient() {
  try {
    const connectPromise = createMCPClient({
      transport: {
        type: 'http',
        url: MCP_URL,
        headers: {
          'Authorization': `Bearer ${LITELLM_API_KEY}`,
          'x-litellm-api-key': `Bearer ${LITELLM_API_KEY}`,
        },
      },
    });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('MCP connection timeout (15s)')), 15000)
    );
    mcpClient = await Promise.race([connectPromise, timeoutPromise]);
    console.log(`[it-triage] MCP client connected: ${MCP_URL}`);
  } catch (err) {
    console.error(`[it-triage] Failed to connect MCP client: ${err.message}`);
  }
}

export async function closeMCPClient() {
  try { await mcpClient?.close(); } catch (_) {}
}

/**
 * Get MCP tools from LiteLLM, filtered to only include data tools
 * (hr-tools, it-tools). Excludes the agent's own tools to prevent recursion.
 */
async function getMCPTools() {
  if (!mcpClient) return {};
  try {
    const allTools = await mcpClient.tools();
    // Only keep tools from data servers — exclude this agent's own tools to prevent recursion
    const filtered = {};
    for (const [name, t] of Object.entries(allTools)) {
      // LiteLLM prefixes with server name: "it_triage_agent-triage_it_request"
      if (!name.includes('it_triage_agent')) {
        filtered[name] = t;
      }
    }
    return filtered;
  } catch (err) {
    console.warn(`[it-triage] MCP tools unavailable: ${err.message}`);
    return {};
  }
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

const checkSlaCompliance = tool({
  description: 'Check if an existing ticket is within its SLA target based on severity and creation date.',
  inputSchema: z.object({
    severity: z.enum(['Critical', 'High', 'Medium', 'Low']).describe('Ticket severity'),
    createdAt: z.string().describe('Ticket creation timestamp (ISO 8601)'),
  }),
  execute: async ({ severity, createdAt }) => {
    const slaTargets = { Critical: 1, High: 4, Medium: 24, Low: 72 };
    const slaHours = slaTargets[severity];
    const elapsed = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60);
    const withinSla = elapsed <= slaHours;
    return {
      severity,
      slaHours,
      elapsedHours: Math.round(elapsed * 10) / 10,
      withinSla,
      status: withinSla ? 'Within SLA' : 'SLA BREACHED',
    };
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

const TRIAGE_INSTRUCTIONS = `You are an IT Triage Agent — a specialized assistant that handles IT support requests with structured reasoning.

You have access to three types of tools:
1. LOCAL PROCESS TOOLS (search_it_processes, get_it_process, list_it_processes) — look up IT process definitions, steps, and requirements
2. LOCAL TRIAGE TOOLS (classify_severity, check_sla_compliance, assign_team, check_approval_required) — deterministic business logic for evaluating and routing IT requests
3. MCP DATA TOOLS (prefixed with server names) — for reading actual data (employees, tickets, assets)

WORKFLOW for triage requests:
1. Search the IT process for the request type using search_it_processes
2. Get the employee's profile and assets in parallel via MCP data tools (get_employee + get_employee_assets)
3. Use classify_severity to determine urgency based on the category and description
4. Use check_approval_required to see if manager approval is needed
5. Use assign_team to route to the right support team
6. Return a structured summary with all findings

WORKFLOW for SLA checks:
1. Get the ticket details via MCP data tools (get_ticket)
2. Use check_sla_compliance with the ticket's severity and creation date
3. Return SLA status and recommended actions

RULES:
- ALWAYS use search_it_processes first to find the relevant IT process — this is your own local data
- ALWAYS use your local triage tools to classify and route — never guess severity or team assignment
- Call MULTIPLE tools in PARALLEL when they are independent
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
    check_sla_compliance: checkSlaCompliance,
    assign_team: assignTeam,
    check_approval_required: checkApprovalRequired,
  };

  const instructions = `${TRIAGE_INSTRUCTIONS}

The requesting employee's ID is ${employeeId}. Use this ID when looking up employee data.`;

  const agent = new ToolLoopAgent({
    model: openai.chat(MODEL_ID),
    instructions,
    tools,
    stopWhen: stepCountIs(10),
    experimental_onToolCallStart: ({ toolCall }) => {
      console.log(`[it-triage] Tool call: ${toolCall.toolName}(${JSON.stringify(toolCall.args).substring(0, 120)})`);
    },
    experimental_onToolCallFinish: ({ toolCall, durationMs, success, error }) => {
      if (success) {
        console.log(`[it-triage] Tool done: ${toolCall.toolName} (${durationMs}ms)`);
      } else {
        console.error(`[it-triage] Tool error: ${toolCall.toolName} (${durationMs}ms): ${error}`);
      }
    },
    onFinish: ({ steps }) => {
      console.log(`[it-triage] Agent finished in ${steps.length} steps`);
    },
  });

  const result = await agent.generate({ prompt: query });
  return result.text;
}

/**
 * Run SLA check for a specific ticket.
 */
export async function runSlaCheck({ ticketId }) {
  const mcpTools = await getMCPTools();

  const tools = {
    ...mcpTools,
    check_sla_compliance: checkSlaCompliance,
  };

  const agent = new ToolLoopAgent({
    model: openai.chat(MODEL_ID),
    instructions: `${TRIAGE_INSTRUCTIONS}\n\nYou are checking the SLA status of ticket ${ticketId}. Get the ticket details and run check_sla_compliance.`,
    tools,
    stopWhen: stepCountIs(5),
    onFinish: ({ steps }) => {
      console.log(`[it-triage] SLA check finished in ${steps.length} steps`);
    },
  });

  const result = await agent.generate({
    prompt: `Check the SLA compliance status of ticket ${ticketId}`,
  });
  return result.text;
}

