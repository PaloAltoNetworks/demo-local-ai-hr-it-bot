/**
 * Chatbot V2 — AI SDK Native Backend
 * Uses a ToolLoopAgent streamed with pipeAgentUIStreamToResponse (AI SDK's native UI protocol).
 * MCP tools fetched from Portkey MCP Gateway (one client per registered server).
 * Frontend: React + useChat (consumes the data stream automatically).
 */
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { ToolLoopAgent, pipeAgentUIStreamToResponse, isStepCount, isToolUIPart, getToolName, tool } from 'ai';
import { z } from 'zod';
import { createMCPClient } from '@ai-sdk/mcp';
import { createOpenAI } from '@ai-sdk/openai';
import { USER_TOKENS_ENABLED, userToken, forgetUserToken, agentToken, setPersona, personas } from './user-token.js';

const DEBUG = process.env.LOG_LEVEL === 'debug';
function dbg(msg) { if (DEBUG) console.log(msg); }

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.CHATBOT_V2_PORT || 3018;

// --- Configuration ---

const PORTKEY_BASE_URL = process.env.PORTKEY_BASE_URL || 'https://api.portkey.ai/v1';
/**
 * Gateway authentication, two modes:
 * - API keys (default): two workspace keys, each carrying its own Portkey config.
 *   PORTKEY_API_KEY is default/unguarded (config may enable response caching),
 *   PORTKEY_API_KEY_GUARDED is guarded (config attaches PANW Prisma AIRS input+output hooks).
 *   Guarded requests (phase3) swap to the guarded key; everything else uses the default one.
 * - User tokens (OAUTH_SERVER_URL set, see user-token.js): every LLM request of a turn carries
 *   the signed-in user's auth-service token instead of a key, so gateway logs name the persona.
 *   MCP requests carry the user's token in protected mode (phase3), where the gateway and the
 *   MCP servers enforce the user's rights; in phases 1-2 and outside a turn they carry the
 *   chatbot's own token, a service account with full scopes (the user's identity stops at the
 *   chatbot). A JWT has no attached config, so the same two configs ride
 *   in x-portkey-config: PORTKEY_CONFIG (unguarded) and PORTKEY_CONFIG_GUARDED (guarded,
 *   required: a guarded request without it is refused rather than sent unguarded). Only the
 *   feedback endpoint still uses PORTKEY_API_KEY.
 */
const PORTKEY_API_KEY = process.env.PORTKEY_API_KEY || '';
const PORTKEY_API_KEY_GUARDED = process.env.PORTKEY_API_KEY_GUARDED || PORTKEY_API_KEY;
const PORTKEY_CONFIG = process.env.PORTKEY_CONFIG || '';
const PORTKEY_CONFIG_GUARDED = process.env.PORTKEY_CONFIG_GUARDED || '';

/**
 * Credential and config for one gateway request. With user tokens the turn's token replaces
 * the key and the config travels in a header; in key mode the key's attached config applies.
 * @param {boolean} guarded phase3 request that must go through the AIRS guardrails
 * @param {string} [token] the turn's user token
 * @returns {{ apiKey: string, config: string }}
 */
function gatewayCredential(guarded, token) {
  if (!USER_TOKENS_ENABLED) {
    return { apiKey: guarded ? PORTKEY_API_KEY_GUARDED : PORTKEY_API_KEY, config: '' };
  }
  if (guarded && !PORTKEY_CONFIG_GUARDED) {
    throw new Error('PORTKEY_CONFIG_GUARDED is required for guarded requests with user tokens');
  }
  return { apiKey: token, config: guarded ? PORTKEY_CONFIG_GUARDED : PORTKEY_CONFIG };
}

/**
 * How a turn reached the gateway, for the message action bar: the user (persona) and the agent
 * (the token's actor) of the token and whose identity the tool calls carried, or the API key.
 * @param {boolean} guarded protected mode, where tool calls carry the user's token
 */
function gatewayAuthInfo(user, guarded) {
  return USER_TOKENS_ENABLED
    ? {
        mode: 'user-token', name: user.name, email: user.email, persona: user.persona, groups: user.groups,
        login: user.login, agent: user.agent, toolsAs: guarded ? 'user' : 'agent',
      }
    : { mode: 'api-key' };
}
/**
 * Saved AI Gateway configs for the Load balance & fallback provider, one per model tier: a
 * top-level load balancer (what gateway logs report) over fallback chains across AWS, GCP and
 * Azure. The SCM gateway blocks inline configs but accepts a saved config slug in
 * x-portkey-config, which replaces the key's default config for that request, so the guarded
 * variants carry the AIRS guardrails themselves. The provider is offered only when both
 * unguarded slugs are set.
 */
const AUTO_CONFIGS = {
  fast: process.env.PORTKEY_AUTO_FAST_CONFIG || '',
  powerful: process.env.PORTKEY_AUTO_POWERFUL_CONFIG || '',
};
const AUTO_CONFIGS_GUARDED = {
  fast: process.env.PORTKEY_AUTO_FAST_CONFIG_GUARDED || AUTO_CONFIGS.fast,
  powerful: process.env.PORTKEY_AUTO_POWERFUL_CONFIG_GUARDED || AUTO_CONFIGS.powerful,
};
const AUTO_CONFIGURED = Boolean(AUTO_CONFIGS.fast && AUTO_CONFIGS.powerful);
const AWS_PROVIDER = process.env.PORTKEY_AWS_PROVIDER || '@bedrock-prod';
const GCP_PROVIDER = process.env.PORTKEY_GCP_PROVIDER || '@vertex-prod';
const AZURE_PROVIDER = process.env.PORTKEY_AZURE_PROVIDER || '@azure';
// Default provider tier (AWS | GCP | Azure | Auto) — preselected in the UI and used when a
// request sends none. Auto when its gateway config is set, AWS otherwise. MODEL_ID (display
// only) is derived from it.
const DEFAULT_PROVIDER = process.env.PORTKEY_DEFAULT_PROVIDER || (AUTO_CONFIGURED ? 'Auto' : 'AWS');

// Portkey MCP Gateway — one endpoint per registered server (no single aggregator)
const PORTKEY_MCP_BASE = process.env.PORTKEY_MCP_BASE || 'https://mcp.portkey.ai';
// Every PORTKEY_MCP_*_SLUG env var becomes an MCP client — add a new server by
// adding an env var, no code change. (PORTKEY_MCP_BASE is excluded by the _SLUG suffix.)
const MCP_SLUGS = Object.entries(process.env)
  .filter(([k, v]) => /^PORTKEY_MCP_.+_SLUG$/.test(k) && v)
  .map(([, v]) => v);
const MCP_URLS = MCP_SLUGS.map(slug => `${PORTKEY_MCP_BASE}/${slug}/mcp`);

/** The user when the chatbot runs without user tokens (local docker compose): one fixed employee. */
const DEFAULT_USER = { persona: 'EMP-034', employee_id: 'EMP-034', name: 'Aurélien Girard' };

/**
 * The user of a request: the persona their auth-service token carries (id, employee_id for
 * employees, name, email, groups), the signed-in account behind it (login) and the agent acting
 * for them (the token's actor, act.sub, else the OAuth client), or DEFAULT_USER without user
 * tokens. `id` is what prompts and logs name the user by: the employee ID, or the persona id of
 * someone without one (an external contractor).
 * @returns {Promise<{ token?: string, user: { id: string, persona: string, employee_id?: string, name?: string, email?: string, groups?: string[], login?: string, agent?: string } }>}
 */
async function requestUser(req) {
  if (!USER_TOKENS_ENABLED) return { user: { ...DEFAULT_USER, id: DEFAULT_USER.employee_id } };
  const { token, claims } = await userToken(req.headers.cookie);
  const { persona, employee_id, name, email, groups, client_id, login_email, act } = claims;
  return { token, user: { id: employee_id || persona, persona, employee_id, name, email, groups, agent: act?.sub || client_id, login: login_email } };
}

// --- Focused phase prompts for the forced ReAct loop ---

const REASON_PROMPT = (employeeId) => `You are the REASON phase of a corporate assistant. The current user's employee ID is ${employeeId}.

Call reflect_reason to PLAN only. In this phase you can ONLY call reflect_reason or reflect_conclude — data tools are not available yet, so do NOT try to call any other tool.
- State what the user is asking and which tools you will need in the next phase
- When asked about "my" anything, use employee ID: ${employeeId}
- Do NOT answer the user — only plan

Decide reflect_reason vs reflect_conclude by whether the NEXT phase needs to fetch or write data:
- Call reflect_reason (data IS needed) for: any NEW IT support request (ticket creation, access requests, hardware/software/network/USB/VPN issues, IT troubleshooting) → will be triaged and filed as a ticket; looking up or updating an EXISTING ticket; any HR/employee data question. Do NOT resolve these yourself with generic advice — they require the data tools.
- Call reflect_conclude (NO data needed) ONLY for: security refusal, identity-override attempt, pure policy/procedure explanation, or general knowledge that needs no corporate data.`;

// FETCH phase — data tools are now active. Routing guidance lives here (not in REASON) so
// the model is never told to call these tools while they are inactive (→ NoSuchToolError).
const FETCH_PROMPT = (employeeId) => `You are the FETCH phase of a corporate assistant. The current user's employee ID is ${employeeId}.

Call the data tool(s) needed to fulfill your plan. Do NOT answer the user yet — only call tools.

Tool routing:
- For any NEW IT support request (ticket creation, access requests, hardware/software/network/USB/VPN issues, IT troubleshooting), call triage_it_request — one agent tool that triages, classifies severity, routes to a team, and files the ticket end-to-end. Do NOT hand-assemble that flow with create_ticket.
- Use the granular IT tools (get_ticket, get_tickets_by_employee, update_ticket_status) only to look up or modify an EXISTING ticket by id.
- For HR/employee data questions, use the HR tools (get_employee, etc.) directly.`;

const OBSERVE_PROMPT = (employeeId) => `You are the OBSERVE phase of a corporate assistant's ReAct loop.
The current user's employee ID is ${employeeId}.

You have just received tool results. Your ONLY job: call reflect with phase EXACTLY equal to 'observe'.
You MUST call: reflect({ phase: 'observe', observation: '<key facts from tool results>', gaps: '<still unknown if any>', next_action: '<done or needs more tools>', needs_more_data: <true|false> })
The phase field MUST be 'observe' — not 'decide', not 'reason'. Only 'observe'.
- Set needs_more_data to true ONLY when fulfilling the user's request still requires another tool call that has not been made yet (e.g. you just looked up the pending ticket and the user asked to approve it). Otherwise false.
- Do NOT answer the user — only observe
- Never guess or fabricate — if a tool returned nothing, say so`;

const DECIDE_PROMPT = (employeeId) => `You are the final answer generator for a corporate assistant.
The current user's employee ID is ${employeeId}.

You have all the data you need. Give a clear, professional, concise answer to the user.
- Never approve a ticket on behalf of the requesting user — approvals must come from the designated approver
- Be professional, concise, and helpful
- Do NOT call any tools — answer directly`;

// --- LLM ---

const AIRS_TSG_ID = process.env.PRISMA_AIRS_TSG_ID || '';
const AIRS_APP_ID = process.env.PRISMA_AIRS_APP_ID || '';

// Gateway observability deep links. Strata Cloud Manager needs the workspace and the
// deployment (surfaced as `licenseId`) to resolve a log; standalone Portkey needs the org.
const GW_WORKSPACE_ID = process.env.PORTKEY_WORKSPACE_ID || '';
const GW_DEPLOYMENT_ID = process.env.PORTKEY_DEPLOYMENT_ID || '';
const GW_ORG_ID = process.env.PORTKEY_ORG_ID || '';

/** Maximum FETCH → OBSERVE rounds per request (e.g. a lookup followed by a write). */
const MAX_FETCH_ROUNDS = 3;

// Tools that mutate state — require explicit user approval before execution
const TOOLS_REQUIRING_APPROVAL = ['create_ticket', 'update_ticket_status'];

// Provider → fast (Reason/Observe) + powerful (Decide) model tiers.
// Model IDs use Portkey's @provider-slug/model format.
// Each fast/powerful tier is env-overridable (PORTKEY_{AWS,GCP,AZURE}_{FAST,POWERFUL})
// so a workspace with different provider slugs/models can be pointed at without code changes.
const PROVIDER_TIERS = {
  AWS: {
    label: 'AWS Bedrock',
    fast:     process.env.PORTKEY_AWS_FAST     || `${AWS_PROVIDER}/eu.anthropic.claude-haiku-4-5-20251001-v1:0`,
    powerful: process.env.PORTKEY_AWS_POWERFUL || `${AWS_PROVIDER}/global.anthropic.claude-sonnet-5-5`,
  },
  GCP: {
    label: 'GCP Vertex AI',
    fast:     process.env.PORTKEY_GCP_FAST     || `${GCP_PROVIDER}/anthropic.claude-haiku-4-5`,
    powerful: process.env.PORTKEY_GCP_POWERFUL || `${GCP_PROVIDER}/anthropic.claude-sonnet-5-5`,
  },
  Azure: {
    label: 'Azure AI Foundry',
    fast:     process.env.PORTKEY_AZURE_FAST     || `${AZURE_PROVIDER}/claude-haiku-4-5`,
    powerful: process.env.PORTKEY_AZURE_POWERFUL || `${AZURE_PROVIDER}/claude-sonnet-5-5`,
  },
};

/**
 * Auto tier: the model strings are the chain's primary (AWS) targets, used for logs and pricing;
 * the saved config overrides the model on whichever target actually serves the call.
 */
if (AUTO_CONFIGURED) {
  PROVIDER_TIERS.Auto = { ...PROVIDER_TIERS.AWS, label: 'Load balance & fallback', auto: true };
}

// Display/fallback model id, derived from the default provider's powerful tier.
const MODEL_ID = (PROVIDER_TIERS[DEFAULT_PROVIDER] || PROVIDER_TIERS.AWS).powerful;

// Phase-locked reflect tools — instantiated per-agent so execute() can emit stepMs.
// stepStartRef.current is set by prepareStep just before each step runs.
function makeReflectTools(stepStartRef) {
  const make = (phaseName, extra = {}) => tool({
    description: `Record your ${phaseName} step.`,
    inputSchema: z.object({
      observation: z.string().describe('What did you observe or decide?'),
      gaps: z.string().describe('What is still unknown?'),
      next_action: z.string().describe('What will you do next?'),
      ...extra,
    }),
    execute: async () => {
      const stepMs = stepStartRef.current ? Date.now() - stepStartRef.current : null;
      return { phase: phaseName, acknowledged: true, stepMs };
    },
  });
  const conclude = tool({
    description: 'Signal that no data tools are needed — the answer can be given directly. Use when the request can be answered without fetching any data (e.g. security refusal, policy clarification, identity override attempt).',
    inputSchema: z.object({
      reason: z.string().describe('Why no data tools are needed'),
    }),
    execute: async () => {
      const stepMs = stepStartRef.current ? Date.now() - stepStartRef.current : null;
      return { phase: 'conclude', acknowledged: true, stepMs };
    },
  });
  const needsMoreData = {
    needs_more_data: z.boolean().describe('True if the request still needs another data tool call (e.g. a write after a lookup)'),
  };
  return { reflect_reason: make('reason'), reflect_observe: make('observe', needsMoreData), reflect_conclude: conclude };
}

// Injects Portkey auth, user identity, and thread trace into every request.
// The guardrail/cache config rides on the API key itself, so guarded requests just
// use the guarded key. reqCtx is captured per-request to avoid cross-request contamination.
function portkeyFetch(reqCtx, guarded = false, noParallel = false, spanName = '') {
  return async (url, init) => {
    const headers = new Headers(init?.headers);
    const cred = gatewayCredential(guarded, reqCtx.token);
    headers.set('x-portkey-api-key', cred.apiKey);
    if (USER_TOKENS_ENABLED) headers.delete('authorization');
    if (cred.config) headers.set('x-portkey-config', cred.config);
    headers.set('x-portkey-trace-id', reqCtx.traceId);
    // Every phase otherwise logs as span_name "llm", so a turn reads as N identical rows.
    // Phases run in sequence, not nested, so they stay siblings — no parent_span_id.
    if (spanName) {
      const spanId = crypto.randomBytes(8).toString('hex');
      headers.set('x-portkey-span-name', spanName);
      headers.set('x-portkey-span-id', spanId);
      // Tool calls are emitted by the LLM step that runs just before them (the FETCH phase),
      // so the latest span is the right parent for the MCP calls that follow.
      reqCtx.lastSpanId = spanId;
    }
    let model = '';
    if (init?.body) {
      const body = JSON.parse(init.body);
      body.user = reqCtx.user.id;
      model = body.model || '';
      if (noParallel) {
        body.parallel_tool_calls = false;
      }
      // Bedrock errors if tool_choice is present but tools is empty/absent
      if (body.tool_choice && (!body.tools || body.tools.length === 0)) {
        delete body.tool_choice;
      }
      init = { ...init, body: JSON.stringify(body) };
      dbg(`[llm] → ${model} | msgs:${body.messages?.length ?? 0} tools:${body.tools?.length ?? 0}`);
    }
    if (reqCtx.tiers.auto) {
      const tier = model === reqCtx.tiers.fast ? 'fast' : 'powerful';
      headers.set('x-portkey-config', (guarded ? AUTO_CONFIGS_GUARDED : AUTO_CONFIGS)[tier]);
    }
    // Metadata feeds Portkey observability and the AIRS guardrail params
    // (ai_model={{metadata.model}}, app_user={{metadata._user}}).
    // With a JWT the gateway overwrites _user with the token's identity, so the employee also
    // rides in employee_id, a key the gateway leaves alone.
    // Keep it STABLE: metadata is part of the simple-cache key, so per-request volatile
    // values (thread_id, user_ip) would bust every cache lookup. The thread trace lives in
    // the x-portkey-trace-id header (not a cache-key field), so grouping is unaffected.
    headers.set('x-portkey-metadata', JSON.stringify({
      _user: reqCtx.user.email || reqCtx.user.id,
      employee_id: reqCtx.user.id,
      login_email: reqCtx.user.login,
      agent_id: reqCtx.user.agent,
      app_name: 'The Otter V2',
      model,
    }));
    return fetch(url, { ...init, headers });
  };
}

// --- Model pricing (Portkey pricing JSON → per-token cents) ---
// cost_cents = input*request_token.price + output*response_token.price (verified: the
// price values ARE cents-per-token). Cached per process on first use.
const PROVIDER_PRICING_ID = { aws: 'bedrock', gcp: 'vertex-ai', azure: 'azure-ai' };
const pricingCache = new Map(); // key: "@provider/model" → { in, out } | null

/**
 * Per-token price for a tier model from Portkey's pricing catalog.
 *
 * Looks up the provider catalog first. Claude models missing there (Portkey lists Haiku 4.5
 * under `anthropic` only) fall back to the `anthropic` catalog, with the provider's region
 * prefix, `anthropic.` namespace and Bedrock version suffix stripped.
 * ponytail: anthropic list price, ignores the ~10% premium of regional Bedrock/Vertex
 * endpoints; add a per-provider multiplier if exact cost matters.
 *
 * @param {string} tierModel Portkey model string, e.g. "@azure/claude-haiku-4-5"
 * @returns {Promise<{ in: number, out: number }>} cents per input/output token
 */
async function fetchPrice(tierModel) {
  const at = tierModel.replace(/^@/, '');
  const slash = at.indexOf('/');
  const providerSlug = at.slice(0, slash);
  const model = at.slice(slash + 1);
  const pricingId = PROVIDER_PRICING_ID[providerSlug] || providerSlug;
  const lookup = (id, m) => fetch(`https://api.portkey.ai/model-configs/pricing/${id}/${encodeURIComponent(m)}`);
  let resp = await lookup(pricingId, model);
  if (resp.status === 404 && model.includes('claude')) {
    resp = await lookup('anthropic', model.replace(/^(eu|us|apac|global)\./, '').replace(/^anthropic\./, '').replace(/-v\d+:\d+$/, ''));
  }
  if (!resp.ok) throw new Error(`pricing ${resp.status}`);
  const p = await resp.json();
  return {
    in: p?.pay_as_you_go?.request_token?.price ?? 0,
    out: p?.pay_as_you_go?.response_token?.price ?? 0,
  };
}

async function ensurePrice(tierModel) {
  if (!tierModel) return null;
  if (pricingCache.has(tierModel)) return pricingCache.get(tierModel);
  try {
    const price = await fetchPrice(tierModel);
    pricingCache.set(tierModel, price);
    return price;
  } catch (err) {
    dbg(`[pricing] ${tierModel}: ${err.message}`);
    pricingCache.set(tierModel, null);
    return null;
  }
}

// Cost breakdown in USD from per-model token usage, using cached prices.
// Returns { total, input, output } or null if no model was priced.
function computeCost(perModelUsage) {
  let inCents = 0, outCents = 0, priced = false;
  for (const [model, u] of Object.entries(perModelUsage)) {
    const price = pricingCache.get(model);
    if (!price) continue;
    inCents  += (u.inputTokens  || 0) * price.in;
    outCents += (u.outputTokens || 0) * price.out;
    priced = true;
  }
  if (!priced) return null;
  return { total: (inCents + outCents) / 100, input: inCents / 100, output: outCents / 100 };
}

function getModel(modelId, reqCtx, guarded = false, noParallel = false, spanName = '') {
  const provider = createOpenAI({
    baseURL: PORTKEY_BASE_URL,
    apiKey: USER_TOKENS_ENABLED ? 'user-token' : PORTKEY_API_KEY,
    fetch: portkeyFetch(reqCtx, guarded, noParallel, spanName),
  });
  return provider.chat(modelId || MODEL_ID);
}

// --- MCP Clients (Portkey MCP Gateway — one client per registered server) ---

// MCP clients are long-lived and shared across requests, so their transport headers are
// fixed at connect time and cannot carry the current turn's identity. The transport's
// fetch hook reads the active turn from here instead.
const mcpCtx = new AsyncLocalStorage();

let mcpClients = [];

async function connectMCP(url) {
  const connectPromise = createMCPClient({
    transport: {
      type: 'http',
      url,
      headers: USER_TOKENS_ENABLED ? {} : { 'x-portkey-api-key': PORTKEY_API_KEY },
      // v7 flipped the default to 'error'; Portkey MCP Gateway relies on redirects.
      redirect: 'follow',
      // Full span set so a tool call can nest under the LLM span that emitted it. As of
      // this writing the MCP gateway drops these and mints its own trace per tools/call
      // (metadata is the one thing it keeps), so thread_id also rides in the metadata:
      // filtering MCP logs on it recovers the tool calls of a conversation either way.
      // Every request of the transport (initialize, tools/*, the SSE GET, the closing DELETE)
      // goes through this hook: in a protected turn it carries the user's token, otherwise the
      // chatbot's own. The gateway authenticates x-portkey-api-key and checks the MCP server's
      // jwt_validation rule on Authorization, so the token goes in both.
      fetch: async (fetchUrl, init) => {
        const headers = new Headers(init?.headers);
        const reqCtx = mcpCtx.getStore();
        if (USER_TOKENS_ENABLED) {
          const token = reqCtx?.guarded ? reqCtx.token : (await agentToken()).token;
          headers.set('x-portkey-api-key', token);
          headers.set('authorization', `Bearer ${token}`);
        }
        if (!reqCtx) return fetch(fetchUrl, { ...init, headers });
        headers.set('x-portkey-trace-id', reqCtx.traceId);
        headers.set('x-portkey-span-id', crypto.randomBytes(8).toString('hex'));
        headers.set('x-portkey-span-name', 'mcp-tool-call');
        // Parent = the LLM span whose tool call triggered this request.
        if (reqCtx.lastSpanId) headers.set('x-portkey-parent-span-id', reqCtx.lastSpanId);
        headers.set('x-portkey-metadata', JSON.stringify({
          _user: reqCtx.user.email || reqCtx.user.id,
          employee_id: reqCtx.user.id,
          login_email: reqCtx.user.login,
          agent_id: reqCtx.user.agent,
          app_name: 'The Otter V2',
          thread_id: reqCtx.threadId,
        }));
        return fetch(fetchUrl, { ...init, headers });
      },
    },
  });
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Connection timeout (15s)')), 15000)
  );
  return Promise.race([connectPromise, timeoutPromise]);
}

// Connect any configured MCP_URL that has no live client yet (boot, or after a drop).
// Returns the number of URLs still unconnected afterwards.
async function reconnectMissingClients() {
  const connected = new Set(mcpClients.map(e => e.url));
  const missing = MCP_URLS.filter(url => !connected.has(url));
  await Promise.all(missing.map(async (url) => {
    try {
      const client = await connectMCP(url);
      mcpClients.push({ url, client });
      console.log(`MCP client connected: ${url}`);
    } catch (err) {
      console.error(`Failed to connect MCP client ${url}: ${err.message}`);
    }
  }));
  return MCP_URLS.length - mcpClients.length;
}

// Tool lists are static per session but each tools/list is a Portkey MCP cloud round-trip
// (~5-6s each). Fetching them on every chat request added ~15s before the agent could even
// emit its first `start` frame. Cache the merged map after the first successful load and
// fetch all clients in parallel; refresh() re-warms it.
let cachedTools = null;

/**
 * MCP server of each tool (tool name → server name), for the tool cards of the chat: the gateway
 * slug without its random suffix ("…/hr-tools-ed99dd/mcp" → "hr-tools"), or the host of a direct URL.
 */
let toolServers = {};

/**
 * What the LLM sees of an MCP tool result: the text of its content, not the MCP envelope
 * ({ content: [{ type: 'text', text }], isError }). In protected mode the guardrail scans the
 * prompt, and its topic allow-list does not recognize HR or IT data escaped inside that
 * envelope (topic_violation), while it does as plain text. A result flagged isError goes as error-text.
 */
const mcpModelOutput = ({ output }) => {
  const text = Array.isArray(output?.content)
    ? output.content.filter((c) => c?.type === 'text').map((c) => c.text).join('\n')
    : JSON.stringify(output);
  return { type: output?.isError ? 'error-text' : 'text', value: text };
};
/** Errors of an MCP session the server or the gateway no longer knows (it restarted). */
const STALE_SESSION = /restore session|reinitialize|not initialized|session not found/i;

/**
 * Wraps an MCP tool's execute: a call on a session the server no longer knows reconnects that
 * server, reloads the tool cache and runs once more on the fresh client (no second retry).
 */
function recoverSession(url, name, execute) {
  const wrapped = async (args, options) => {
    try {
      return await execute(args, options);
    } catch (err) {
      if (!STALE_SESSION.test(err.message)) throw err;
      console.warn(`[mcp] ${name}: session lost on ${url} (${err.message}), reconnecting`);
      await reconnectClient(url);
      const fresh = cachedTools?.[name]?.execute;
      if (!fresh) throw err;
      return (fresh.raw || fresh)(args, options);
    }
  };
  wrapped.raw = execute;
  return wrapped;
}

/** Calls reconnecting one server share a single reconnection. */
const reconnecting = new Map();

/** Replaces the client of one MCP server with a fresh connection, then reloads the tool cache. */
function reconnectClient(url) {
  if (!reconnecting.has(url)) {
    reconnecting.set(url, (async () => {
      const stale = mcpClients.find((e) => e.url === url);
      mcpClients = mcpClients.filter((e) => e.url !== url);
      await stale?.client.close().catch(() => {});
      await reconnectMissingClients();
      const { merged } = await loadMCPTools();
      if (Object.keys(merged).length > 0) cachedTools = merged;
    })().finally(() => reconnecting.delete(url)));
  }
  return reconnecting.get(url);
}

const mcpServerName = (url) => {
  const { pathname, hostname } = new URL(url);
  return (pathname.split('/').filter(Boolean).at(-2) || hostname).replace(/-[0-9a-f]{6}$/, '');
};

// Loads tools from every live client in parallel. A client whose tools/list fails is dropped
// from mcpClients so reconnectMissingClients() retries a fresh connection next cycle. Returns
// the merged map plus the count of clients that failed this pass.
async function loadMCPTools() {
  if (mcpClients.length === 0) return { merged: {}, failed: 0 };
  const merged = {};
  const servers = {};
  let failed = 0;
  const results = await Promise.all(mcpClients.map(async (entry) => {
    try {
      return { entry, tools: await entry.client.tools() };
    } catch (err) {
      console.warn(`MCP tools unavailable from ${entry.url}: ${err.message}`);
      failed++;
      return { entry, tools: null };
    }
  }));
  // Drop clients that failed so they get reconnected; keep the ones that answered.
  mcpClients = results.filter(r => r.tools !== null).map(r => r.entry);
  for (const { entry, tools } of results) {
    if (!tools) continue;
    // @ai-sdk/mcp v1.0.26+ wraps MCP tools as dynamicTool() by default (type: 'dynamic'),
    // which tells streamText to send them to the client for execution instead of running
    // them server-side. Strip the flag so the execute() function runs on the backend.
    for (const [name, tool] of Object.entries(tools)) {
      if (tool.type === 'dynamic') delete tool.type;
      tool.toModelOutput = mcpModelOutput;
      tool.execute = recoverSession(entry.url, name, tool.execute);
      merged[name] = tool;
      servers[name] = mcpServerName(entry.url);
    }
  }
  if (Object.keys(merged).length > 0) toolServers = servers;
  console.log(`[mcp] tools loaded (${Object.keys(merged).length}): ${Object.keys(merged).join(', ')}`);
  return { merged, failed };
}

async function getMCPTools() {
  if (cachedTools) return cachedTools;
  const { merged } = await loadMCPTools();
  // Only cache a non-empty result so a transient failure doesn't pin an empty tool set.
  if (Object.keys(merged).length > 0) cachedTools = merged;
  return merged;
}

// Self-scheduling refresh: re-warm the tool cache so tool changes surface without a restart.
// Healthy (all servers reachable) → next check in 1h. Degraded (a server unreachable or a
// client dropped) → retry in 1min until it recovers. Swap atomically; never blank a working set.
const TOOLS_REFRESH_HEALTHY_MS = 60 * 60 * 1000; // 1 hour
const TOOLS_REFRESH_DEGRADED_MS = 60 * 1000;     // 1 minute

async function refreshMCPTools() {
  let degraded = false;
  try {
    // Re-establish any client that dropped or never connected before re-listing tools.
    const stillMissing = await reconnectMissingClients();
    const { merged, failed } = await loadMCPTools();
    if (Object.keys(merged).length > 0) cachedTools = merged;
    degraded = stillMissing > 0 || failed > 0;
  } catch (err) {
    console.warn(`[mcp] tool refresh failed, keeping cached set: ${err.message}`);
    degraded = true;
  }
  const delay = degraded ? TOOLS_REFRESH_DEGRADED_MS : TOOLS_REFRESH_HEALTHY_MS;
  if (degraded) console.warn(`[mcp] degraded — retrying tool refresh in ${delay / 1000}s`);
  setTimeout(refreshMCPTools, delay).unref();
}

// --- Middleware ---

app.use(express.json({ limit: '1mb' }));

// Serve React build output
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// --- API Routes ---

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'chatbot-v2',
    timestamp: new Date().toISOString(),
    mcpStatus: mcpClients.length > 0 ? 'connected' : 'disconnected',
    mcpUrls: MCP_URLS,
    model: MODEL_ID,
    auth: USER_TOKENS_ENABLED ? 'user-token' : 'api-key',
  });
});

// Extract structured guardrail detail from Portkey's hook_results (HTTP 446).
// Returns a JSON string the frontend parses into a guardrail_violation error, or null.
function parseGuardrailBlock(parsed) {
  const hooks = parsed?.hook_results;
  if (!hooks) return null;
  const before = (hooks.before_request_hooks || []).find(h => h.verdict === false);
  const after = (hooks.after_request_hooks || []).find(h => h.verdict === false);
  const hook = before || after;
  if (!hook) return null;
  const data = hook.checks?.find(c => c.data)?.data || {};
  const isResponse = !before && !!after;
  return JSON.stringify({
    type: 'guardrail_violation',
    tr_id: data.tr_id || data.session_id || '',
    prompt_detected: isResponse ? undefined : data.prompt_detected,
    response_detected: isResponse ? (data.response_detected || {}) : undefined,
    isResponseBlock: isResponse,
    usage: parsed?.usage || undefined,
    message: parsed?.error?.message || 'Request blocked by guardrail',
  });
}

function normalizeError(err, modelId) {
  const apiError = err.lastError || err;
  const body = apiError?.responseBody || '';
  let summary = err.message || String(err);
  try {
    const p = JSON.parse(body);
    const guardrail = parseGuardrailBlock(p);
    if (guardrail) return guardrail;
    summary = p?.error?.message || summary;
  } catch {}
  const isNetwork = summary.includes('NameResolutionError') || summary.includes('Failed to resolve') ||
    summary.includes('APIConnectionError') || summary.includes('Max retries exceeded') ||
    summary.includes('ECONNREFUSED') || summary.includes('ETIMEDOUT') || summary.includes('ENOTFOUND');
  if (isNetwork) {
    const model = modelId ? ` [${modelId}]` : '';
    return `Provider unreachable${model}: DNS/connection failed. Check credentials and network, or switch provider.`;
  }
  return summary;
}

/**
 * Closes the model input with a user turn asking for the final answer. Without it, Sonnet 5.5
 * regularly ends the ANSWER step on the last tool result with no text (0-3 output tokens).
 * Model input only: the UI message history is unchanged.
 */
const withAnswerTurn = (messages) => [
  ...messages,
  { role: 'user', content: 'Write the final answer to my request now, using the information gathered above.' },
];

/**
 * Build a ToolLoopAgent with prepareStep-driven phase switching.
 * Phase-locked reflect tools enforce correct phase labels — model cannot mislabel.
 *
 * - REASON  reflect_reason forced   (fast model, plans which data tools to call)
 * - FETCH   data tools required     (fast model, executes the data fetch)
 * - OBSERVE reflect_observe forced  (fast model, synthesizes findings, one attempt per round)
 * - ANSWER  no tools                (powerful model, answers directly)
 *
 * FETCH → OBSERVE repeats up to MAX_FETCH_ROUNDS while OBSERVE reports needs_more_data,
 * or calls a tool other than reflect_observe. On an approval continuation (priorRan holds
 * a data tool) the loop resumes at OBSERVE and goes to ANSWER without a new round.
 *
 * @param {object} tiers fast/powerful model ids for the selected provider
 * @param {object} reqCtx per-request trace context
 * @param {object} mcpTools MCP data tools keyed by name
 * @param {boolean} guarded route LLM calls through the guardrail config
 * @param {string[]} approvalToolNames tools that require user approval
 * @param {string[]} stepModels filled with the tier model used at each step number
 * @param {Set<string>} priorRan tools already run earlier in this turn (see priorRanTools)
 */
function buildReactAgent(tiers, reqCtx, mcpTools, guarded, approvalToolNames = [], stepModels = [], priorRan = new Set()) {
  const DATA_TOOL_NAMES = Object.keys(mcpTools);

  // Per-agent step timer — prepareStep sets .current before each LLM call,
  // reflect execute() reads it to emit stepMs.
  const stepStartRef = { current: null };
  const { reflect_reason, reflect_observe, reflect_conclude } = makeReflectTools(stepStartRef);

  // Full tool set: MCP data tools + reason + observe + conclude reflect variants
  const allTools = {
    ...mcpTools,
    reflect_reason,
    reflect_observe,
    reflect_conclude,
  };

  // v7 approvals live on the agent, not the tool: name → 'user-approval'
  const toolApproval = Object.fromEntries(approvalToolNames.map(n => [n, 'user-approval']));

  return new ToolLoopAgent({
    model: getModel(tiers.fast, reqCtx, guarded),
    instructions: REASON_PROMPT(reqCtx.user.id),
    tools: allTools,
    toolApproval,
    maxRetries: 0,
    stopWhen: isStepCount(10),
    onToolExecutionStart: ({ toolCall }) => {
      const args = JSON.stringify(toolCall.args);
      console.log(`[react] tool: ${toolCall.toolName}(${args.slice(0, 80)})`);
      dbg(`[react] tool args full: ${args}`);
    },
    onEnd: ({ steps }) => {
      console.log(`[react] finished in ${steps.length} steps`);
    },
    onStepEnd: (step) => {
      if (!DEBUG) return;
      const tools = step.toolCalls?.map(tc => tc.toolName).join(', ') || 'none';
      const results = step.toolResults?.map(tr =>
        `${tr.toolName}=${JSON.stringify(tr.output).slice(0, 120)}`
      ).join(' | ') || '';
      const usage = step.usage ? `in:${step.usage.inputTokens} out:${step.usage.outputTokens}` : '';
      dbg(`[react] step done | tools:[${tools}] ${usage}${results ? ` | ${results}` : ''}`);
    },
    prepareStep: async ({ stepNumber, steps, messages }) => {
      stepStartRef.current = Date.now();

      // A tool counts toward phase progress only if it actually EXECUTED: it produced a result,
      // or its execution failed (an isError payload, or a thrown error such as the gateway
      // refusing the call). A wrong-phase call that never ran (NoSuchToolError, an `invalid`
      // tool call) must not advance the loop, or a bogus triage_it_request attempt would mark
      // data as "fetched", skip FETCH, and let the model fabricate a result it never obtained.
      // A failed execution DOES count, so the loop OBSERVEs and honestly relays the failure
      // instead of trying every other data tool until the step limit.
      const executedIn = (s, name) =>
        s.toolResults?.some(tr => tr.toolName === name && !tr.error && tr.output !== undefined) ||
        s.content?.some(p => p.type === 'tool-error' && p.toolName === name &&
          !s.toolCalls?.some(tc => tc.toolCallId === p.toolCallId && tc.invalid));
      const ranTool = (name) => priorRan.has(name) || steps.some(s => executedIn(s, name));
      const ranReason = ranTool('reflect_reason');
      const ranConclude = ranTool('reflect_conclude');
      const ranDataTools = DATA_TOOL_NAMES.some(ranTool);

      // If model concluded no data tools needed → skip straight to ANSWER.
      // toolChoice:'none' forbids further tool calls (tools stay defined to avoid Bedrock's
      // empty-tools 400) — without it the model keeps calling reflect tools and never answers.
      if (ranConclude) {
        console.log(`[react] step ${stepNumber}: ANSWER (no-data shortcut) (${tiers.powerful})`);
        stepModels[stepNumber] = tiers.powerful;
        return {
          model: getModel(tiers.powerful, reqCtx, guarded, false, 'answer-no-data'),
          instructions: DECIDE_PROMPT(reqCtx.user.id),
          messages: withAnswerTurn(messages),
          toolChoice: 'none',
        };
      }

      // REASON: allow reason or conclude — model picks based on whether data tools are needed.
      // noParallel so the model can't emit BOTH reflect_reason and reflect_conclude at once
      // (contradictory "need data" + "no data" → two Reason cards).
      if (!ranReason && !ranDataTools) {
        console.log(`[react] step ${stepNumber}: REASON (${tiers.fast})`);
        stepModels[stepNumber] = tiers.fast;
        return {
          model: getModel(tiers.fast, reqCtx, guarded, true, 'reason'),
          instructions: REASON_PROMPT(reqCtx.user.id),
          activeTools: ['reflect_reason', 'reflect_conclude'],
          toolChoice: 'required',
        };
      }

      // FETCH: model must call at least one data tool. Skip when no data tools are
      // available (e.g. MCP gateway down) — forcing toolChoice:'required' with an empty
      // tools array makes Bedrock 400 ("toolConfig must be defined"). Fall through to ANSWER.
      const fetch = () => {
        console.log(`[react] step ${stepNumber}: FETCH (${tiers.fast})`);
        stepModels[stepNumber] = tiers.fast;
        return {
          model: getModel(tiers.fast, reqCtx, guarded, false, 'fetch'),
          instructions: FETCH_PROMPT(reqCtx.user.id),
          activeTools: DATA_TOOL_NAMES,
          toolChoice: 'required',
        };
      };
      if (!ranDataTools && DATA_TOOL_NAMES.length > 0) return fetch();

      const isDataStep = (s) => DATA_TOOL_NAMES.some(name => executedIn(s, name));
      const lastDataIdx = steps.findLastIndex(isDataStep);
      const observeAttempted = steps.length > lastDataIdx + 1;
      if (!observeAttempted) {
        console.log(`[react] step ${stepNumber}: OBSERVE (${tiers.fast})`);
        stepModels[stepNumber] = tiers.fast;
        return {
          model: getModel(tiers.fast, reqCtx, guarded, false, 'observe'),
          instructions: OBSERVE_PROMPT(reqCtx.user.id),
          activeTools: ['reflect_observe'],
          toolChoice: 'required',
        };
      }

      const observeStep = steps[lastDataIdx + 1];
      const observeCall = observeStep.toolCalls?.find(tc => tc.toolName === 'reflect_observe');
      const wantsMore = observeCall
        ? observeCall.input?.needs_more_data === true
        : observeStep.toolCalls?.length > 0;
      const isContinuation = DATA_TOOL_NAMES.some(n => priorRan.has(n));
      const fetchRounds = steps.filter(isDataStep).length;
      const fetchAttempts = steps.length - lastDataIdx - 2;
      if (wantsMore && DATA_TOOL_NAMES.length > 0 && !isContinuation && fetchRounds < MAX_FETCH_ROUNDS && fetchAttempts < 2) return fetch();

      // DECIDE+ANSWER: keep the tool set defined (empty array → Bedrock 400) but forbid
      // calling any via toolChoice:'none', so the model must emit the final text answer.
      console.log(`[react] step ${stepNumber}: ANSWER (${tiers.powerful})`);
      stepModels[stepNumber] = tiers.powerful;
      return {
        model: getModel(tiers.powerful, reqCtx, guarded, false, 'answer'),
        instructions: DECIDE_PROMPT(reqCtx.user.id),
        messages: withAnswerTurn(messages),
        toolChoice: 'none',
      };
    },
  });
}

/**
 * Tools that already ran (or were approved/denied) earlier in the current turn.
 *
 * An approval continuation re-posts the same assistant message (last role = assistant) and
 * the SDK runs the approved tool before step 0, so the agent's `steps` start empty. This set
 * carries the turn's phase progress into prepareStep.
 *
 * @param {Array} messages UI messages sent by the client
 * @returns {Set<string>} tool names; empty unless the last message is an assistant continuation
 */
function priorRanTools(messages) {
  const last = messages?.at(-1);
  const ran = new Set();
  if (last?.role !== 'assistant' || !Array.isArray(last.parts)) return ran;
  for (const p of last.parts) {
    if (isToolUIPart(p) && ['output-available', 'approval-responded', 'output-denied'].includes(p.state)) ran.add(getToolName(p));
  }
  return ran;
}

// Normalize approval-responded parts so convertToModelMessages doesn't crash.
function applyApprovalSafeMessages(rawMessages) {
  return rawMessages.map(msg => {
    if (msg.role !== 'assistant' || !Array.isArray(msg.parts)) return msg;
    let changed = false;
    const parts = msg.parts.map(p => {
      // Only remap denied approvals — approved ones are valid and handled by the SDK
      if (p.state === 'approval-responded' && p.approval?.approved === false) {
        changed = true;
        return {
          ...p,
          state: 'output-denied',
          approval: {
            ...p.approval,
            reason: 'ACTION DENIED BY USER. The user clicked Deny. Do not retry this action. Tell the user you understand they declined, then ask what they would like to do instead.',
          },
        };
      }
      return p;
    });
    return changed ? { ...msg, parts } : msg;
  });
}

// Prior-turn tool outputs (e.g. a 24-ticket dump) replay verbatim on every step and
// balloon the context — a long thread hit ~50k input tokens and the slow turn tripped the
// Cloudflare/Portkey stream timeout (ERR_INCOMPLETE_CHUNKED_ENCODING). Shrink big tool
// outputs on every assistant message EXCEPT the last one, so the current turn keeps full
// fidelity while history stays bounded. Tool-call/result pairing is preserved (we only
// replace the text content of the output, never drop the part).
const MAX_HISTORY_TOOL_OUTPUT_CHARS = 2000;
const truncNote = (n) => `\n…[truncated ${n} chars of an earlier turn's tool output]`;
// Shrink one tool output while PRESERVING its shape. MCP outputs are { content: [{type:'text',
// text}] } — replacing the whole object with a string breaks convertToModelMessages ('in'
// operator on a string). So truncate only the inner text; for a plain-string output truncate
// the string; leave other shapes (small reflect outputs) untouched.
function shrinkToolOutput(output) {
  if (typeof output === 'string') {
    return output.length > MAX_HISTORY_TOOL_OUTPUT_CHARS
      ? output.slice(0, MAX_HISTORY_TOOL_OUTPUT_CHARS) + truncNote(output.length - MAX_HISTORY_TOOL_OUTPUT_CHARS)
      : output;
  }
  if (output && typeof output === 'object' && Array.isArray(output.content)) {
    let changed = false;
    const content = output.content.map(c => {
      if (c?.type === 'text' && typeof c.text === 'string' && c.text.length > MAX_HISTORY_TOOL_OUTPUT_CHARS) {
        changed = true;
        return { ...c, text: c.text.slice(0, MAX_HISTORY_TOOL_OUTPUT_CHARS) + truncNote(c.text.length - MAX_HISTORY_TOOL_OUTPUT_CHARS) };
      }
      return c;
    });
    return changed ? { ...output, content } : output;
  }
  return output;
}
function trimHistoryToolOutputs(messages) {
  const lastAssistantIdx = messages.map(m => m.role).lastIndexOf('assistant');
  return messages.map((msg, idx) => {
    if (msg.role !== 'assistant' || !Array.isArray(msg.parts) || idx === lastAssistantIdx) return msg;
    let changed = false;
    const parts = msg.parts.map(p => {
      if (!isToolUIPart(p) || p.output === undefined) return p;
      const shrunk = shrinkToolOutput(p.output);
      if (shrunk === p.output) return p;
      changed = true;
      return { ...p, output: shrunk };
    });
    return changed ? { ...msg, parts } : msg;
  });
}

/**
 * Per-turn token/cost meter, used as the UI stream's messageMetadata callback.
 *
 * Emits cumulative usage and cost on every finish-step and on finish, so a turn that ends
 * on an error chunk (e.g. a guardrail block) still carries the tokens of its completed
 * steps. Usage comes from the part itself and is priced per step through stepModels.
 * `empty` is set on finish: no text was produced and the turn is not paused for approval.
 *
 * @param {string[]} stepModels tier model per step number of this request
 * @param {string} traceId Portkey trace id the thumbs feedback targets
 * @returns {({ part }: { part: object }) => object | undefined}
 */
function createTurnMeter(stepModels, traceId, user, guarded) {
  const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  const perModelUsage = {};
  let step = 0;
  let gotText = false;
  const snapshot = () => ({ usage: { ...usage }, traceId, cost: computeCost(perModelUsage), auth: gatewayAuthInfo(user, guarded), toolServers });
  return ({ part }) => {
    if (part.type === 'text-delta' && part.text?.trim()) gotText = true;
    if (part.type === 'finish-step') {
      const u = part.usage || {};
      const model = stepModels[step++];
      const acc = perModelUsage[model] || (perModelUsage[model] = { inputTokens: 0, outputTokens: 0 });
      acc.inputTokens += u.inputTokens || 0;
      acc.outputTokens += u.outputTokens || 0;
      usage.inputTokens += u.inputTokens || 0;
      usage.outputTokens += u.outputTokens || 0;
      usage.totalTokens += u.totalTokens || 0;
      return snapshot();
    }
    if (part.type === 'finish') {
      return { ...snapshot(), empty: !gotText && part.finishReason !== 'tool-calls' };
    }
  };
}

// AI SDK native chat endpoint — useChat on frontend consumes this automatically
app.post('/api/chat', async (req, res) => {
  const providerId = req.body.provider || DEFAULT_PROVIDER;
  const tiers = PROVIDER_TIERS[providerId] || PROVIDER_TIERS[DEFAULT_PROVIDER] || PROVIDER_TIERS.AWS;
  try {
    const phase = req.body.phase;
    const guarded = phase === 'phase3';
    const threadId = req.body.threadId || crypto.randomUUID();
    const { token, user } = await requestUser(req);
    const reqCtx = {
      threadId,
      token,
      user,
      guarded,
      // Trace-id = the browser conversation (threadId). Portkey's AIRS plugin sends this as
      // AIRS tr_id, which Strata treats as the AI-session id — so every turn of a conversation
      // lands in ONE ai-sessions view. It's also the key thumbs feedback targets, so feedback
      // is conversation-level (Portkey's hosted AIRS plugin does not forward a separate
      // session_id, so per-turn trace is the only alternative and it splits the session view).
      traceId: threadId,
      tiers,
    };
    const lastMsg = req.body.messages?.at(-1);
    const lastText = lastMsg?.parts?.find(p => p.type === 'text')?.text || lastMsg?.content || '';
    console.log(`[chat] provider:${providerId} phase:${phase || 'default'} thread:${reqCtx.threadId} msgs:${req.body.messages?.length ?? 0}`);
    dbg(`[chat] last message: ${lastText.slice(0, 200)}`);
    dbg(`[chat] models: fast=${tiers.fast} powerful=${tiers.powerful} guarded=${guarded}`);
    const mcpTools = await getMCPTools();

    // MCP tools only — reflect variants added inside buildReactAgent per phase.
    // v7: approval is declared on the agent (toolApproval), not the tool.
    const approvalToolNames = Object.keys(mcpTools).filter(key =>
      TOOLS_REQUIRING_APPROVAL.some(suffix => key.endsWith(suffix))
    );

    const safeMessages = trimHistoryToolOutputs(applyApprovalSafeMessages(req.body.messages));
    const stepModels = [];
    const priorRan = priorRanTools(safeMessages);
    if (priorRan.size) dbg(`[chat] continuation, already ran: ${[...priorRan].join(', ')}`);
    const agent = buildReactAgent(tiers, reqCtx, mcpTools, guarded, approvalToolNames, stepModels, priorRan);

    // Warm the pricing cache for this turn's tier models (cached across requests).
    await Promise.all([ensurePrice(tiers.fast), ensurePrice(tiers.powerful)]);

    // Run inside mcpCtx so tools/call requests made by the agent inherit this turn's trace.
    await mcpCtx.run(reqCtx, () => pipeAgentUIStreamToResponse({
      response: res,
      agent,
      uiMessages: safeMessages,
      onError: (err) => normalizeError(err, tiers?.fast),
      messageMetadata: createTurnMeter(stepModels, reqCtx.traceId, user, guarded),
    }));
  } catch (err) {
    console.error(`[chat] ${err.message}`);
    if (/^auth-service|session cookie/.test(err.message) && !res.headersSent) return res.status(401).json({ error: err.message });
    const errMsg = normalizeError(err, tiers?.fast);
    if (!res.headersSent) res.status(500).json({ error: errMsg });
  }
});

// Providers — all configured tiers. Portkey routes @provider-slug/model via passthrough,
// so a model need not appear in the /v1/models catalog to be callable.
app.get('/api/providers', (_req, res) => {
  const providers = Object.entries(PROVIDER_TIERS)
    .sort(([, a], [, b]) => Number(!!b.auto) - Number(!!a.auto))
    .map(([id, t]) => ({ id, label: t.label }));
  res.json({ providers, default: PROVIDER_TIERS[DEFAULT_PROVIDER] ? DEFAULT_PROVIDER : providers[0]?.id });
});

// AIRS config for building report links in the frontend
app.get('/api/airs-config', (_req, res) => {
  res.json({
    tsgId: AIRS_TSG_ID,
    appId: AIRS_APP_ID,
    baseUrl: 'https://stratacloudmanager.paloaltonetworks.com/ai-security/runtime/ai-sessions',
    gateway: {
      workspaceId: GW_WORKSPACE_ID,
      deploymentId: GW_DEPLOYMENT_ID,
      orgId: GW_ORG_ID,
    },
  });
});

// Forward user feedback (thumbs up/down) to Portkey, keyed by the turn's trace-id.
// value: +1 (👍) / -1 (👎); Portkey accepts [-10,10]. Feedback shows on the trace's log.
app.post('/api/feedback', async (req, res) => {
  const { traceId, value, weight, toolsUsed, comment } = req.body || {};
  const { user } = await requestUser(req).catch(() => ({ user: { ...DEFAULT_USER, id: DEFAULT_USER.employee_id } }));
  if (!traceId || typeof value !== 'number') {
    return res.status(400).json({ error: 'traceId and numeric value are required' });
  }
  try {
    const tools = Array.isArray(toolsUsed) ? toolsUsed : [];
    const resp = await fetch(`${PORTKEY_BASE_URL}/feedback`, {
      method: 'POST',
      headers: { 'x-portkey-api-key': PORTKEY_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trace_id: traceId,
        value,
        weight: typeof weight === 'number' ? weight : 1,
        metadata: {
          _user: user.email || user.id,
          login_email: user.login,
          agent_id: user.agent,
          app_name: 'The Otter V2',
          answer_type: tools.length > 0 ? 'tool-backed' : 'direct',
          tools_used: tools.join(', '),
          ...(comment ? { text: comment } : {}),
        },
      }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      console.warn(`[feedback] Portkey ${resp.status}: ${body.slice(0, 200)}`);
      return res.status(502).json({ error: 'Feedback rejected by Portkey' });
    }
    console.log(`[feedback] trace:${traceId} value:${value}`);
    res.json({ ok: true });
  } catch (err) {
    console.error(`[feedback] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * The signed-in user as the gateway and the MCP servers see them (persona, name, email, groups,
 * agent), and the personas they can switch to.
 */
app.get('/api/me', async (req, res) => {
  try {
    const { user } = await requestUser(req);
    res.json({ userTokens: USER_TOKENS_ENABLED, ...user, personas: USER_TOKENS_ENABLED ? await personas() : [] });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

/** Switches the persona ({ persona: "<id>" }) through the auth-service; the next turn's token carries it. */
app.post('/api/persona', async (req, res) => {
  if (!USER_TOKENS_ENABLED) return res.status(404).json({ error: 'Personas need user tokens (OAUTH_SERVER_URL)' });
  try {
    const resp = await setPersona(req.headers.cookie || '', req.body?.persona);
    if (resp.ok) forgetUserToken(req.headers.cookie);
    res.status(resp.status).json(await resp.json().catch(() => ({})));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/**
 * App version, the release tag the image was built for (APP_VERSION, e.g. 0.1.6-rc.2) or else
 * chatbot-v2 package.json, and the Markdown changelog. CHANGELOG.md sits next to
 * package.json in the image and at the repo root when run from source.
 */
app.get('/api/about', (_req, res) => {
  const version = process.env.APP_VERSION?.replace(/^v/, '')
    || JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8')).version;
  const changelogPath = [path.join(__dirname, '../CHANGELOG.md'), path.join(__dirname, '../../CHANGELOG.md')].find(p => fs.existsSync(p));
  res.json({ version, changelog: changelogPath ? fs.readFileSync(changelogPath, 'utf-8') : '' });
});

// i18n
app.get('/api/translations/:language', (req, res) => {
  const langFile = path.join(__dirname, '../frontend/dist/locales', req.params.language, 'frontend.json');
  res.sendFile(langFile, (err) => {
    if (err) res.status(404).json({ error: 'Translation not found' });
  });
});

app.get('/api/languages', (_req, res) => {
  try {
    const localesDir = path.join(__dirname, '../frontend/dist/locales');
    const dirs = fs.readdirSync(localesDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    const languages = dirs.map(code => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(localesDir, code, 'frontend.json'), 'utf-8'));
        return { code, name: data.language?.name || code.toUpperCase(), nativeName: data.language?.nativeName || code.toUpperCase() };
      } catch {
        return { code, name: code.toUpperCase(), nativeName: code.toUpperCase() };
      }
    });

    res.json({ languages });
  } catch {
    res.json({ languages: [{ code: 'en', name: 'English', nativeName: 'English' }] });
  }
});

// SPA fallback — serve React app for any non-API route
app.get('/{*path}', (_req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

// --- Startup ---

async function main() {
  await reconnectMissingClients();
  // Warm the tool cache at boot so the first chat request doesn't pay the tools/list round-trips.
  await getMCPTools();
  // Kick off the self-scheduling refresh (1h healthy, 1min while any server is unreachable).
  // If a server didn't connect at boot, start on the fast cadence so it recovers quickly.
  const bootDegraded = mcpClients.length < MCP_URLS.length;
  setTimeout(refreshMCPTools, bootDegraded ? TOOLS_REFRESH_DEGRADED_MS : TOOLS_REFRESH_HEALTHY_MS).unref();

  app.listen(PORT, () => {
    console.log(`Chatbot V2 running on http://localhost:${PORT}`);
    console.log(`Model: ${MODEL_ID} via Portkey at ${PORTKEY_BASE_URL}`);
    console.log(`MCP tools: ${MCP_URLS.join(', ') || '(none configured)'}`);
  });
}

main().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});

async function shutdown() {
  console.log('Shutting down...');
  for (const entry of mcpClients) {
    try { await entry.client.close(); } catch (_) {}
  }
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
