/**
 * Chatbot V2 — AI SDK Native Backend
 * Uses streamText + pipeUIMessageStreamToResponse (AI SDK's native protocol).
 * MCP tools fetched from Portkey MCP Gateway (one client per registered server).
 * Frontend: React + useChat (consumes the data stream automatically).
 */
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { ToolLoopAgent, streamText, generateText, createUIMessageStream, createUIMessageStreamResponse, pipeAgentUIStreamToResponse, convertToModelMessages, isStepCount, tool } from 'ai';
import { z } from 'zod';
import { createMCPClient } from '@ai-sdk/mcp';
import { createOpenAI } from '@ai-sdk/openai';

dotenv.config();

const DEBUG = process.env.LOG_LEVEL === 'debug';
function dbg(msg) { if (DEBUG) console.log(msg); }

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.CHATBOT_V2_PORT || 3018;

// --- Configuration ---

const PORTKEY_BASE_URL = process.env.PORTKEY_BASE_URL || 'https://api.portkey.ai/v1';
const PORTKEY_API_KEY = process.env.PORTKEY_API_KEY || '';
const AWS_PROVIDER = process.env.PORTKEY_AWS_PROVIDER || '@bedrock-prod';
const GCP_PROVIDER = process.env.PORTKEY_GCP_PROVIDER || '@vertex-prod';
const AZURE_PROVIDER = process.env.PORTKEY_AZURE_PROVIDER || '@azure';
const MODEL_ID = process.env.PORTKEY_DEFAULT_MODEL || `${AWS_PROVIDER}/eu.anthropic.claude-sonnet-4-6`;

// Portkey MCP Gateway — one endpoint per registered server (no single aggregator)
const PORTKEY_MCP_BASE = process.env.PORTKEY_MCP_BASE || 'https://mcp.portkey.ai';
// Every PORTKEY_MCP_*_SLUG env var becomes an MCP client — add a new server by
// adding an env var, no code change. (PORTKEY_MCP_BASE is excluded by the _SLUG suffix.)
const MCP_SLUGS = Object.entries(process.env)
  .filter(([k, v]) => /^PORTKEY_MCP_.+_SLUG$/.test(k) && v)
  .map(([, v]) => v);
const MCP_URLS = MCP_SLUGS.map(slug => `${PORTKEY_MCP_BASE}/${slug}/mcp`);

const STATIC_USER = {
  employee_id: 'EMP-034',
};

// --- Focused phase prompts for the forced ReAct loop ---

const REASON_PROMPT = `You are a corporate assistant. The current user's employee ID is ${STATIC_USER.employee_id}.

Use reflect_reason to plan which tools to call to answer the user's request.
- State what the user is asking
- Identify which tools are needed
- When asked about "my" anything, use employee ID: ${STATIC_USER.employee_id}
- Do NOT answer the user — only plan
- If NO data tools are needed (e.g. security refusal, policy clarification, identity override attempt, general question), call reflect_conclude instead of reflect_reason`;

const OBSERVE_PROMPT = `You are the OBSERVE phase of a corporate assistant's ReAct loop.
The current user's employee ID is ${STATIC_USER.employee_id}.

You have just received tool results. Your ONLY job: call reflect with phase EXACTLY equal to 'observe'.
You MUST call: reflect({ phase: 'observe', observation: '<key facts from tool results>', gaps: '<still unknown if any>', next_action: '<done or needs more tools>' })
The phase field MUST be 'observe' — not 'decide', not 'reason'. Only 'observe'.
- Do NOT answer the user — only observe
- Never guess or fabricate — if a tool returned nothing, say so`;

const DECIDE_PROMPT = `You are the final answer generator for a corporate assistant.
The current user's employee ID is ${STATIC_USER.employee_id}.

You have all the data you need. Give a clear, professional, concise answer to the user.
- Never approve a ticket on behalf of the requesting user — approvals must come from the designated approver
- Be professional, concise, and helpful
- Do NOT call any tools — answer directly`;

// --- LLM ---

// Portkey Config ID that attaches the PANW Prisma AIRS guardrail (input + output) on guarded requests
const GUARDED_CONFIG = process.env.PORTKEY_GUARDED_CONFIG || '';
// Portkey Config ID (or inline JSON) enabling response caching on non-guarded requests.
// Use a simple/exact-match cache config — semantic cache can mis-hit mid agent loop.
const CACHE_CONFIG = process.env.PORTKEY_CACHE_CONFIG || '';
const AIRS_TSG_ID = process.env.PRISMA_AIRS_TSG_ID || '';
const AIRS_APP_ID = process.env.PRISMA_AIRS_APP_ID || '';
const AIRS_APP_NAME = process.env.PRISMA_AIRS_APP_NAME || '';

// Tools that mutate state — require explicit user approval before execution
const TOOLS_REQUIRING_APPROVAL = ['create_ticket', 'update_ticket_status'];

// Provider → fast (Reason/Observe) + powerful (Decide) model tiers.
// Model IDs use Portkey's @provider-slug/model format.
const PROVIDER_TIERS = {
  AWS: {
    label: 'AWS Bedrock',
    icon: 'cloud',
    fast:     `${AWS_PROVIDER}/eu.anthropic.claude-haiku-4-5-20251001-v1:0`,
    powerful: `${AWS_PROVIDER}/eu.anthropic.claude-sonnet-4-6`,
  },
  GCP: {
    label: 'GCP Vertex AI',
    icon: 'cloud',
    fast:     `${GCP_PROVIDER}/anthropic.claude-haiku-4-5`,
    powerful: `${GCP_PROVIDER}/anthropic.claude-sonnet-4-6`,
  },
  Azure: {
    label: 'Azure AI Foundry',
    icon: 'cloud',
    fast:     `${AZURE_PROVIDER}/claude-haiku-4-5`,
    powerful: `${AZURE_PROVIDER}/claude-sonnet-4-6`,
  },
};

// Phase-locked reflect tools — instantiated per-agent so execute() can emit stepMs.
// stepStartRef.current is set by prepareStep just before each step runs.
function makeReflectTools(stepStartRef) {
  const make = (phaseName) => tool({
    description: `Record your ${phaseName} step.`,
    inputSchema: z.object({
      observation: z.string().describe('What did you observe or decide?'),
      gaps: z.string().describe('What is still unknown?'),
      next_action: z.string().describe('What will you do next?'),
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
  return { reflect_reason: make('reason'), reflect_observe: make('observe'), reflect_conclude: conclude };
}

// Injects Portkey auth, user identity, thread trace, and guardrail config into every request.
// reqCtx is captured per-request to avoid cross-request contamination.
function portkeyFetch(reqCtx, guarded = false, noParallel = false) {
  return async (url, init) => {
    const headers = new Headers(init?.headers);
    headers.set('x-portkey-api-key', PORTKEY_API_KEY);
    headers.set('x-portkey-trace-id', reqCtx.threadId);
    if (guarded && GUARDED_CONFIG) {
      headers.set('x-portkey-config', GUARDED_CONFIG);
    } else if (CACHE_CONFIG) {
      headers.set('x-portkey-config', CACHE_CONFIG);
    }
    let model = '';
    if (init?.body) {
      const body = JSON.parse(init.body);
      body.user = STATIC_USER.employee_id;
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
    // Metadata feeds Portkey observability and the AIRS guardrail params
    // (ai_model={{metadata.model}}, app_user={{metadata._user}}).
    headers.set('x-portkey-metadata', JSON.stringify({
      _user: STATIC_USER.employee_id,
      app_name: 'The Otter V2',
      user_ip: reqCtx.userIp,
      thread_id: reqCtx.threadId,
      model,
    }));
    return fetch(url, { ...init, headers });
  };
}

function getModel(modelId, reqCtx, guarded = false, noParallel = false) {
  const provider = createOpenAI({
    baseURL: PORTKEY_BASE_URL,
    apiKey: PORTKEY_API_KEY,
    fetch: portkeyFetch(reqCtx, guarded, noParallel),
  });
  return provider.chat(modelId || MODEL_ID);
}

// --- MCP Clients (Portkey MCP Gateway — one client per registered server) ---

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
    setTimeout(() => reject(new Error('Connection timeout (15s)')), 15000)
  );
  return Promise.race([connectPromise, timeoutPromise]);
}

async function initMCPClients() {
  mcpClients = [];
  for (const url of MCP_URLS) {
    try {
      const client = await connectMCP(url);
      mcpClients.push({ url, client });
      console.log(`MCP client connected: ${url}`);
    } catch (err) {
      console.error(`Failed to connect MCP client ${url}: ${err.message}`);
    }
  }
}

async function getMCPTools() {
  if (mcpClients.length === 0) return {};
  const merged = {};
  for (const entry of mcpClients) {
    try {
      const tools = await entry.client.tools();
      // @ai-sdk/mcp v1.0.26+ wraps MCP tools as dynamicTool() by default (type: 'dynamic'),
      // which tells streamText to send them to the client for execution instead of running
      // them server-side. Strip the flag so the execute() function runs on the backend.
      for (const [name, tool] of Object.entries(tools)) {
        if (tool.type === 'dynamic') delete tool.type;
        merged[name] = tool;
      }
    } catch (err) {
      console.warn(`MCP tools unavailable from ${entry.url}: ${err.message}`);
    }
  }
  console.log(`[mcp] tools loaded (${Object.keys(merged).length}): ${Object.keys(merged).join(', ')}`);
  return merged;
}

// --- Middleware ---

app.set('trust proxy', true);
app.use(cors({ origin: '*', credentials: true }));
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
  });
});

// No-op — kept for reference, synthetic reflect now handled via reflectTool in ToolLoopAgent

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
  const toxic = data.prompt_detection_details?.toxic_content_details?.toxic_categories
    || data.response_detection_details?.toxic_content_details?.toxic_categories || [];
  return JSON.stringify({
    type: 'guardrail_violation',
    tr_id: data.tr_id || data.session_id || '',
    scan_id: data.scan_id || '',
    report_id: data.report_id || '',
    category: data.category || '',
    toxic_categories: toxic,
    prompt_detected: isResponse ? undefined : data.prompt_detected,
    response_detected: isResponse ? (data.response_detected || {}) : undefined,
    isResponseBlock: isResponse,
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

// Build a ToolLoopAgent with prepareStep-driven phase switching.
// Phase-locked reflect tools enforce correct phase labels — model cannot mislabel.
// Step 0: reflect_reason  forced  (fast model, plans which data tools to call)
// Step 1: data tools      required (fast model, executes the data fetch)
// Step 2: reflect_observe forced  (fast model, synthesizes findings)
// Step 3: text answer     none    (powerful model, answers directly)
function buildReactAgent(tiers, reqCtx, mcpTools, guarded, approvalToolNames = []) {
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
    instructions: REASON_PROMPT,
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
        `${tr.toolName}=${JSON.stringify(tr.result).slice(0, 120)}`
      ).join(' | ') || '';
      const usage = step.usage ? `in:${step.usage.inputTokens} out:${step.usage.outputTokens}` : '';
      dbg(`[react] step done | tools:[${tools}] ${usage}${results ? ` | ${results}` : ''}`);
    },
    prepareStep: async ({ stepNumber, steps }) => {
      stepStartRef.current = Date.now();

      const ranReason = steps.some(s =>
        s.toolCalls?.some(tc => tc.toolName === 'reflect_reason')
      );
      const ranConclude = steps.some(s =>
        s.toolCalls?.some(tc => tc.toolName === 'reflect_conclude')
      );
      const ranDataTools = steps.some(s =>
        s.toolCalls?.some(tc => DATA_TOOL_NAMES.includes(tc.toolName))
      );
      const ranObserve = steps.some(s =>
        s.toolCalls?.some(tc => tc.toolName === 'reflect_observe')
      );

      // If model concluded no data tools needed → skip straight to ANSWER
      if (ranConclude) {
        console.log(`[react] step ${stepNumber}: ANSWER (no-data shortcut) (${tiers.powerful})`);
        return {
          model: getModel(tiers.powerful, reqCtx, guarded),
          instructions: DECIDE_PROMPT,
        };
      }

      // REASON: allow reason or conclude — model picks based on whether data tools are needed.
      // noParallel so the model can't emit BOTH reflect_reason and reflect_conclude at once
      // (contradictory "need data" + "no data" → two Reason cards).
      if (!ranReason && !ranDataTools) {
        console.log(`[react] step ${stepNumber}: REASON (${tiers.fast})`);
        return {
          model: getModel(tiers.fast, reqCtx, guarded, true),
          instructions: REASON_PROMPT,
          activeTools: ['reflect_reason', 'reflect_conclude'],
          toolChoice: 'required',
        };
      }

      // FETCH: model must call at least one data tool
      if (!ranDataTools) {
        console.log(`[react] step ${stepNumber}: FETCH (${tiers.fast})`);
        return {
          model: getModel(tiers.fast, reqCtx, guarded),
          instructions: REASON_PROMPT,
          activeTools: DATA_TOOL_NAMES,
          toolChoice: 'required',
        };
      }

      // OBSERVE: one attempt after data tools.
      const dataStepIndex = steps.findIndex(s =>
        s.toolCalls?.some(tc => DATA_TOOL_NAMES.includes(tc.toolName))
      );
      const observeAttempted = steps.length > dataStepIndex + 1;
      if (!ranObserve && !observeAttempted) {
        console.log(`[react] step ${stepNumber}: OBSERVE (${tiers.fast})`);
        return {
          model: getModel(tiers.fast, reqCtx, guarded),
          instructions: OBSERVE_PROMPT,
          activeTools: ['reflect_observe'],
          toolChoice: 'required',
        };
      }

      // DECIDE+ANSWER: keep full tool set so Bedrock doesn't error on empty tools array;
      // DECIDE_PROMPT instructs the model not to call any tools
      console.log(`[react] step ${stepNumber}: ANSWER (${tiers.powerful})`);
      return {
        model: getModel(tiers.powerful, reqCtx, guarded),
        instructions: DECIDE_PROMPT,
      };
    },
  });
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

// AI SDK native chat endpoint — useChat on frontend consumes this automatically
app.post('/api/chat', async (req, res) => {
  const providerId = req.body.provider || 'AWS';
  const tiers = PROVIDER_TIERS[providerId] || PROVIDER_TIERS.AWS;
  try {
    const phase = req.body.phase;
    const guarded = phase === 'phase3';
    const reqCtx = {
      threadId: req.body.threadId || crypto.randomUUID(),
      userIp: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '',
    };
    const lastMsg = req.body.messages?.at(-1);
    const lastText = lastMsg?.parts?.find(p => p.type === 'text')?.text || lastMsg?.content || '';
    console.log(`[chat] provider:${providerId} phase:${phase || 'default'} thread:${reqCtx.threadId} msgs:${req.body.messages?.length ?? 0}`);
    dbg(`[chat] last message: ${lastText.slice(0, 200)}`);
    dbg(`[chat] models: fast=${tiers.fast} powerful=${tiers.powerful} guarded=${guarded}`);
    const mcpTools = await getMCPTools();

    // MCP tools only — reflect variants added inside buildReactAgent per phase.
    // v7: approval is declared on the agent (toolApproval), not the tool.
    const tools = { ...mcpTools };
    const approvalToolNames = Object.keys(tools).filter(key =>
      TOOLS_REQUIRING_APPROVAL.some(suffix => key.endsWith(suffix))
    );

    const safeMessages = applyApprovalSafeMessages(req.body.messages);
    const agent = buildReactAgent(tiers, reqCtx, tools, guarded, approvalToolNames);

    // Accumulate token usage across all phases for the final metadata
    let totalUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

    await pipeAgentUIStreamToResponse({
      response: res,
      agent,
      uiMessages: safeMessages,
      onError: (err) => normalizeError(err, tiers?.fast),
      onStepEnd: ({ usage }) => {
        if (usage) {
          totalUsage.inputTokens  += usage.inputTokens  || 0;
          totalUsage.outputTokens += usage.outputTokens || 0;
          totalUsage.totalTokens  += usage.totalTokens  || 0;
        }
      },
      messageMetadata: ({ part }) => {
        if (part.type === 'finish') {
          return {
            usage: totalUsage,
            empty: totalUsage.outputTokens === 0,
          };
        }
      },
    });
  } catch (err) {
    console.error(`[chat] ${err.message}`);
    const errMsg = normalizeError(err, tiers?.fast);
    if (!res.headersSent) res.status(500).json({ error: errMsg });
  }
});

// Available models from Portkey
const PROVIDER_LABELS = {
  bedrock: 'AWS', bedrock_converse: 'AWS',
  vertex_ai: 'GCP', 'vertex-ai': 'GCP',
  azure: 'Azure', azure_ai: 'Azure',
  anthropic: 'Anthropic', openai: 'OpenAI', ollama: 'Ollama',
};

function inferProvider(modelId) {
  if (!modelId) return 'unknown';
  if (modelId.includes('bedrock') || modelId.includes('anthropic.') || modelId.includes('amazon.') || modelId.includes('eu.anthropic') || modelId.includes('us.anthropic')) return 'AWS';
  if (modelId.includes('vertex') || modelId.includes('gemini')) return 'GCP';
  if (modelId.includes('azure')) return 'Azure';
  if (modelId.includes('anthropic/') || modelId.startsWith('@anthropic')) return 'Anthropic';
  if (modelId.includes('openai') || modelId.includes('gpt')) return 'OpenAI';
  if (modelId.includes('ollama')) return 'Ollama';
  const prefix = modelId.replace(/^@/, '').split('/')[0];
  return PROVIDER_LABELS[prefix] || 'unknown';
}

app.get('/api/models', async (_req, res) => {
  try {
    let models = [];
    const listResp = await fetch(`${PORTKEY_BASE_URL}/models`, {
      headers: { 'x-portkey-api-key': PORTKEY_API_KEY },
    });
    if (listResp.ok) {
      const data = await listResp.json();
      models = (data.data || []).map(m => ({
        id: m.id,
        name: m.slug || m.id,
        provider: inferProvider(m.id),
      }));
    }
    const defaultModel = models.some(m => m.id === MODEL_ID) ? MODEL_ID : (models[0]?.id || MODEL_ID);
    res.json({ models, default: defaultModel });
  } catch (err) {
    console.warn(`Failed to fetch models: ${err.message}`);
    res.json({ models: [{ id: MODEL_ID, name: MODEL_ID, provider: 'unknown' }], default: MODEL_ID });
  }
});

// Providers — all configured tiers. Portkey routes @provider-slug/model via passthrough,
// so a model need not appear in the /v1/models catalog to be callable.
app.get('/api/providers', (_req, res) => {
  const providers = Object.entries(PROVIDER_TIERS)
    .map(([id, t]) => ({ id, label: t.label, fast: t.fast, powerful: t.powerful }));
  res.json({ providers, default: providers[0]?.id || 'AWS' });
});

// AIRS config for building report links in the frontend
app.get('/api/airs-config', (_req, res) => {
  res.json({
    tsgId: AIRS_TSG_ID,
    appId: AIRS_APP_ID,
    appName: AIRS_APP_NAME,
    baseUrl: 'https://stratacloudmanager.paloaltonetworks.com/ai-security/runtime/api-violations',
  });
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

    res.json({ languages, defaultLanguage: 'en', totalLanguages: languages.length });
  } catch {
    res.json({ languages: [{ code: 'en', name: 'English', nativeName: 'English' }], defaultLanguage: 'en', totalLanguages: 1 });
  }
});

// SPA fallback — serve React app for any non-API route
app.get('/{*path}', (_req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

// --- Startup ---

async function main() {
  await initMCPClients();

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
