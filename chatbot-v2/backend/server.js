/**
 * Chatbot V2 — AI SDK + Native MCP Tool Calling
 * Replaces the coordinator/agent routing with direct AI SDK generateText
 * connected to standalone MCP tools servers (hr-tools, it-tools).
 * Serves the same vanilla JS frontend as chatbot-host.
 */
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { generateText, stepCountIs } from 'ai';
import { createMCPClient } from '@ai-sdk/mcp';
import { createOpenAI } from '@ai-sdk/openai';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.CHATBOT_V2_PORT || 3008;

// --- Configuration ---

const HR_TOOLS_URL = process.env.HR_TOOLS_MCP_URL || 'http://hr-tools-mcp-server:3000/mcp';
const IT_TOOLS_URL = process.env.IT_TOOLS_MCP_URL || 'http://it-tools-mcp-server:3000/mcp';
const LITELLM_BASE_URL = process.env.LITELLM_BASE_URL || 'http://localhost:8080';
const LITELLM_API_KEY = process.env.LITELLM_API_KEY || 'sk-1234';
const MODEL_ID = process.env.CHATBOT_V2_MODEL || process.env.LITELLM_MODEL || 'qwen.qwen3-32b-v1:0';

// Static user identity (same as chatbot-host)
const STATIC_USER = {
  name: 'Aurélien Delamarre',
  email: 'aurelien.delamarre@company.com',
  role: 'Pre-Sales Engineer',
  department: 'Sales Department',
  employeeId: 'EMP-2025-001'
};

const SYSTEM_PROMPT = `You are a helpful corporate assistant for HR and IT support.
You have access to two sets of tools:
- HR tools: look up employee profiles, managers, departments, direct reports
- IT tools: look up IT tickets, search tickets, ticket statistics

The current user is ${STATIC_USER.name} (${STATIC_USER.email}), ${STATIC_USER.role} in the ${STATIC_USER.department}.

When answering questions, think step-by-step:
1. Identify what information you need
2. Call the appropriate tools to gather ALL relevant data before answering
3. If a question spans both HR and IT (e.g. "tickets needing manager approval"), call BOTH HR and IT tools — first look up the employee/manager info, then cross-reference with ticket data

When a user asks about "my tickets" or "my information", use their email: ${STATIC_USER.email}.
Always be professional, concise, and helpful.`;

// --- LLM Model ---

const openai = createOpenAI({
  baseURL: `${LITELLM_BASE_URL}/v1`,
  apiKey: LITELLM_API_KEY,
});

function getModel() {
  return openai.chat(MODEL_ID);
}

// --- Session store (in-memory) ---

const sessions = new Map();

function getSession(userId) {
  if (!sessions.has(userId)) {
    sessions.set(userId, { messageHistory: [] });
  }
  return sessions.get(userId);
}

// --- MCP Clients ---

let hrMCPClient = null;
let itMCPClient = null;

async function initMCPClients() {
  try {
    hrMCPClient = await createMCPClient({
      transport: { type: 'http', url: HR_TOOLS_URL },
    });
    console.log(`HR MCP client connected: ${HR_TOOLS_URL}`);
  } catch (err) {
    console.error(`Failed to connect HR MCP client: ${err.message}`);
  }

  try {
    itMCPClient = await createMCPClient({
      transport: { type: 'http', url: IT_TOOLS_URL },
    });
    console.log(`IT MCP client connected: ${IT_TOOLS_URL}`);
  } catch (err) {
    console.error(`Failed to connect IT MCP client: ${err.message}`);
  }
}

async function getMCPTools() {
  const tools = {};
  try {
    if (hrMCPClient) Object.assign(tools, await hrMCPClient.tools());
  } catch (err) {
    console.warn(`HR MCP tools unavailable: ${err.message}`);
  }
  try {
    if (itMCPClient) Object.assign(tools, await itMCPClient.tools());
  } catch (err) {
    console.warn(`IT MCP tools unavailable: ${err.message}`);
  }
  return tools;
}

// --- Middleware ---

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '1mb' }));

// Serve frontend static files (shared with chatbot-host)
app.use(express.static(path.join(__dirname, '../frontend')));

// --- Routes ---

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'chatbot-v2',
    timestamp: new Date().toISOString(),
    mcpStatus: hrMCPClient && itMCPClient ? 'connected' : 'partial',
    serviceAvailable: true,
    message: 'All services operational',
  });
});

// LLM providers endpoint — returns single provider since we go direct through LiteLLM
app.get('/api/llm-providers', (_req, res) => {
  res.json({
    providers: [
      {
        id: 'litellm',
        name: 'LiteLLM',
        display_name: 'LiteLLM Gateway',
        logo: './images/openai.svg',
        configured: true,
      },
    ],
    default_provider: 'litellm',
  });
});

// i18n endpoints — proxy from frontend directory
app.get('/api/translations/:language', (req, res) => {
  const langFile = path.join(__dirname, '../frontend/locales', req.params.language, 'frontend.json');
  res.sendFile(langFile, (err) => {
    if (err) res.status(404).json({ error: 'Translation not found', language: req.params.language });
  });
});

app.get('/api/languages', async (_req, res) => {
  try {
    const fs = await import('fs');
    const localesDir = path.join(__dirname, '../frontend/locales');
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

app.post('/api/clear-session', (req, res) => {
  const userId = req.headers['x-user-id'] || 'anonymous-user';
  sessions.delete(userId);
  res.json({ success: true, message: 'Session cleared' });
});

// --- Main chat endpoint (SSE, same protocol as chatbot-host) ---

app.post('/api/process-prompt', async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Messages are required and must be a non-empty array.' });
  }

  const userId = req.headers['x-user-id'] || 'anonymous-user';
  const session = getSession(userId);
  const userMessage = messages[messages.length - 1];

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Transfer-Encoding', 'chunked');

  const sendSSE = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  sendSSE({ type: 'thinking', message: 'Analyzing your request...' });

  try {
    sendSSE({ type: 'thinking', message: 'Loading MCP tools...' });
    const tools = await getMCPTools();
    const toolCount = Object.keys(tools).length;
    sendSSE({ type: 'thinking', message: `${toolCount} tools available` });

    // Build AI SDK messages from chat history
    const aiMessages = messages.map(m => ({
      role: m.role === 'bot' ? 'assistant' : m.role,
      content: m.content,
    }));

    sendSSE({ type: 'thinking', message: `Calling ${MODEL_ID}...` });

    const result = await generateText({
      model: getModel(),
      system: SYSTEM_PROMPT,
      messages: aiMessages,
      tools,
      stopWhen: stepCountIs(5),
      onStepFinish: ({ toolCalls, toolResults }) => {
        if (toolCalls && toolCalls.length > 0) {
          for (const tc of toolCalls) {
            sendSSE({ type: 'thinking', message: `Tool call: ${tc.toolName}` });
          }
        }
        if (toolResults && toolResults.length > 0) {
          sendSSE({ type: 'thinking', message: 'Processing tool results...' });
        }
      },
    });

    const fullText = result.text;
    const usage = result.usage;

    // Store in session
    if (userMessage && userMessage.role === 'user') {
      session.messageHistory.push({ role: 'user', content: userMessage.content });
    }
    session.messageHistory.push({ role: 'assistant', content: fullText });

    sendSSE({ type: 'thinking', message: 'Response ready' });

    // Send final response in the same format the frontend expects
    sendSSE({
      type: 'response',
      messages: [{ role: 'assistant', content: fullText }],
      sessionId: userId,
      source: 'ai-sdk-mcp',
      metadata: {
        total_tokens: usage?.totalTokens || 0,
        coordinator_tokens: 0,
        agent_tokens: usage?.totalTokens || 0,
        llmProvider: {
          id: 'litellm',
          name: 'LiteLLM',
          logo: './images/openai.svg',
        },
      },
    });
  } catch (err) {
    console.error('Error in process-prompt:', err);
    sendSSE({ type: 'error', error: 'Failed to process query', message: err.message });
  }

  res.write('data: [DONE]\n\n');
  res.end();
});

// --- Startup ---

async function main() {
  await initMCPClients();

  app.listen(PORT, () => {
    console.log(`Chatbot V2 running on http://localhost:${PORT}`);
    console.log(`Model: ${MODEL_ID} via LiteLLM at ${LITELLM_BASE_URL}`);
    console.log(`HR tools: ${HR_TOOLS_URL}`);
    console.log(`IT tools: ${IT_TOOLS_URL}`);
  });
}

main().catch(err => {
  console.error('Failed to start Chatbot V2:', err);
  process.exit(1);
});

// Graceful shutdown
async function shutdown() {
  console.log('Shutting down...');
  try { await hrMCPClient?.close(); } catch (_) {}
  try { await itMCPClient?.close(); } catch (_) {}
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
