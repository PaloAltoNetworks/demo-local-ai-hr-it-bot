# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP (Model Context Protocol) compliant multi-agent HR/IT chatbot system. Three-tier architecture: Chatbot Host (web UI + API) → MCP Gateway (intelligent routing) → Specialized MCP Agents (HR, IT, General).

Node.js 22, Express.js 5, ES modules (`"type": "module"`), npm workspaces monorepo.

## Build & Run Commands

```bash
# Install all workspace dependencies
npm install

# Start all services (Docker, primary workflow)
docker compose up -d

# Rebuild and start
docker compose up -d --build

# Rebuild without cache
docker compose build --no-cache

# Start a single service
docker compose up hr-mcp-server --build

# View logs
docker compose logs -f                    # all services
docker compose logs -f mcp-gateway        # specific service

# Local dev with Ollama (free)
export OLLAMA_SERVER_URL=http://localhost:11434
docker compose up -d

# Cloud dev with AWS Bedrock
export AWS_BEARER_TOKEN_BEDROCK=your_key
export AWS_REGION=us-east-1
docker compose up -d

# Health checks
curl http://localhost:3001/health    # Gateway
curl http://localhost:3002/health    # Chatbot host
curl http://localhost:3003/health    # HR agent
curl http://localhost:3004/health    # IT agent
curl http://localhost:3005/health    # General agent
curl http://localhost:3006/health    # IT Tools (standalone MCP)

# Test full query pipeline
curl -X POST http://localhost:3001/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "Who is my manager?", "language": "en"}'

# Seed IT ticket database
cd mcp-server/it-mcp-server && npm run seed-db

# Download frontend fonts
cd chatbot-host && npm run download-fonts
```

No formal test framework is configured. Testing is manual via curl and the web UI at `http://localhost:3002`.

## Architecture

```
Chatbot Host (port 3002)         Frontend (vanilla JS) + Express API
       ↓ HTTP
MCP Gateway (port 3001)          Coordinator routing, LLM abstraction, Prisma AIRS security
       ↓ MCP (JSON-RPC 2.0)
MCP Agents (ports 3003-3005)     HR (CSV), IT (SQLite), General (knowledge base)
```

### Service Ports
| Service | Host Port | Internal Port |
|---------|-----------|---------------|
| mcp-gateway | 3001 | 3001 |
| chatbot-host | 3002 | 3002 |
| hr-mcp-server | 3003 | 3000 |
| it-mcp-server | 3004 | 3000 |
| general-mcp-server | 3005 | 3000 |
| it-tools-mcp-server | 3006 | 3000 |

### Workspace Layout
- `utils/` — Shared: logger (Winston), LLM provider factory (Vercel AI SDK), i18n (i18next)
- `chatbot-host/` — Web UI (vanilla JS/CSS/HTML) + Express backend with session management and MCP client
- `mcp-gateway/` — MCP protocol server, `coordinator.js` (LLM-based intelligent routing, agent registry), `prisma-airs.js` (optional security)
- `mcp-server/shared/` — Base classes: `MCPAgentBase`, `ResourceManager`, `CoordinatorClient`, `TransportManager`, `QueryProcessor`
- `mcp-server/hr-mcp-server/` — HR agent, data source: `employees.csv`
- `mcp-server/it-mcp-server/` — IT agent, data source: SQLite via sql.js (`ticket-db.js`)
- `mcp-server/general-mcp-server/` — General/fallback agent, built-in policy knowledge base
- `mcp-server/it-tools-mcp-server/` — Standalone pure data/tools MCP server (no LLM, no coordinator), exposes IT ticket DB for external LLM hosts

### Agent Pattern
Each agent in `mcp-server/{name}-mcp-server/` follows the same structure:
1. `config.js` — Agent metadata, LLM params, system prompt, routing keywords
2. `service.js` — Data loading and querying logic
3. `server.js` — Extends `MCPAgentBase`, registers MCP tools/resources, starts HTTP server

To create a new agent: copy an existing agent directory, update `config.js`/`service.js`, add a new service block in `docker-compose.yml` with a unique `AGENT_NAME` build arg.

### LLM Provider System
`utils/llm-provider.js` uses Vercel AI SDK to abstract across providers. Provider is auto-detected from environment variables (first match wins): Ollama, OpenAI, Anthropic, AWS Bedrock, Azure OpenAI, Google Vertex AI. Set `USE_LITELLM=true` to route all calls through a LiteLLM proxy instead.

The coordinator (`mcp-gateway/coordinator.js`) and each agent independently call the LLM. Model can be configured per-role via `COORDINATOR_MODEL` and `AGENT_MODEL` env vars.

### MCP Protocol
- JSON-RPC 2.0 over HTTP transport, protocol version `2025-06-18`
- Agents register with the gateway coordinator on startup via `CoordinatorClient`
- Resource URIs follow MCP patterns: `hr://employees/{id}/profile`, `it://tickets/{id}`

### Internationalization
- Backend: `utils/i18n.js` with `locales/{lang}/backend.json`
- Frontend: `chatbot-host/frontend/js/i18n.js` with `locales/{lang}/frontend.json`
- Supported languages: en, fr, es, de, ja, pt, zh, ar, it
- Default: `DEFAULT_LANGUAGE=en`
- Always use **formal register** (vous/Sie/usted/Lei/您) in user-facing translations — this is a corporate assistant

## Environment Configuration

Copy `.env.example` to `.env`. Key variables:
- `OLLAMA_SERVER_URL` / `OLLAMA_MODEL` — Local LLM (default: `qwen2.5:1.5b`)
- `AWS_BEARER_TOKEN_BEDROCK` / `BEDROCK_MODEL` — AWS Bedrock
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `AZURE_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS` — Other providers
- `USE_LITELLM` / `LITELLM_BASE_URL` — LiteLLM proxy mode
- `LOG_LEVEL` — error, warn, info, debug
- `SESSION_TTL` — Session timeout in seconds
- `PRISMA_AIRS_*` — Optional security integration

Provider switching requires container restart. All services read from the same `.env` file via `env_file` in docker-compose.

## Gotchas

- All services communicate via Docker `mcp-network` bridge. Use Docker hostnames (e.g., `http://mcp-gateway:3001`) in inter-service calls.
- Agents run on internal port 3000 but are mapped to different host ports (3003-3005).
- MCP requests must include proper JSON-RPC 2.0 fields (`jsonrpc`, `id`, `method`, `params`).
- The chatbot-host depends on all other services being healthy before starting.
- Logs are volume-mounted to `./logs/{service-name}/` on the host.

## Git Workflow

Rules:

- Branch naming: `fix/`, `feat/`, `chore/` prefix
- Commit per logical step (group dependent changes together)
- Commit messages: single line, describe the **spirit** of the change (not the code diff)
- PR body: concise, describe the **spirit** of the change (not the code diff)
- PR body: write to `/tmp/pr-body-<branch>.md` file — do not use heredoc in shell (quotes break it)
- No co-authored-by in commits
- No formal lint/build/test scripts — testing is manual via curl and the web UI

### Versioning

- All `package.json` files (root + all workspaces) must have the **same version**, matching the release tag (e.g. `0.0.23`)
- Bump versions as a separate commit: `chore: Bump all package versions to X.Y.Z`

### Release Flow

When asked to merge, release and prep next version, follow this exact sequence:

1. Push branch, create PR (write body to `/tmp/pr-body-<branch>.md`)
2. Merge PR: `gh pr merge <num> --merge --delete-branch --admin`
3. `git checkout main && git pull origin main && git remote prune origin`
4. Delete local branch if still present: `git branch -D <branch>`
5. Tag: `git tag v<version> main && git push origin v<version>`
6. Release notes to `/tmp/release-notes-v<version>.md`, then `gh release create`
7. Prep next: `git checkout -b v.0.0.<next> && git push -u origin v.0.0.<next>`

### Working Branch Convention

- Development branches use dot notation: `v.0.0.XX` (e.g. `v.0.0.23`)
- Tags/releases use standard semver: `v0.0.XX` (e.g. `v0.0.23`)