# PRD: Chatbot V2 — AI SDK Native Frontend

## Goal

Replace the DIY vanilla JS frontend and custom SSE endpoint with AI SDK's native stack. Minimize custom code — rely on framework-provided hooks, streaming protocol, and components. Support a 3-phase demo (Normal, Risky, Protected) with model selection, guardrail enforcement, and i18n.

## Architecture

```
React Frontend (@ai-sdk/react useChat v3)
    ↕ AI SDK UI Message Stream Protocol (automatic)
Express Backend (streamText + pipeUIMessageStreamToResponse)
    ↕ AI SDK native tool calling
MCP Tools via LiteLLM /mcp/ aggregator (@ai-sdk/mcp)
    ↕
LiteLLM /v1 → Multi-provider (AWS Bedrock, GCP Vertex AI, Azure OpenAI)
    ↕ (Phase 3 only)
Prisma AIRS guardrails via LiteLLM metadata injection
```

### Key SDK Versions
- `ai` v5+ (streamText, convertToModelMessages, DefaultChatTransport, pipeUIMessageStreamToResponse)
- `@ai-sdk/react` v3 (useChat with UIMessage parts API, sendMessage, status)
- `@ai-sdk/openai` (OpenAI-compatible provider pointing at LiteLLM)
- `@ai-sdk/mcp` (MCP client for tool discovery)

---

## Backend

### Chat Endpoint

```js
import { streamText, convertToModelMessages } from 'ai';

app.post('/api/chat', async (req, res) => {
  const requestedModel = req.body.model;
  const phase = req.body.phase;
  const guarded = phase === 'phase3';
  const tools = await getMCPTools();
  const messages = await convertToModelMessages(req.body.messages, { tools });

  const result = streamText({
    model: getModel(requestedModel, guarded),
    system: SYSTEM_PROMPT,
    messages, tools, maxSteps: 10,
  });

  result.pipeUIMessageStreamToResponse(res);
});
```

Key details:
- `convertToModelMessages()` is required because `@ai-sdk/react` v3 sends `UIMessage[]` (with `parts`) but `streamText` expects `ModelMessage[]` (with `content`)
- `pipeUIMessageStreamToResponse` (not `pipeDataStreamToResponse` which was removed in AI SDK v5+)
- `getModel(modelId, guarded)` switches between normal and guardrail-injecting providers

### Guardrail Provider

Phase 3 enforces Prisma AIRS guardrails via a custom `fetch` wrapper on `@ai-sdk/openai`:

```js
const openaiGuarded = createOpenAI({
  baseURL: `${LITELLM_BASE_URL}/v1`,
  apiKey: LITELLM_API_KEY,
  fetch: async (url, init) => {
    if (init?.body) {
      const body = JSON.parse(init.body);
      body.metadata = { ...body.metadata, guardrails: ['PANW'] };
      init = { ...init, body: JSON.stringify(body) };
    }
    return fetch(url, init);
  },
});
```

LiteLLM intercepts requests with `metadata.guardrails` and runs them through the configured Prisma AIRS profile before forwarding to the LLM.

### Model Discovery

`GET /api/models` fetches available models from LiteLLM's `/model/info` endpoint and maps provider labels:
- `bedrock` / `bedrock_converse` → AWS
- `vertex_ai` → GCP
- `azure` / `azure_ai` → Azure
- `anthropic` → Anthropic, `openai` → OpenAI, `ollama` → Ollama

Returns `{ models: [{ id, name, provider }], default: MODEL_ID }`.

### AIRS Config

`GET /api/airs-config` returns `{ tsgId, appId, baseUrl }` for building Strata Cloud Manager report links in the frontend. Report URL format:
```
{baseUrl}/{tr_id}/{appId}/LiteLLM/transactions/{scan_id}/0?tsg_id={tsgId}#date=24hr
```

### Other Endpoints
- `GET /health` — service health with MCP status
- `GET /api/translations/:language` — locale JSON for a language
- `GET /api/languages` — available language codes
- `GET /{*path}` — SPA fallback serving React build

---

## Frontend

### Tech Stack
- **React 19** + **Vite**
- **`@ai-sdk/react` v3** — `useChat` hook (UIMessage parts API)
- **`react-markdown`** — markdown rendering
- **`ai`** — `DefaultChatTransport` for dynamic request body

### AI SDK v3 API Notes

`useChat` v3 differs from v2:
- Returns `sendMessage({ text })` instead of `append()`
- No built-in `input`/`handleInputChange`/`handleSubmit` — use local state
- Messages use `parts` array (not `content` string): `part.type` is `'text'` or `'tool-invocation'`
- `status` is `'streaming'` | `'submitted'` | `'ready'` | `'error'` (no `isLoading`)
- Transport configured via `DefaultChatTransport`, not `body` option on `useChat`

### Dynamic Request Body (Model + Phase)

The transport must send the current model and phase with each request. Since `DefaultChatTransport` is instantiated once, use a shared ref:

```jsx
const bodyRef = { model: '', phase: '' };
const transport = new DefaultChatTransport({
  api: '/api/chat',
  body: () => ({ model: bodyRef.model, phase: bodyRef.phase }),
});

export function ChatProvider({ model, phase, children }) {
  bodyRef.model = model;
  bodyRef.phase = phase;
  const chat = useChat({ transport });
  // ...
}
```

### Phase Tracking Per Message

Messages persist across phase switches. Each message is tagged with the phase it was sent in:
- `ChatContext` maintains a `phaseMap` (messageId → phase) via ref
- Phase is captured at `sendMessage()` time; assistant messages inherit from their triggering user message
- Phase dividers rendered in the message list when the phase changes between consecutive user messages
- Messages styled with phase-specific colors (green=phase1, red=phase2, blue=phase3)

### Guardrail Error Display

When LiteLLM blocks a request via Prisma AIRS (Phase 3), the error is parsed and displayed:
1. Parse the Python-dict-style error string (replace `'`→`"`, `True`→`true`, `False`→`false`)
2. Extract `type`, `tr_id`, `scan_id`, `prompt_detected`/`response_detected`
3. Display translated message via `t('guardrail.blocked')` (all 9 locales)
4. Show detected risk flags as chips
5. Build and show a "View security report" link to Strata Cloud Manager

### Components

```
LanguageProvider (context: t, language, setLanguage, languages)
└── App
    ├── Header
    │   ├── Brand (otter icon + t('app.brand'))
    │   ├── PhaseNav (3 buttons, labels from t('phases.phaseN.label'))
    │   ├── ModelSelector (provider label + model name from /api/models)
    │   └── Controls (theme toggle, language selector, user chip)
    ├── Main
    │   ├── Sidebar (example questions from t('questions.phaseN'))
    │   └── ChatPanel
    │       ├── PhaseDivider (shown when phase changes between messages)
    │       ├── Messages (user + bot, styled per phase)
    │       ├── GuardrailError (Phase 3 blocks with report link)
    │       └── ChatInput (local state, sendMessage on submit)
    └── ChatProvider (wraps useChat, manages phaseMap, exposes context)
```

---

## 3-Phase Demo

| Phase | CSS Color | Behavior |
|-------|-----------|----------|
| Phase 1 — Normal Usage | `--green` (#00CC66) | Standard LLM + MCP tools |
| Phase 2 — Risky Usage | `--red` (#C84727) | Same backend, attack prompts in sidebar |
| Phase 3 — Protected Mode | `--blue` (#00C0E8) | Guardrails enforced via LiteLLM PANW profile |

- Phase state in `App.jsx`, persisted to `localStorage`
- Phase CSS applied via `.phase{N}-active` on app wrapper (controls `--phase` CSS variable)
- Per-message phase colors applied via `.message.phase{N}` classes
- Phase dividers shown in message list at phase transitions

---

## i18n

- React context: `LanguageProvider` wraps the app, exposes `{ t, language, setLanguage, languages }`
- `t('key')` resolves strings from loaded locale JSON, supports `{{var}}` interpolation
- 9 locales: en, fr, es, de, ja, pt, zh, ar, it — all use formal register
- Phase questions come from locale data (`questions.phase1`, etc.) — no hardcoded English
- Guardrail messages translated: `guardrail.blocked`, `guardrail.viewReport`, `guardrail.error`
- Language persisted to `localStorage`, fetched from `/api/translations/{lang}`

---

## Build & Deploy

### Docker
Multi-stage Dockerfile: Stage 1 builds React with Vite, Stage 2 runs Express serving built frontend + locales.

### Package Structure
```
chatbot-v2/
├── backend/
│   └── server.js          # Express + streamText + MCP + guardrails
├── frontend/
│   ├── package.json        # React 19, @ai-sdk/react v3, react-markdown, vite
│   ├── vite.config.js      # Proxy /api to backend in dev
│   ├── index.html
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx
│   │   ├── components/     # Header, Sidebar, ChatPanel
│   │   ├── context/        # ChatContext, LanguageContext
│   │   ├── hooks/          # useModels, useAirsConfig
│   │   └── styles/         # Palo Alto Networks theme
│   └── public/
│       ├── fonts/          # TT Hoves, Material Symbols, Otter icon
│       └── images/
├── package.json            # Backend deps (ai, @ai-sdk/mcp, @ai-sdk/openai, express)
└── Dockerfile
```

### Environment Variables
- `LITELLM_BASE_URL` — LiteLLM proxy URL
- `LITELLM_API_KEY` — API key for LiteLLM
- `CHATBOT_V2_MODEL` / `LITELLM_MODEL` — Default model ID
- `MCP_URL` — MCP aggregator endpoint (defaults to `{LITELLM_BASE_URL}/mcp/`)
- `PRISMA_AIRS_TSG_ID` — Strata Cloud Manager tenant ID (for report links)
- `PRISMA_AIRS_APP_ID` — AIRS application ID (for report links)
- `CHATBOT_V2_PORT` — Server port (default 3008)
