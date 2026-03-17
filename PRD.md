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
- `ai` v6+ (streamText, convertToModelMessages, stepCountIs, DefaultChatTransport, pipeUIMessageStreamToResponse)
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
    messages, tools, stopWhen: stepCountIs(10),
  });

  result.pipeUIMessageStreamToResponse(res);
});
```

Key details:
- `convertToModelMessages()` is required because `@ai-sdk/react` v3 sends `UIMessage[]` (with `parts`) but `streamText` expects `ModelMessage[]` (with `content`)
- `pipeUIMessageStreamToResponse` (not `pipeDataStreamToResponse` which was removed in AI SDK v5+)
- `getModel(modelId, guarded)` switches between normal and guardrail-injecting providers

### Guardrail Provider

Phase 3 enforces Prisma AIRS guardrails via a custom `fetch` wrapper on `@ai-sdk/openai`. The guardrail name is configurable via `LITELLM_GUARDRAIL_NAME` env var:

```js
const GUARDRAIL_NAME = process.env.LITELLM_GUARDRAIL_NAME || '';

const openaiGuarded = createOpenAI({
  baseURL: `${LITELLM_BASE_URL}/v1`,
  apiKey: LITELLM_API_KEY,
  fetch: async (url, init) => {
    if (init?.body) {
      const body = JSON.parse(init.body);
      body.user = STATIC_USER.email;
      body.metadata = { ...body.metadata, app_user: STATIC_USER.email, ... };
      body.guardrails = [GUARDRAIL_NAME];
      init = { ...init, body: JSON.stringify(body) };
    }
    return fetch(url, init);
  },
});
```

LiteLLM intercepts requests with `body.guardrails` and runs them through the configured guardrail profile (e.g. Prisma AIRS) before forwarding to the LLM. Currently only `pre_call` (input scanning) is effective — `post_call` (response scanning) is [not firing due to a LiteLLM bug](https://github.com/BerriAI/litellm/issues/23561).

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
- `CHATBOT_V2_MODEL` — Default model ID
- `MCP_URL` — MCP aggregator endpoint (defaults to `{LITELLM_BASE_URL}/mcp/`)
- `LITELLM_GUARDRAIL_NAME` — Name of the LiteLLM guardrail to enforce in Phase 3 (e.g. `PANW`)
- `PRISMA_AIRS_TSG_ID` — Strata Cloud Manager tenant ID (for report links)
- `PRISMA_AIRS_APP_ID` — AIRS application ID (for report links)
- `CHATBOT_V2_PORT` — Server port (default 3008)

---

## AI Integration Patterns

The demo showcases three distinct patterns an AI developer would use to build AI applications, each with its own security surface. This covers the full spectrum of how AI apps are built today — from simple tool calling to autonomous multi-agent systems — so security teams can understand and address risks at every layer.

### Target Architecture

```
                     ┌──────────────────────────────────────────┐
                     │         Chatbot V2 (React + Elements)    │
                     │   AI SDK useChat + AI Elements components │
                     └──────────────┬───────────────────────────┘
                                    │
                     ┌──────────────▼───────────────────────────┐
                     │      Chatbot V2 Backend (Express)        │
                     │                                          │
                     │  Pattern A: streamText + MCP tools       │
                     │  Pattern B: ToolLoopAgent + local tools  │
                     │  Pattern C: A2A client                   │
                     │  + @ai-sdk/devtools observability        │
                     └──┬───────────┬───────────────┬───────────┘
                        │           │               │
             ┌──────────▼──┐  ┌─────▼──────┐  ┌────▼───────────┐
             │ MCP Servers │  │ AI SDK     │  │ A2A Agent      │
             │ (data only) │  │ Agent      │  │ (own LLM)      │
             │             │  │ (local)    │  │                │
             │ hr-tools    │  │ IT Triage  │  │ IT Approval    │
             │ it-tools    │  │            │  │ Agent          │
             └─────────────┘  └────────────┘  └────────────────┘
```

### Vercel AI SDK Stack

The demo relies entirely on the Vercel AI SDK ecosystem — from protocol to agent logic to UI to observability:

| Package | Role | Pattern |
|---|---|---|
| `ai` v6+ | `streamText`, `ToolLoopAgent`, `tool()` with `inputSchema`, `stopWhen`, lifecycle hooks | A + B |
| `@ai-sdk/react` v3 | `useChat`, `DefaultChatTransport`, UIMessage parts API | All |
| `@ai-sdk/mcp` | MCP client — connects to MCP servers, auto-converts tools to AI SDK format | A |
| `@ai-sdk/openai` | OpenAI-compatible provider (LiteLLM bridge) | All |
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

### Pattern B — ToolLoopAgent with `inputSchema` (new)

An intelligent agent with local business logic tools + MCP tools. Uses AI SDK `ToolLoopAgent` class with `inputSchema`-defined tools that compose MCP calls with deterministic business rules.

**User flow**: "I need USB access" — agent reasons across multiple steps: fetch employee, check policy, find assets, create ticket.

**Implementation**: Refactors the existing `streamText` + `_instructions` pattern into a proper `ToolLoopAgent` with explicit local tools for triage and classification. The `_instructions` hack in `search_it_processes` becomes a structured agent workflow with lifecycle hooks.

**Key AI SDK features used**:
- `ToolLoopAgent` — encapsulates model, instructions, tools, and loop behavior
- `tool()` with `inputSchema` — local tools with Zod-validated inputs and business logic
- `needsApproval: true` — framework-level human-in-the-loop for mutation tools
- `stopWhen: stepCountIs(N)` — bounded autonomy
- `experimental_onToolCallStart/Finish` — audit trail for every tool call
- `prepareStep` — inject or mutate state between steps

**Security surface** (additive to Pattern A):
- Agent autonomy — multi-step loop makes decisions without human checkpoints
- Tool chain escalation — local tool calls MCP tool, privilege context gets confused
- Business logic bypass — LLM decides to skip an approval step
- Cost/resource abuse — runaway tool loops (`stepCountIs` mitigates)
- Confused deputy — agent acts with server's permissions, not user's

### Pattern C — A2A Agent (new)

An autonomous agent with its own LLM, exposed as an A2A HTTP endpoint. The orchestrator delegates entire workflows to it. Internally powered by `ToolLoopAgent`, but exposed over the A2A protocol (agent card discovery, task delegation, status polling).

**User flow**: "Onboard new hire Sarah Chen" — orchestrator delegates to IT Approval Agent, which autonomously manages the approval workflow (checks manager, sends notifications, tracks status). Consumes HR data via MCP.

**Implementation**: New standalone service (`it-approval-a2a-agent/`) with Express routes implementing A2A protocol. Internally uses `ToolLoopAgent` with MCP tools. No `@ai-sdk/a2a` package exists yet — A2A protocol is implemented directly.

**Security surface** (additive to Patterns A + B):
- Agent identity/trust — how does the orchestrator verify the remote agent?
- Data leakage across agent boundaries — IT agent accesses HR data it shouldn't see
- Agent card spoofing — malicious agent advertises capabilities it weaponizes
- Cascading failures — one compromised agent poisons the chain
- Audit trail gaps — which agent made the decision? Which LLM call?
- No standard auth in A2A protocol yet

### Pattern Matrix

| | MCP Tools (A) | ToolLoopAgent (B) | A2A Agent (C) |
|---|---|---|---|
| **LLM** | None | One (in chatbot-v2) | Own LLM per agent |
| **Intelligence** | Zero | Centralized reasoning | Distributed reasoning |
| **Protocol** | MCP (JSON-RPC) | Internal (AI SDK) | A2A (HTTP + agent cards) |
| **Example flow** | "Get ticket X" | "I need USB access" | "Onboard new hire" |
| **Human-in-loop** | `needsApproval` on tools | Agent decides when to ask | Agent-to-agent negotiation |
| **Guardrail point** | LiteLLM pre/post call | LiteLLM + agent lifecycle hooks | Per-agent + orchestrator + AIRS |

### Security Demo Phases x Patterns

| | Phase 1 (Normal) | Phase 2 (Risky) | Phase 3 (Protected) |
|---|---|---|---|
| **Pattern A** | Lookup works | Inject via ticket description | AIRS blocks injection |
| **Pattern B** | Triage works | Trick agent into skipping approval | Agent guardrails + AIRS |
| **Pattern C** | Onboarding works | Spoof agent identity / data leak | Agent auth + AIRS + audit |

---

## Implementation Roadmap

### Status Key
- [ ] Not started
- [x] Complete

### Phase 1 — ToolLoopAgent (Pattern B)

**Goal**: Replace `streamText` + `_instructions` hack with a proper AI SDK agent that demonstrates multi-step reasoning with local business logic tools.

**Scope**:
- [ ] Create `chatbot-v2/backend/agents/it-triage-agent.js`
  - `ToolLoopAgent` with `instructions` (system prompt)
  - Local tools defined with `tool()` + `inputSchema`: classify severity, check SLA, assign team
  - Merge MCP tools via `@ai-sdk/mcp` for data access (get_employee, get_ticket, etc.)
  - Lifecycle hooks (`experimental_onToolCallStart/Finish`) for audit logging
  - `stopWhen: stepCountIs(10)` for bounded autonomy
  - `needsApproval: true` on mutation tools (create_ticket, update_ticket_status)
- [ ] Add mode toggle in `/api/chat` — request body includes `pattern: 'mcp' | 'agent'`
  - `mcp` mode: current `streamText` + MCP tools (Pattern A, unchanged)
  - `agent` mode: `ToolLoopAgent.stream()` + `pipeUIMessageStreamToResponse` (Pattern B)
- [ ] Frontend: pattern selector in header (alongside model selector)
  - Transport `body()` sends `pattern` field
  - No other frontend changes needed — `useChat` + `pipeUIMessageStreamToResponse` handles both modes identically

**Key files**:
- `chatbot-v2/backend/agents/it-triage-agent.js` (new)
- `chatbot-v2/backend/server.js` (modified — route branching)
- `chatbot-v2/frontend/src/components/Header.jsx` (modified — pattern selector)
- `chatbot-v2/frontend/src/context/ChatContext.jsx` (modified — pattern in transport body)

**Validates**: `ToolLoopAgent`, `tool()` with `inputSchema`, lifecycle hooks, `needsApproval`, bounded step loops.

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

### Phase 4 — A2A Agent (Pattern C)

**Goal**: Build a standalone IT Approval Agent as an A2A server with its own LLM. The chatbot-v2 orchestrator delegates approval workflows to it. Demonstrates distributed autonomous agents.

**Scope**:
- [ ] Create new service: `mcp-server/it-approval-a2a-agent/`
  - Express server implementing A2A protocol:
    - `GET /.well-known/agent.json` — agent card (name, capabilities, endpoints)
    - `POST /tasks` — create a new task (approval workflow)
    - `GET /tasks/:id` — poll task status
    - `POST /tasks/:id/cancel` — cancel a running task
  - Internally powered by `ToolLoopAgent`:
    - Consumes HR MCP tools (get_employee, get manager for approval chain)
    - Consumes IT MCP tools (get_ticket, update_ticket_status)
    - Own system prompt for approval domain expertise
    - Lifecycle hooks for audit trail
  - Own `Dockerfile`, own port in `docker-compose.yml`
- [ ] Add A2A client to chatbot-v2 backend:
  - Discover agent via `/.well-known/agent.json`
  - Delegate approval workflows via `POST /tasks`
  - Poll or stream task status
  - Add `pattern: 'a2a'` mode to `/api/chat` route
- [ ] Frontend:
  - Add `'a2a'` option to pattern selector
  - `<Canvas />` + `<Node />` + `<Edge />` (AI Elements Workflow components) to visualize agent delegation
  - `<Task />` component to show A2A task progress

**Key files**:
- `mcp-server/it-approval-a2a-agent/` (new service)
- `chatbot-v2/backend/server.js` (modified — A2A client, route branching)
- `chatbot-v2/frontend/src/components/` (modified — workflow visualization)
- `docker-compose.yml` (new service entry)

**Validates**: A2A protocol, distributed agent autonomy, agent identity/trust, cross-agent data flow, multi-agent audit trail.

### Phase 5 — Security Demos per Pattern

**Goal**: Add concrete Phase 2 (Risky) attack scenarios and Phase 3 (Protected) mitigations for each integration pattern.

**Scope**:
- [ ] Pattern A attacks:
  - Seed a ticket with prompt injection payload in its description
  - Demonstrate excessive data exposure (tool returning PII)
  - Sidebar questions for Phase 2 that trigger these attacks
- [ ] Pattern B attacks:
  - Craft prompt that tricks the agent into skipping the approval step
  - Demonstrate confused deputy (agent creates ticket as wrong user)
  - Demonstrate runaway loop (agent keeps calling tools in a cycle)
  - Sidebar questions for Phase 2 that trigger these attacks
- [ ] Pattern C attacks:
  - Demonstrate agent spoofing (fake agent card)
  - Demonstrate data leakage across agent boundaries
  - Sidebar questions for Phase 2 that trigger these attacks
- [ ] Phase 3 mitigations for each:
  - AIRS guardrails at LiteLLM level (existing)
  - Agent lifecycle hooks that detect and block suspicious tool chains (Pattern B)
  - Agent authentication and authorization at A2A level (Pattern C)
  - Audit logging across all patterns via DevTools
- [ ] Update i18n: add Phase 2 sidebar questions for Patterns B and C across all 9 locales

**Key files**:
- `mcp-server/it-tools-mcp-server/` (modified — seeded attack data)
- `chatbot-v2/backend/agents/` (modified — security hooks)
- `chatbot-v2/frontend/public/locales/*/frontend.json` (modified — new sidebar questions)

**Validates**: Full security demo narrative across all integration patterns and all 3 phases.

---

## Future Evolution

### Travel/Expense Agent (A2A)

Natural next A2A candidate. Own domain with distinct data (receipts, budgets, travel policies), approval chains, and cross-department dependencies:
- HR MCP tools for employee profile, manager, department budget
- IT MCP tools for corporate card provisioning, VPN for travel
- Own approval logic (expense thresholds, policy compliance, receipt validation)

Would demonstrate a **multi-agent A2A mesh** where three+ agents (IT Approval, Travel/Expense, and potentially HR Policy) negotiate across domain boundaries. Each agent is a `ToolLoopAgent` internally, exposed as A2A externally, consuming shared MCP data servers.

### Additional Patterns to Consider

- **`@ai-sdk/gateway`** — could replace LiteLLM for provider routing in a "pure Vercel stack" variant
- **Chat SDK** (`chat` npm package) — Slack/Teams/Discord bot frontend as an alternative to the web UI, demonstrating the same backend patterns consumed by different surfaces
- **RAG** — vector search over IT knowledge base or HR policy documents, adding retrieval-augmented generation as another integration pattern with its own security surface (data poisoning, context window stuffing)



# STOP HERE DO NOT FOLLOW
Here are the starter prompts you can paste at the beginning of each session:                                                                                                                                                                                                                                         
                                                                                                                                                                                                                                                                                                                     
  ---                                                                                                                                                                                                                                                                                                                  
  Session 1:                                                
  ▎ Read PRD.md — Implementation Roadmap, Phase 1 (ToolLoopAgent). Build everything described in that phase.                                                                                                                                                                                                           
                                                                                                                                                                                                                                                                                                                       
  Session 2:
  ▎ Read PRD.md — Implementation Roadmap, Phase 2 (AI Elements Frontend). Build everything described in that phase.

  Session 3:
  ▎ Read PRD.md — Implementation Roadmap, Phase 3 (DevTools + Observability). Build everything described in that phase.

  Session 4:
  ▎ Read PRD.md — Implementation Roadmap, Phase 4 (A2A Agent). Build everything described in that phase.

  Session 5:
  ▎ Read PRD.md — Implementation Roadmap, Phase 5 (Security Demos per Pattern). Build everything described in that phase.