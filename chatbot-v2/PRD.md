# PRD: Chatbot V2 — AI SDK Native Frontend

## Goal

Replace the DIY vanilla JS frontend and custom SSE endpoint with AI SDK's native stack. Minimize custom code — rely on framework-provided hooks, streaming protocol, and components.

## Current State

- **Frontend**: Vanilla JS, manual SSE parsing, custom markdown rendering, custom message state
- **Backend**: Express + `generateText` (waits for full response), custom SSE endpoint (`/api/process-prompt`), manual tool call events
- **Result**: ~250 lines backend, ~300 lines frontend JS, all hand-rolled

## Target State

- **Frontend**: React + `useChat` hook from `@ai-sdk/react` — zero DIY message management, streaming, or SSE parsing
- **Backend**: Express + `streamText` + `pipeDataStreamToResponse` — zero DIY SSE formatting
- **Result**: Backend chat route reduced to ~15 lines. Frontend chat logic reduced to hook usage.

---

## Architecture

```
React Frontend (useChat hook)
    ↕ AI SDK Data Stream Protocol (automatic)
Express Backend (streamText + pipeDataStreamToResponse)
    ↕ AI SDK native tool calling
MCP Tools via LiteLLM /mcp/ aggregator
    ↕
LiteLLM /v1 → Claude Opus 4.6
```

## Backend Changes

### Remove
- Custom SSE endpoint (`/api/process-prompt`)
- Manual `res.write('data: ...')` formatting
- Manual `sendSSE()` helper
- Session store (message history) — `useChat` manages client-side
- `generateText` import

### Add
- `streamText` from `ai` (replaces `generateText`)
- `pipeDataStreamToResponse` (one-liner to stream to Express response)
- Single route: `POST /api/chat` (AI SDK convention)

### Chat endpoint (entire implementation)

```js
import { streamText } from 'ai';

app.post('/api/chat', async (req, res) => {
  const tools = await getMCPTools();

  const result = streamText({
    model: getModel(),
    system: SYSTEM_PROMPT,
    messages: req.body.messages,
    tools,
    maxSteps: 10,
  });

  result.pipeDataStreamToResponse(res);
});
```

### Keep
- MCP client initialization (`createMCPClient` → LiteLLM `/mcp/`)
- LLM provider setup (`createOpenAI` → LiteLLM `/v1`)
- Static file serving for React build output
- Health endpoint
- i18n endpoints (languages, translations)

---

## Frontend Changes

### Tech Stack
- **React 19** (minimal — single-page app)
- **`@ai-sdk/react`** — `useChat` hook
- **`react-markdown`** — markdown rendering (replaces DIY regex parser)
- **Vite** — build tool (fast, zero-config for React)

### Remove
- All vanilla JS (`app.js` — 300 lines)
- DIY SSE parsing
- DIY markdown renderer
- DIY message state management
- DIY streaming handling

### Core Component

```jsx
import { useChat } from '@ai-sdk/react';
import Markdown from 'react-markdown';

function Chat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, status } = useChat();

  return (
    <div className="chat">
      <div className="chat-messages">
        {messages.map(msg => (
          <div key={msg.id} className={`message ${msg.role}`}>
            <Markdown>{msg.content}</Markdown>
            {/* Tool calls rendered automatically by useChat */}
            {msg.toolInvocations?.map(tool => (
              <div key={tool.toolCallId} className="tool-call">
                {tool.toolName}: {tool.state}
              </div>
            ))}
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} disabled={isLoading} />
        <button type="submit" disabled={isLoading}>Send</button>
      </form>
    </div>
  );
}
```

### What `useChat` handles natively
| Feature | DIY (current) | useChat (target) |
|---------|---------------|------------------|
| Message state | Manual array + localStorage | Automatic |
| Streaming | Manual SSE reader + buffer | Automatic |
| Tool call display | Manual thinking events | `msg.toolInvocations` |
| Input binding | Manual event listeners | `input` + `handleInputChange` |
| Submit | Manual fetch + SSE setup | `handleSubmit` |
| Loading state | Manual `isStreaming` flag | `isLoading` / `status` |
| Abort/cancel | Not implemented | `stop()` function |
| Error handling | Manual try/catch | `error` state |
| Message history | Manual session store | Automatic client-side |

### 3-Phase Demo
- React state: `const [phase, setPhase] = useState('phase1')`
- CSS variables applied via `className` on body (same as current)
- Phase buttons in header component
- Example questions rendered per phase from a config object
- Clicking a question calls `append({ role: 'user', content: text })` from `useChat`

### Components

```
LanguageProvider (context: t, language, setLanguage, languages)
└── App
    ├── Header
    │   ├── Brand (otter icon + t('app.brand'))
    │   ├── PhaseNav (3 buttons, labels from t('phases.phaseN.label'))
    │   └── Controls (theme toggle, language selector, user chip)
    ├── Main
    │   ├── Sidebar (example questions from t('questions.phaseN'))
    │   └── ChatPanel
    │       ├── MessageList (from useChat messages)
    │       │   ├── BotMessage (Markdown + tool invocations)
    │       │   └── UserMessage
    │       └── ChatInput (placeholder from t('chat.placeholder'))
```

### Styling
- Keep Palo Alto Networks theme (CSS variables, TT Hoves font, phase colors)
- Keep current `style.css` with minor adjustments for React class names
- Dark mode via `data-theme="dark"` attribute (same pattern)

---

## Build & Deploy

### Development
```bash
cd chatbot-v2/frontend
npm run dev    # Vite dev server with HMR (proxies /api to Express)
```

### Production
```bash
cd chatbot-v2/frontend
npm run build  # Outputs to frontend/dist/
```

Express serves `frontend/dist/` as static files.

### Dockerfile Update
```dockerfile
# Build frontend
COPY chatbot-v2/frontend/package*.json ./frontend/
RUN cd frontend && npm install && npm run build

# Copy backend
COPY chatbot-v2/backend/ ./backend/

# Express serves frontend/dist/
```

### Package Structure
```
chatbot-v2/
├── backend/
│   └── server.js          # Express + streamText (minimal)
├── frontend/
│   ├── package.json        # React, @ai-sdk/react, react-markdown, vite
│   ├── vite.config.js      # Proxy /api to backend
│   ├── index.html          # Vite entry point
│   ├── src/
│   │   ├── main.jsx        # React mount
│   │   ├── App.jsx         # Layout + phase state
│   │   ├── components/
│   │   │   ├── Header.jsx
│   │   │   ├── Sidebar.jsx
│   │   │   ├── ChatPanel.jsx
│   │   │   ├── MessageList.jsx
│   │   │   └── ChatInput.jsx
│   │   ├── config/
│   │   │   └── questions.js  # Phase questions data
│   │   └── styles/
│   │       └── style.css     # Palo Alto theme
│   └── public/
│       ├── fonts/
│       └── images/
├── package.json            # Backend deps (ai, @ai-sdk/mcp, @ai-sdk/openai, express)
└── Dockerfile
```

---

## Migration Steps

1. **Backend**: Replace `generateText` + custom SSE with `streamText` + `pipeDataStreamToResponse`. Add `POST /api/chat` route. Remove `/api/process-prompt`.
2. **Frontend scaffold**: Init Vite + React in `frontend/`. Install `@ai-sdk/react`, `react-markdown`.
3. **Components**: Build App → Header → Sidebar → ChatPanel using `useChat`.
4. **Theme**: Port `style.css` (CSS variables, fonts, phase colors).
5. **3-phase demo**: Wire phase state to sidebar questions and CSS classes.
6. **Dockerfile**: Multi-stage build (frontend build → backend serve).
7. **Test**: Verify streaming, tool calls, phases, dark mode, responsive.

## i18n (In Scope)

Language switching is supported. The existing `locales/{lang}/frontend.json` files provide all UI strings (phases, questions, chat placeholders, errors, etc.).

### Approach
- React context: `LanguageProvider` wraps the app, exposes `{ t, language, setLanguage, languages }`
- `t('key')` function resolves strings from the loaded locale JSON
- Language selector in the header (dropdown or user menu)
- Fetch available languages from `GET /api/languages` on mount
- Fetch translations from `GET /api/translations/{lang}` when language changes
- Persist language choice in `localStorage`
- Phase questions come from locale data (`questions.phase1`, `questions.phase2`, `questions.phase3`) — no hardcoded English
- The backend `SYSTEM_PROMPT` stays English (LLM handles multilingual responses based on user language)

### Backend endpoints (already exist)
- `GET /api/languages` — returns available language codes
- `GET /api/translations/:language` — returns the locale JSON for a language

## Out of Scope
- Security panel (Phase 3 Prisma AIRS — defer)
- LLM provider selector (single provider: LiteLLM)
- Authentication (static user identity)

## Dependencies Added
| Package | Purpose |
|---------|---------|
| `react` | UI framework |
| `react-dom` | React DOM renderer |
| `@ai-sdk/react` | `useChat` hook |
| `react-markdown` | Markdown rendering |
| `vite` | Build tool |
| `@vitejs/plugin-react` | Vite React plugin |

## Dependencies Removed
| Package | Reason |
|---------|--------|
| `chat` | Not appropriate for web UI (platform bots only) |
| `@chat-adapter/state-memory` | Chat SDK dependency, removed |
