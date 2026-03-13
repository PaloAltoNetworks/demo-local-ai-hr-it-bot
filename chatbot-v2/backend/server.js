/**
 * Chatbot V2 — AI SDK Native Backend
 * Uses streamText + pipeUIMessageStreamToResponse (AI SDK's native protocol).
 * MCP tools fetched from LiteLLM's MCP aggregator.
 * Frontend: React + useChat (consumes the data stream automatically).
 */
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { streamText, convertToModelMessages, stepCountIs } from 'ai';
import { createMCPClient } from '@ai-sdk/mcp';
import { createOpenAI } from '@ai-sdk/openai';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.CHATBOT_V2_PORT || 3008;

// --- Configuration ---

const LITELLM_BASE_URL = process.env.LITELLM_BASE_URL || 'http://localhost:8080';
const LITELLM_API_KEY = process.env.LITELLM_API_KEY || 'sk-1234';
const MODEL_ID = process.env.CHATBOT_V2_MODEL || 'eu.anthropic.claude-opus-4-6-v1';
const MCP_URL = process.env.MCP_URL || `${LITELLM_BASE_URL}/mcp/`;

const STATIC_USER = {
  name: 'Aurélien Delamarre',
  email: 'aurelien.delamarre@company.com',
  role: 'Pre-Sales Engineer',
  department: 'Sales Department',
};

const SYSTEM_PROMPT = `You are a helpful corporate assistant for HR and IT support.
You have access to two sets of tools:
- HR tools: look up employee profiles, managers, departments, direct reports
- IT tools: look up IT tickets, search tickets, ticket statistics

The current user is ${STATIC_USER.name} (${STATIC_USER.email}), ${STATIC_USER.role} in the ${STATIC_USER.department}.

When answering questions, think step-by-step:
1. Identify what information you need
2. Call the appropriate tools to gather ALL relevant data before answering
3. If a question spans both HR and IT, call BOTH HR and IT tools

When a user asks about "my tickets" or "my information", use their email: ${STATIC_USER.email}.
Always be professional, concise, and helpful.`;

// --- LLM ---

const GUARDRAIL_NAME = process.env.LITELLM_GUARDRAIL_NAME || '';
const AIRS_TSG_ID = process.env.PRISMA_AIRS_TSG_ID || '';
const AIRS_APP_ID = process.env.PRISMA_AIRS_APP_ID || '';

// Per-request context set before each streamText call
let _reqCtx = { threadId: '', userIp: '' };

// Injects user identity, thread trace, and guardrails into every LiteLLM request
function litellmFetch(guarded = false) {
  return async (url, init) => {
    if (init?.body) {
      const body = JSON.parse(init.body);
      body.user = STATIC_USER.email;
      body.metadata = {
        ...body.metadata,
        app_user: STATIC_USER.email,
        app_name: 'The Otter V2',
        user_ip: _reqCtx.userIp,
        trace_id: _reqCtx.threadId,
        tr_id: _reqCtx.threadId,
        tags: [`thread:${_reqCtx.threadId}`],
      };
      if (guarded) {
        body.guardrails = [GUARDRAIL_NAME];
      }
      const headers = new Headers(init.headers);
      headers.set('x-litellm-spend-logs-metadata', JSON.stringify({
        thread_id: _reqCtx.threadId,
        app_user: STATIC_USER.email,
      }));
      init = { ...init, headers, body: JSON.stringify(body) };
    }
    return fetch(url, init);
  };
}

const openai = createOpenAI({
  baseURL: `${LITELLM_BASE_URL}/v1`,
  apiKey: LITELLM_API_KEY,
  fetch: litellmFetch(false),
});

const openaiGuarded = createOpenAI({
  baseURL: `${LITELLM_BASE_URL}/v1`,
  apiKey: LITELLM_API_KEY,
  fetch: litellmFetch(true),
});

function getModel(modelId, guarded = false) {
  const provider = guarded ? openaiGuarded : openai;
  return provider.chat(modelId || MODEL_ID);
}

// --- MCP Client ---

let mcpClient = null;

async function initMCPClient() {
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
      setTimeout(() => reject(new Error('Connection timeout (15s)')), 15000)
    );
    mcpClient = await Promise.race([connectPromise, timeoutPromise]);
    console.log(`MCP client connected: ${MCP_URL}`);
  } catch (err) {
    console.error(`Failed to connect MCP client: ${err.message}`);
  }
}

async function getMCPTools() {
  if (!mcpClient) return {};
  try {
    return await mcpClient.tools();
  } catch (err) {
    console.warn(`MCP tools unavailable: ${err.message}`);
    return {};
  }
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
    mcpStatus: mcpClient ? 'connected' : 'disconnected',
    mcpUrl: MCP_URL,
    model: MODEL_ID,
  });
});

// AI SDK native chat endpoint — useChat on frontend consumes this automatically
app.post('/api/chat', async (req, res) => {
  try {
    const requestedModel = req.body.model;
    const phase = req.body.phase;
    const guarded = phase === 'phase3';
    _reqCtx = {
      threadId: req.body.threadId || crypto.randomUUID(),
      userIp: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '',
    };
    const tools = await getMCPTools();
    const messages = await convertToModelMessages(req.body.messages, { tools });

    const result = streamText({
      model: getModel(requestedModel, guarded),
      system: SYSTEM_PROMPT,
      messages,
      tools,
      stopWhen: stepCountIs(10),
      onFinish: ({ text, usage, finishReason, steps }) => {
        if (!text && usage?.completionTokens === 0) {
          console.warn(`[chat] Empty response from ${requestedModel || MODEL_ID} (thread: ${_reqCtx.threadId}, reason: ${finishReason}, steps: ${steps?.length || 0})`);
        }
      },
    });

    result.pipeUIMessageStreamToResponse(res, {
      messageMetadata: ({ part }) => {
        if (part.type === 'finish') {
          return {
            usage: part.totalUsage,
            empty: (part.totalUsage?.outputTokens || 0) === 0,
          };
        }
      },
    });
  } catch (err) {
    console.error(`[chat] Error: ${err.message}`);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Available models from LiteLLM
const PROVIDER_LABELS = {
  bedrock: 'AWS', bedrock_converse: 'AWS',
  vertex_ai: 'GCP', 'vertex_ai-language-models': 'GCP',
  azure: 'Azure', azure_ai: 'Azure',
  anthropic: 'Anthropic', openai: 'OpenAI', ollama: 'Ollama',
};

app.get('/api/models', async (_req, res) => {
  try {
    const response = await fetch(`${LITELLM_BASE_URL}/model/info`, {
      headers: { 'x-litellm-api-key': LITELLM_API_KEY },
    });
    if (!response.ok) throw new Error(`LiteLLM ${response.status}`);
    const data = await response.json();
    const models = (data.data || []).map(m => {
      const provider = m.model_info?.litellm_provider || 'unknown';
      return {
        id: m.model_name,
        name: m.model_name,
        provider: PROVIDER_LABELS[provider] || provider,
      };
    });
    res.json({ models, default: MODEL_ID });
  } catch (err) {
    console.warn(`Failed to fetch models: ${err.message}`);
    res.json({ models: [{ id: MODEL_ID, name: MODEL_ID, provider: 'unknown' }], default: MODEL_ID });
  }
});

// AIRS config for building report links in the frontend
app.get('/api/airs-config', (_req, res) => {
  res.json({
    tsgId: AIRS_TSG_ID,
    appId: AIRS_APP_ID,
    baseUrl: 'https://stratacloudmanager.paloaltonetworks.com/ai-security/runtime/ai-sessions',
  });
});

// i18n
app.get('/api/translations/:language', (req, res) => {
  const langFile = path.join(__dirname, '../frontend/dist/locales', req.params.language, 'frontend.json');
  res.sendFile(langFile, (err) => {
    if (err) res.status(404).json({ error: 'Translation not found' });
  });
});

app.get('/api/languages', async (_req, res) => {
  try {
    const fs = await import('fs');
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
  await initMCPClient();

  app.listen(PORT, () => {
    console.log(`Chatbot V2 running on http://localhost:${PORT}`);
    console.log(`Model: ${MODEL_ID} via LiteLLM at ${LITELLM_BASE_URL}`);
    console.log(`MCP tools: ${MCP_URL}`);
  });
}

main().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});

async function shutdown() {
  console.log('Shutting down...');
  try { await mcpClient?.close(); } catch (_) {}
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
