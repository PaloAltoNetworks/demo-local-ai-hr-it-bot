# MCP HR/IT Chatbot — Documentation

AI-powered HR/IT chatbot using Vercel AI SDK with native MCP (Model Context Protocol) tool calling via Portkey.

---

## Architecture

```
Chatbot V2 (port 3008)           React + Express + AI SDK (streamText)
       |  AI SDK + @ai-sdk/mcp   One MCP client per server, tools merged
mcp.portkey.ai/{slug}/mcp        Portkey MCP Gateway (per-server endpoints)
       |--- hr-tools-mcp-server  HR data (CSV) — via Cloudflare tunnel
       |--- it-tools-mcp-server  IT data (SQLite) — via Cloudflare tunnel
       |  LLM
api.portkey.ai/v1                OpenAI-compatible endpoint
       |--- AWS Bedrock, GCP Vertex AI, Azure OpenAI, Anthropic, OpenAI, Ollama
       |  Guardrails (Phase 3)
Portkey guardrail config         Prisma AIRS (input + output scanning)
```

A single `streamText` call handles everything. AI SDK manages the tool calling loop (up to 10 steps). Portkey acts as the LLM gateway; its MCP Gateway exposes one endpoint per registered server, so the app opens one MCP client per server and merges the tool sets. Portkey Cloud reaches the tools servers through a Cloudflare tunnel.

### Standalone Tools Servers

Pure data/tools MCP servers — no LLM, no routing. They expose data directly as MCP tools for the Portkey MCP Gateway to reach (via Cloudflare tunnel).

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
- Portkey account (API key), provider integrations, guardrail config
- Tools servers registered in the Portkey MCP Gateway (exposed via Cloudflare tunnel)

### Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Portkey API key, provider slugs, MCP slugs, and guardrail config

# Start all services
docker compose up -d

# Verify
curl http://localhost:3008/health
```

Open `http://localhost:3008` in a browser. The 3-phase demo:
- **Phase 1** (green) — Normal HR/IT queries
- **Phase 2** (red) — Risky/attack prompts
- **Phase 3** (blue) — Guardrails enforced via Portkey

---

## Configuration

All services read from the same `.env` file via `env_file` in docker-compose.

### Portkey

```bash
PORTKEY_API_KEY=pk-your-key
PORTKEY_BASE_URL=https://api.portkey.ai/v1
PORTKEY_DEFAULT_MODEL=@bedrock-prod/eu.anthropic.claude-sonnet-4-6
PORTKEY_AWS_PROVIDER=@bedrock-prod        # provider integration slugs
PORTKEY_GCP_PROVIDER=@vertex-prod
PORTKEY_MCP_BASE=https://mcp.portkey.ai
PORTKEY_MCP_HR_SLUG=hr-tools              # MCP server slugs (per-server endpoints)
PORTKEY_MCP_IT_SLUG=it-tools
```

Tools servers are reached by Portkey Cloud through a host-level Cloudflare tunnel (managed
outside compose): each hostname (e.g. `hr-tools.<domain>/mcp` → `127.0.0.1:3017`) is registered
in the Portkey MCP Gateway, which returns the slug used above.

### Guardrails (Phase 3)

```bash
PORTKEY_GUARDED_CONFIG=pc-your-config     # Portkey config attaching PANW Prisma AIRS
PRISMA_AIRS_TSG_ID=your_tsg_id            # For report links
PRISMA_AIRS_APP_ID=your_app_id            # For report links
```

Phase 3 uses a separate guarded Portkey API key (`PORTKEY_API_KEY_GUARDED`) whose attached config carries the PANW Prisma AIRS guardrail as both `input_guardrails` and `output_guardrails` — not a per-request `x-portkey-config` header. Portkey runs input and output scanning through the configured AIRS profile before/after the LLM call. Response caching (and any other config) rides on the key's config the same way.

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
| MCP | @ai-sdk/mcp (native tool calling via Portkey MCP Gateway, one client per server) |
| LLM | @ai-sdk/openai pointing at Portkey api.portkey.ai/v1 |
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

- None currently tracked. (Portkey applies PANW Prisma AIRS as both input and output guardrails, so response scanning is fully effective.)

---

**Last Updated**: March 13, 2026
