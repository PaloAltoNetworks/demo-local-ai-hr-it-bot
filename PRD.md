# PRD: Chatbot V2 — AI SDK Native Frontend

## Goal

Replace the DIY vanilla JS frontend and custom SSE endpoint with AI SDK's native stack. Minimize custom code — rely on framework-provided hooks, streaming protocol, and components. Support a 3-phase demo (Normal, Risky, Protected) with model selection, guardrail enforcement, and i18n.

## Architecture

```
React Frontend (@ai-sdk/react useChat v3)
    ↕ AI SDK UI Message Stream Protocol (automatic)
Express Backend (streamText + pipeUIMessageStreamToResponse)
    ↕ AI SDK native tool calling
MCP Tools via Portkey MCP Gateway (mcp.portkey.ai/{slug}/mcp, @ai-sdk/mcp, one client per server)
    ↕
Portkey api.portkey.ai/v1 → Multi-provider (AWS Bedrock, GCP Vertex AI, Azure OpenAI)
    ↕ (Phase 3 only)
Prisma AIRS guardrails via Portkey config (input + output)
```

### Key SDK Versions
- `ai` v6+ (streamText, ToolLoopAgent, tool() with inputSchema, convertToModelMessages, stepCountIs, DefaultChatTransport, pipeUIMessageStreamToResponse, pipeAgentUIStreamToResponse)
- `@ai-sdk/react` v3 (useChat with UIMessage parts API, sendMessage, status)
- `@ai-sdk/openai` (OpenAI-compatible provider pointing at Portkey)
- `@ai-sdk/mcp` (MCP client for tool discovery — used by both chatbot-v2 and agentic MCP servers)

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
    messages, tools, stopWhen: stepCountIs(10),
  });

  result.pipeUIMessageStreamToResponse(res);
});
```

Key details:
- `convertToModelMessages()` is required because `@ai-sdk/react` v3 sends `UIMessage[]` (with `parts`) but `streamText` expects `ModelMessage[]` (with `content`)
- `pipeUIMessageStreamToResponse` (not `pipeDataStreamToResponse` which was removed in AI SDK v5+)
- `getModel(modelId, guarded)` switches between normal and guardrail-injecting providers

### Guardrail Provider (two-key model)

Phase 3 enforces Prisma AIRS guardrails through the **API key's attached Portkey config**, not a per-request `x-portkey-config` header. Two workspace keys are provisioned in the Portkey dashboard:

- `PORTKEY_API_KEY` — default/unguarded. Its config may enable simple response caching, retry, etc.
- `PORTKEY_API_KEY_GUARDED` — guarded. Its config attaches the PANW Prisma AIRS guardrail as both `before_request_hooks` (input) and `after_request_hooks` (output). Falls back to `PORTKEY_API_KEY` if unset.

The `fetch` wrapper just swaps which key it sends — the guard rides on the key server-side, keeping guardrail wiring out of the app code:

```js
function portkeyFetch(reqCtx, guarded = false, noParallel = false) {
  return async (url, init) => {
    const headers = new Headers(init?.headers);
    headers.set('x-portkey-api-key', guarded ? PORTKEY_API_KEY_GUARDED : PORTKEY_API_KEY);
    headers.set('x-portkey-trace-id', reqCtx.traceId);
    headers.set('x-portkey-metadata', JSON.stringify({ _user: STATIC_USER.employee_id, ... }));
    return fetch(url, { ...init, headers });
  };
}
```

Example config attached to the guarded key (retry + cache + AIRS input/output hooks):

```json
{
  "retry": { "attempts": 3 },
  "cache": { "mode": "simple" },
  "before_request_hooks": [{ "id": "<airs-input-guardrail-id>" }],
  "after_request_hooks":  [{ "id": "<airs-output-guardrail-id>" }]
}
```

Both input (pre-call) and output (post-call) scanning run through the configured Prisma AIRS profile.

### Model Discovery

`GET /api/models` fetches available models from Portkey's `/v1/models` endpoint and maps provider labels:
- `bedrock` → AWS
- `vertex` / `gemini` → GCP
- `azure` → Azure
- `anthropic` → Anthropic, `openai` → OpenAI, `ollama` → Ollama

Returns `{ models: [{ id, name, provider }], default: MODEL_ID }`.

### AIRS Config

`GET /api/airs-config` returns `{ tsgId, appId, appName, baseUrl }` for building Strata Cloud Manager report links in the frontend. The link opens the **AI-session** view (last segment is the literal source `Portkey`):
```
{baseUrl}/{tr_id}/{appId}/Portkey
```
where `baseUrl = https://stratacloudmanager.paloaltonetworks.com/ai-security/runtime/ai-sessions`.

### Trace-id / AIRS session model

Portkey's hosted PANW AIRS plugin (`plugins/panw-prisma-airs/intercept.ts`) sends the incoming `x-portkey-trace-id` as the AIRS `tr_id` and never forwards a separate `session_id`. Strata's `/ai-sessions/{id}` view groups by that `tr_id`. So the backend sets `x-portkey-trace-id = threadId` (the stable browser-conversation id), making every turn of a conversation land in one AI-session. Consequence: thumbs feedback (which Portkey keys by trace-id) is conversation-level, not per-message — an accepted trade since the hosted plugin exposes no per-turn `session_id` field.

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
- Messages use `parts` array (not `content` string): `part.type` is `'text'`, `'tool-invocation'` (static tools), or `'dynamic-tool'` (MCP/dynamic tools)
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

When Portkey blocks a request via Prisma AIRS (Phase 3), the error is parsed and displayed:
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
| Phase 3 — Protected Mode | `--blue` (#00C0E8) | Guardrails enforced via Portkey config (PANW AIRS input + output) |

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

agents/it-triage-agent/
├── server.js               # Express + MCP SDK server (Streamable HTTP + SSE)
├── agent.js                # ToolLoopAgent + local tools + MCP client
├── package.json            # ai, @ai-sdk/mcp, @ai-sdk/openai, @modelcontextprotocol/sdk, express, zod
└── Dockerfile
```

### Environment Variables

**Chatbot V2**:
- `PORTKEY_BASE_URL` — Portkey gateway URL (`https://api.portkey.ai/v1`)
- `PORTKEY_API_KEY` — default/unguarded workspace key (config may enable caching/retry)
- `PORTKEY_API_KEY_GUARDED` — guarded key; its config runs PANW AIRS input+output hooks (Phase 3). Falls back to `PORTKEY_API_KEY`
- `PORTKEY_DEFAULT_PROVIDER` — default provider tier (AWS | GCP | Azure) when frontend sends none
- `PORTKEY_AWS_PROVIDER` / `PORTKEY_GCP_PROVIDER` / `PORTKEY_AZURE_PROVIDER` — Provider integration slugs
- `PORTKEY_MCP_BASE` — MCP Gateway base (`https://mcp.portkey.ai`)
- `PORTKEY_MCP_HR_SLUG` / `PORTKEY_MCP_IT_SLUG` — Per-server MCP slugs
- `PRISMA_AIRS_TSG_ID` — Strata Cloud Manager tenant ID (for report links)
- `PRISMA_AIRS_APP_ID` — AIRS application ID (for report links)
- `CHATBOT_V2_PORT` — Server port (default 3008)

**IT Triage Agent**:
- `PORTKEY_BASE_URL` — Portkey gateway URL (for LLM calls via `/v1`)
- `PORTKEY_API_KEY` — Portkey API key
- `PORTKEY_MCP_BASE` / `PORTKEY_MCP_HR_SLUG` / `PORTKEY_MCP_IT_SLUG` — MCP Gateway endpoints (hr-tools, it-tools)
- `IT_TRIAGE_MODEL` — Model ID for the agent's LLM (defaults to `PORTKEY_DEFAULT_MODEL`)

---

## AI Integration Patterns

The demo showcases two distinct patterns an AI developer would use to build AI applications, each with its own security surface. This covers the spectrum from simple tool calling to autonomous agent systems — so security teams can understand and address risks at every layer.

### Target Architecture

```
Any MCP client (chatbot-v2, Claude Desktop, Cursor, Portkey...)
    │
    ▼
Portkey MCP Gateway (mcp.portkey.ai/{slug}/mcp — one endpoint per server)
    ├──────────────────┬──────────────────────────────┐
    │                  │                               │
    ▼                  ▼                               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────────────────────┐
│ hr-tools     │ │ it-tools     │ │ it-triage-agent              │
│ MCP server   │ │ MCP server   │ │ MCP server (external)        │
│ (data only)  │ │ (data only)  │ │ ToolLoopAgent (internal)     │
│ No LLM       │ │ No LLM       │ │ Own LLM via Portkey /v1      │
│              │ │              │ │ + local business logic tools  │
│              │ │              │ │ + MCP tools via Portkey MCP   │
└──────────────┘ └──────────────┘ └──────────────────────────────┘
     Pattern A        Pattern A              Pattern B
```

Key insight: **MCP on the outside, ToolLoopAgent on the inside.** The IT Triage Agent looks like any other MCP server to clients — registered in the Portkey MCP Gateway, exposes tools via `/mcp`. But internally, its tools trigger multi-step agent reasoning with its own LLM. The agent consumes HR and IT data by calling back through the Portkey MCP Gateway (one client per server), so all calls flow through the gateway (observability, guardrails, rate limiting apply uniformly).

### Vercel AI SDK Stack

The demo relies entirely on the Vercel AI SDK ecosystem — from protocol to agent logic to UI to observability:

| Package | Role | Pattern |
|---|---|---|
| `ai` v6+ | `streamText`, `ToolLoopAgent`, `tool()` with `inputSchema`, `pipeAgentUIStreamToResponse`, `stopWhen`, lifecycle hooks | A + B |
| `@ai-sdk/react` v3 | `useChat`, `DefaultChatTransport`, UIMessage parts API | All |
| `@ai-sdk/mcp` | MCP client — connects to MCP servers, auto-converts tools to AI SDK format | A + B |
| `@ai-sdk/openai` | OpenAI-compatible provider (Portkey bridge) | All |
| `@ai-sdk/devtools` | Local web UI for inspecting LLM calls, tool chains, token usage, multi-step runs | All |
| AI Elements | shadcn/ui component library for AI apps (Conversation, Message, Tool, Confirmation, etc.) | All |

### Pattern A — MCP Tools (existing)

Stateless data servers with no LLM. The chatbot's LLM calls tools to read/write data.

**User flow**: "Show my tickets", "Who is my manager?"

**Services**: `hr-tools-mcp-server`, `it-tools-mcp-server`

**Security surface**:
- Tool poisoning (`_instructions` in tool responses)
- Excessive data exposure (tool returns more fields than needed)
- No auth on MCP transport (any client can call `/mcp`)
- Prompt injection via tool results (e.g. ticket description contains attack payload)
- Input validation limited to Zod schema

### Pattern B — Agentic MCP Server (new)

A standalone MCP server that wraps a `ToolLoopAgent` with its own LLM. From the outside it's a standard MCP server (registered in the Portkey MCP Gateway, any client can call its tools). On the inside, each tool invocation triggers multi-step agent reasoning with local business logic tools and remote MCP data tools.

**User flow**: "I need USB access" — chatbot-v2's LLM calls `triage_it_request` tool → IT Triage Agent internally reasons across multiple steps: fetch employee, check policy via local tools, find assets, classify severity, determine team assignment → returns structured result.

**Service**: `agents/it-triage-agent/` — separate container, own LLM, own MCP client

**How it works**:
1. The agent is registered in the Portkey MCP Gateway alongside hr-tools and it-tools
2. Any MCP client (chatbot-v2, Claude Desktop, Cursor) discovers its tools via `mcp.portkey.ai/{slug}/mcp`
3. When a tool is called, the agent's `ToolLoopAgent` runs internally:
   - LLM calls go through Portkey `/v1` (OpenAI-compatible)
   - Data access goes through the Portkey MCP Gateway (hr-tools, it-tools; one client per server)
   - Local tools apply business logic (severity classification, SLA checks, team assignment)
4. The agent returns the final result as an MCP tool response

**Key AI SDK features used**:
- `ToolLoopAgent` — encapsulates model, instructions, tools, and loop behavior
- `tool()` with `inputSchema` — local tools with Zod-validated inputs and business logic
- `@ai-sdk/mcp` — client for consuming hr-tools and it-tools via Portkey (one per server)
- `stopWhen: stepCountIs(N)` — bounded autonomy
- `experimental_onToolCallStart/Finish` — audit trail for every tool call
- MCP SDK (`@modelcontextprotocol/sdk`) — server-side for exposing tools to the Portkey MCP Gateway

**Security surface** (additive to Pattern A):
- Agent autonomy — multi-step loop makes decisions without human checkpoints
- Tool chain escalation — agent tool calls MCP tool, privilege context gets confused
- Business logic bypass — LLM decides to skip a classification or approval step
- Cost/resource abuse — runaway tool loops (`stepCountIs` mitigates)
- Confused deputy — agent acts with server's permissions, not user's
- Opaque reasoning — client sees only the final result, not the agent's internal steps
- Nested gateway calls — agent calls Portkey which calls MCP servers, creating a deep call chain

### Pattern Matrix

| | MCP Tools (A) | Agentic MCP Server (B) |
|---|---|---|
| **LLM** | None | Own LLM per agent |
| **Intelligence** | Zero — pure data pipe | Multi-step reasoning with business logic |
| **Protocol** | MCP (JSON-RPC) | MCP (external) + AI SDK (internal) |
| **Example flow** | "Get ticket X" | "I need USB access" (triage + classify + route) |
| **Discoverable by** | Any MCP client via Portkey | Any MCP client via Portkey (same as A) |
| **Human-in-loop** | Client-side `needsApproval` | Agent decides internally (no approval mid-loop) |
| **Guardrail point** | Portkey input/output config | Portkey on agent's LLM calls + agent's MCP calls |

### Security Demo Phases x Patterns

| | Phase 1 (Normal) | Phase 2 (Risky) | Phase 3 (Protected) |
|---|---|---|---|
| **Pattern A** | Lookup works | Inject via ticket description | AIRS blocks injection |
| **Pattern B** | Triage works | Trick agent into skipping classification | Agent guardrails + AIRS on nested calls |

---

## Implementation Roadmap

### Status Key
- [ ] Not started
- [x] Complete

### Phase 1 — Agentic MCP Server (Pattern B)

**Goal**: Build an IT Triage Agent as a standalone MCP server with its own LLM. MCP on the outside (registered in the Portkey MCP Gateway, discoverable by any client), `ToolLoopAgent` on the inside (multi-step reasoning with local business logic + remote MCP data tools via Portkey).

**Scope**:
- [x] Create `agents/it-triage-agent/` as a new service:
  - `server.js` — Express + MCP SDK server (`McpServer`), registers tools via `McpServer.tool()`, supports Streamable HTTP (`POST /mcp`) and SSE transports
  - `agent.js` — `ToolLoopAgent` with `instructions` (IT triage system prompt):
    - Local tools defined with `tool()` + `inputSchema`: classify severity, check SLA, assign team, check approval required
    - MCP tools via `@ai-sdk/mcp` connecting to the Portkey MCP Gateway (hr-tools, it-tools data; one client per server)
    - LLM calls via `@ai-sdk/openai` pointing at Portkey `/v1`
    - `stopWhen: stepCountIs(10)` for bounded autonomy
    - Lifecycle hooks (`experimental_onToolCallStart/Finish`) for audit logging
  - `package.json` — deps: `@modelcontextprotocol/sdk`, `ai`, `@ai-sdk/mcp`, `@ai-sdk/openai`, `express`, `zod`
  - `Dockerfile` — standalone (copies `agents/it-triage-agent/`)
  - MCP tools exposed:
    - `triage_it_request` — high-level tool: takes a user query + employee ID, runs the full triage workflow internally (fetch employee, look up process, classify severity, assign team, check approval), returns structured triage result
    - `check_ticket_sla` — takes a ticket ID, checks SLA compliance, returns status
- [x] Register with the Portkey MCP Gateway:
  - Register the agent as an MCP server alongside hr-tools and it-tools (exposed via Cloudflare tunnel)
  - Discoverable via `mcp.portkey.ai/{slug}/mcp` by any client
- [x] Add to `docker-compose.yml`:
  - New service `it-triage-agent` on port 3009 (internal 3000)
  - Env vars: `PORTKEY_BASE_URL`, `PORTKEY_API_KEY`, `PORTKEY_MCP_*`, `IT_TRIAGE_MODEL`
  - Health check on `/health`
  - Depends on `it-tools-mcp-server` and `hr-tools-mcp-server`
- [x] No chatbot-v2 changes needed — the agent's tools appear via its own MCP client connection through Portkey

**Key files**:
- `agents/it-triage-agent/server.js` (new — MCP server)
- `agents/it-triage-agent/agent.js` (new — ToolLoopAgent + local tools)
- `agents/it-triage-agent/package.json` (new)
- `agents/it-triage-agent/Dockerfile` (new)
- `docker-compose.yml` (modified — new service)

**Validates**: `ToolLoopAgent`, `tool()` with `inputSchema`, `@ai-sdk/mcp` as client, lifecycle hooks, bounded step loops, MCP-on-the-outside / agent-on-the-inside pattern, Portkey gateway for both LLM and MCP calls.

### Phase 2 — AI Elements Frontend

**Goal**: Replace custom React components with AI SDK Elements (shadcn/ui-based component library). Adds tool approval UI, reasoning display, and structured layouts that the custom frontend lacks.

**Scope**:
- [ ] Install AI Elements registry (`shadcn/ui` + `@ai-elements/*` components)
- [ ] Replace custom components with Elements equivalents:

  | Custom component | AI Elements replacement |
  |---|---|
  | `ChatPanel` | `<Conversation />` |
  | Message rendering | `<Message />` + `<Tool />` parts |
  | `ChatInput` | `<PromptInput />` |
  | `ModelSelector` | `<ModelSelector />` |
  | Sidebar questions | `<Suggestion />` |

- [ ] Add new capabilities from Elements:
  - `<Confirmation />` — UI for `needsApproval` tool calls (Pattern B mutation tools)
  - `<ChainOfThought />` / `<Reasoning />` — display agent reasoning steps (Pattern B)
  - `<Plan />` — show multi-step triage workflow (Pattern B)
  - `<Sources />` — show which MCP server provided data (Pattern A)
- [ ] Preserve existing features: phase colors, phase dividers, guardrail error display, i18n, theme toggle
- [ ] Adapt Palo Alto Networks theme to shadcn/ui token system (CSS variables)

**Key files**:
- `chatbot-v2/frontend/package.json` (new deps: shadcn/ui, AI Elements)
- `chatbot-v2/frontend/src/components/` (rewritten to use Elements)
- `chatbot-v2/frontend/src/styles/` (adapted to shadcn/ui theming)

**Validates**: AI Elements component library, `useChat` v3 integration with Elements, tool approval UX.

### Phase 3 — DevTools + Observability

**Goal**: Add `@ai-sdk/devtools` middleware for visual inspection of every LLM call, tool chain, and multi-step agent run. Works across all patterns automatically.

**Scope**:
- [ ] Install `@ai-sdk/devtools`
- [ ] Wrap model with devtools middleware in `server.js`
- [ ] Verify it captures:
  - Pattern A: single-step `streamText` + MCP tool calls
  - Pattern B: multi-step `ToolLoopAgent` runs with local + MCP tools
- [ ] Document how to access the DevTools UI (local web UI at default port)
- [ ] Add `ENABLE_DEVTOOLS` env var to toggle (dev only, not production)

**Key files**:
- `chatbot-v2/backend/server.js` (modified — devtools middleware wrapping model)
- `chatbot-v2/package.json` (new dep: `@ai-sdk/devtools`)

**Validates**: Observability for AI applications, audit trail, token tracking, tool call inspection.

### Phase 4 — Security Demos per Pattern

**Goal**: Add concrete Phase 2 (Risky) attack scenarios and Phase 3 (Protected) mitigations for each integration pattern.

**Scope**:
- [ ] Pattern A attacks:
  - Seed a ticket with prompt injection payload in its description
  - Demonstrate excessive data exposure (tool returning PII)
  - Sidebar questions for Phase 2 that trigger these attacks
- [ ] Pattern B attacks:
  - Craft prompt that tricks the agent into skipping severity classification
  - Demonstrate confused deputy (agent creates ticket as wrong user via nested MCP calls)
  - Demonstrate runaway loop (agent keeps calling tools in a cycle)
  - Demonstrate opaque reasoning (client can't see what the agent did internally)
  - Sidebar questions for Phase 2 that trigger these attacks
- [ ] Phase 3 mitigations for each:
  - AIRS guardrails at Portkey level — applies to both the agent's LLM calls and chatbot-v2's calls (existing)
  - Agent lifecycle hooks that detect and block suspicious tool chains (Pattern B)
  - Audit logging across all patterns via DevTools
- [ ] Update i18n: add Phase 2 sidebar questions for Pattern B across all 9 locales

**Key files**:
- `mcp-server/it-tools-mcp-server/` (modified — seeded attack data)
- `agents/it-triage-agent/agent.js` (modified — security hooks)
- `locales/*/frontend.json` (modified — new sidebar questions)

**Validates**: Full security demo narrative across both integration patterns and all 3 phases.

---

## Future Evolution

### Pattern C — A2A Agent

Evolve Pattern B into full A2A protocol: agent card discovery (`/.well-known/agent.json`), task delegation (`POST /tasks`), status polling, cancellation. The agentic MCP server already has its own LLM and tools — A2A would add standard inter-agent communication on top.

### Multi-Agent Mesh

Add more agentic MCP servers (Travel/Expense, HR Policy) that each wrap a `ToolLoopAgent`. All register in the Portkey MCP Gateway as MCP servers, all consume shared data via Portkey. Demonstrates cross-agent data flow, cascading guardrails, and distributed audit trails.

### Additional Patterns to Consider

- **`@ai-sdk/gateway`** — could replace Portkey for provider routing in a "pure Vercel stack" variant
- **Chat SDK** (`chat` npm package) — Slack/Teams/Discord bot frontend as an alternative to the web UI, demonstrating the same backend patterns consumed by different surfaces
- **RAG** — vector search over IT knowledge base or HR policy documents, adding retrieval-augmented generation as another integration pattern with its own security surface (data poisoning, context window stuffing)



# STOP HERE DO NOT FOLLOW
Here are the starter prompts you can paste at the beginning of each session:

  ---
  Session 1:
  ▎ Read PRD.md — Implementation Roadmap, Phase 1 (Agentic MCP Server). Build everything described in that phase.

  Session 2:
  ▎ Read PRD.md — Implementation Roadmap, Phase 2 (AI Elements Frontend). Build everything described in that phase.

  Session 3:
  ▎ Read PRD.md — Implementation Roadmap, Phase 3 (DevTools + Observability). Build everything described in that phase.

  Session 4:
  ▎ Read PRD.md — Implementation Roadmap, Phase 4 (Security Demos per Pattern). Build everything described in that phase.