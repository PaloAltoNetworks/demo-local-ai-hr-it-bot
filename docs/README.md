# MCP HR/IT Chatbot — Documentation

AI-powered HR/IT chatbot using Vercel AI SDK with native MCP (Model Context Protocol) tool calling via LiteLLM.

---

## Architecture

```
Chatbot V2 (port 3008)           React + Express + AI SDK (streamText)
       |  AI SDK + @ai-sdk/mcp   Single MCP connection
LiteLLM /mcp                     MCP aggregator (proxies to registered servers)
       |--- hr-tools-mcp-server  HR data (CSV) — port 3007
       |--- it-tools-mcp-server  IT data (SQLite) — port 3006
       |  LLM
LiteLLM /v1                      OpenAI-compatible endpoint
       |--- AWS Bedrock, GCP Vertex AI, Azure OpenAI, Anthropic, OpenAI, Ollama
       |  Guardrails (Phase 3)
LiteLLM guardrails               Prisma AIRS (pre_call input scanning)
```

A single `streamText` call handles everything. AI SDK manages the tool calling loop (up to 10 steps). LiteLLM acts as both the LLM proxy and MCP tool aggregator.

### Standalone Tools Servers

Pure data/tools MCP servers — no LLM, no routing. They expose data directly as MCP tools for LiteLLM to aggregate.

| Server | Port | Data Source | Tools |
|--------|------|-------------|-------|
| it-tools-mcp-server | 3006 | SQLite (tickets) | get_ticket, search_tickets, ticket_stats |
| hr-tools-mcp-server | 3007 | CSV (employees) | get_employee, search_employees, get_direct_reports |

Transports: Streamable HTTP (`POST /mcp`) and SSE (`GET /sse` + `POST /messages`).

### Service Ports

| Service | Port | Description |
|---------|------|-------------|
| it-tools-mcp-server | 3006 | Standalone IT tools |
| hr-tools-mcp-server | 3007 | Standalone HR tools |
| chatbot-v2 | 3008 | Web UI + API |

---

## Getting Started

### Prerequisites
- Node.js 22
- Docker & Docker Compose
- LiteLLM proxy with MCP servers registered

### Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your LiteLLM and LLM provider credentials

# Start all services
docker compose up -d

# Verify
curl http://localhost:3008/health
```

Open `http://localhost:3008` in a browser. The 3-phase demo:
- **Phase 1** (green) — Normal HR/IT queries
- **Phase 2** (red) — Risky/attack prompts
- **Phase 3** (blue) — Guardrails enforced via LiteLLM

---

## Configuration

All services read from the same `.env` file via `env_file` in docker-compose.

### LiteLLM

```bash
LITELLM_BASE_URL=http://localhost:8080
LITELLM_API_KEY=sk-your-key
CHATBOT_V2_MODEL=qwen.qwen3-32b-v1:0
MCP_URL=http://localhost:8080/mcp/
```

### Guardrails (Phase 3)

```bash
LITELLM_GUARDRAIL_NAME=PANW              # LiteLLM guardrail name
PRISMA_AIRS_TSG_ID=your_tsg_id           # For report links
PRISMA_AIRS_APP_ID=your_app_id           # For report links
```

Phase 3 injects `body.guardrails` into LiteLLM requests. LiteLLM runs them through the configured Prisma AIRS profile. Currently only `pre_call` (input scanning) is effective — see [known issues](#known-issues).

---

## Internationalization

9 locales: en, fr, es, de, ja, pt, zh, ar, it — all use formal register (vous/Sie/usted/Lei).

React context `LanguageProvider` with `t('key')` interpolation. Language persisted to `localStorage`.

---

## Tech Stack

| Component | Stack |
|-----------|-------|
| Runtime | Node.js 22, ES modules, npm workspaces |
| Frontend | React 19, Vite, @ai-sdk/react v3 |
| Backend | Express 5, AI SDK v6 (streamText, convertToModelMessages, stepCountIs) |
| MCP | @ai-sdk/mcp (native tool calling via LiteLLM /mcp aggregator) |
| LLM | @ai-sdk/openai pointing at LiteLLM /v1 |
| Data | CSV (HR), SQLite via sql.js (IT) |
| Containers | Docker Compose |

---

## Common Commands

```bash
# Start all services
docker compose up -d

# Rebuild and start
docker compose up -d --build

# Start a single service
docker compose up chatbot-v2 --build -d

# View logs
docker compose logs -f chatbot-v2

# Health checks
curl http://localhost:3008/health
curl http://localhost:3006/health          # IT tools
curl http://localhost:3007/health          # HR tools
```

---

## Known Issues

- **LiteLLM `post_call` guardrail not firing** — PANW Prisma AIRS `post_call` mode (LLM response scanning) does not execute even when configured. Only `pre_call` (input scanning) works. See [LiteLLM issue #23561](https://github.com/BerriAI/litellm/issues/23561) and [detailed report](litellm-post-call-guardrail-bug.md).

---

**Last Updated**: March 13, 2026
