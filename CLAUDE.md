# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

HR/IT chatbot demo on MCP (Model Context Protocol). A React + Express chatbot runs an AI SDK `ToolLoopAgent` whose data tools come from MCP servers reached through the Portkey MCP Gateway; LLM calls go through Portkey too, with Prisma AIRS guardrails in phase 3.

Node.js 24 (Docker images), Express 5, ES modules (`"type": "module"`), npm workspaces monorepo. `PRD.md` is the architecture reference.

## Coding Standards

All code follows @docs/CODING_STANDARDS.md (JSDoc-only comments stating ground truth, ponytail simplicity rules, root-cause fixes).

## Build & Run Commands

```bash
# Install workspace dependencies (chatbot-v2 + tools servers)
npm install

# Frontend deps/build (not a workspace; build from the repo root)
npm install --prefix chatbot-v2/frontend
npm run build --prefix chatbot-v2/frontend

# Start all services
docker compose up -d --build

# Start a single service
docker compose up -d --build chatbot-v2

# Logs
docker compose logs -f chatbot-v2

# Health checks
curl http://localhost:3016/health    # IT Tools (standalone MCP)
curl http://localhost:3017/health    # HR Tools (standalone MCP)
curl http://localhost:3018/health    # Chatbot V2 (AI SDK + MCP)
curl http://localhost:3019/health    # IT Triage Agent (agentic MCP)
```

No formal test framework is configured. Testing is manual via curl and the web UI at `http://localhost:3018`.

## Architecture

### Service Ports
| Service | Host Port | Internal Port |
|---------|-----------|---------------|
| it-tools-mcp-server | 3016 | 3000 |
| hr-tools-mcp-server | 3017 | 3000 |
| chatbot-v2 | 3018 | 3018 |
| it-triage-agent | 3019 | 3000 |

### Workspace Layout
- `chatbot-v2/` — `backend/server.js` (Express + AI SDK agent, one MCP client per Portkey MCP server) and `frontend/` (React 19, Vite, Tailwind 4, shadcn + vendored AI Elements)
- `mcp-server/it-tools-mcp-server/` — Standalone data/tools MCP server (no LLM), IT tickets and assets in `tickets.sql`
- `mcp-server/hr-tools-mcp-server/` — Standalone data/tools MCP server (no LLM), HR employees in `employees.sql`
- `agents/it-triage-agent/` — Agentic MCP server: MCP on the outside, `ToolLoopAgent` on the inside
- `locales/{lang}/frontend.json` — UI translations, copied into the chatbot image

### Standalone Tools Server Pattern
Pure data/tools MCP servers for external LLM hosts (Portkey, Claude Desktop, Cursor). Each has:
1. `service.js` — SQL over the `.db` file via `node:sqlite` (parameterized queries only)
2. `server.js` — Express + MCP SDK `McpServer`, Streamable HTTP (`POST/GET/DELETE /mcp`, stateful sessions). Tool arguments are zod schemas with format constraints (IDs, emails, lengths); the SDK rejects invalid calls before the handler runs
3. `seed.js` — rebuilds the `.db` from the committed `.sql` dump (runs at image build)
4. `Dockerfile` — copies `server.js`, `service.js`, `seed.js` and the `.sql`, then runs `node seed.js`

The committed `.sql` dumps are the demo data source of truth; the `.db` files are build artifacts (gitignored). `npm run seed-db` in a tools server resets its local database to that clean base, and recreating the container does the same in Docker. To change the demo data, edit the `.sql`, or edit the `.db` and re-dump it with `sqlite3 tickets.db .dump` (keep the `DELETE FROM sqlite_sequence;` line before the sequence inserts).

### Agentic MCP Server Pattern
`agents/{name}/` wraps a `ToolLoopAgent` in an MCP server. From the outside it is a regular MCP server registered with the Portkey MCP Gateway; each tool call runs multi-step reasoning with its own LLM (via Portkey `api.portkey.ai/v1`) and consumes data tools from other MCP servers (Portkey MCP Gateway, or `IT_TRIAGE_MCP_URLS` for the docker network).

### Chatbot V2 (AI SDK + MCP via Portkey)
```
Chatbot V2 (port 3018)           React frontend + Express + AI SDK ToolLoopAgent
       ↓ @ai-sdk/mcp              one client per server, tools merged
       mcp.portkey.ai/{slug}/mcp  Portkey MCP Gateway (per-server endpoints)
       ├── hr-tools-mcp-server    ── via Cloudflare tunnel
       ├── it-tools-mcp-server    ── via Cloudflare tunnel
       └── it-triage-agent        ── via Cloudflare tunnel
       ↓ LLM
       api.portkey.ai/v1          OpenAI-compatible endpoint
```
Every `PORTKEY_MCP_*_SLUG` env var becomes an MCP client. Config: `PORTKEY_BASE_URL`, `PORTKEY_API_KEY`, `PORTKEY_API_KEY_GUARDED`, `PORTKEY_MCP_BASE`, `PORTKEY_{AWS,GCP,AZURE}_PROVIDER`, `PORTKEY_{AWS,GCP,AZURE}_{FAST,POWERFUL}`.

### LLM Provider System
LLM calls go through Portkey (`api.portkey.ai/v1`, or a self-hosted gateway via `PORTKEY_BASE_URL`) using `@ai-sdk/openai` `createOpenAI` with a fetch wrapper that injects `x-portkey-*` headers (auth, metadata, trace id). The target provider is selected by Portkey's `@provider-slug/model` model string; provider integrations are configured in the Portkey dashboard. Guardrails ride on the guarded API key's attached config.

### Internationalization
- `chatbot-v2/frontend/src/context/LanguageContext.tsx` loads `/api/translations/{lang}` (from `locales/{lang}/frontend.json`)
- Supported languages: en, fr, es, de, ja, pt, zh, ar, it
- Always use **formal register** (vous/Sie/usted/Lei/您) in user-facing translations — this is a corporate assistant

## Environment Configuration

Copy `.env.example` to `.env`. All services read the same `.env` via `env_file` in docker-compose. Provider switching requires container restart.

`.env.example` is the template: it dictates which variables exist, their order and comments. After it changes, run `node scripts/sync-env.mjs` to rebuild `.env` from it (current values kept, new variables take the example value, variables missing from the template are kept at the end for review; `.env.bak` is written first).

## Gotchas

- Services share the Docker `mcp-network` bridge; use Docker hostnames (e.g. `http://it-tools-mcp-server:3000`) between services. `host.docker.internal` reaches host services such as a local AI gateway.
- The chatbot's MCP traffic goes through the Portkey MCP Gateway, which reaches the tools servers registered in Portkey (Cloudflare tunnel), not necessarily the local containers.
- MCP requests must include proper JSON-RPC 2.0 fields (`jsonrpc`, `id`, `method`, `params`) and an `mcp-session-id` after `initialize`.

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
6. Release notes = the version's section of `CHANGELOG.md` (written before the version bump, user-facing, newest first; the chatbot shows this file from its version link). Copy that section to `/tmp/release-notes-v<version>.md`, then `gh release create`
7. Prep next: `git checkout -b v.0.0.<next> && git push -u origin v.0.0.<next>`

### Working Branch Convention

- Development branches use dot notation: `v.0.0.XX` (e.g. `v.0.0.23`)
- Tags/releases use standard semver: `v0.0.XX` (e.g. `v0.0.23`)
