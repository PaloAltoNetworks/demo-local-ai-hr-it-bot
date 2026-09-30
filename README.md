# The Otter — HR/IT assistant on MCP

HR/IT chatbot demo: an AI SDK agent calls HR and IT data over MCP through the Portkey AI Gateway, with Prisma AIRS guardrails in the protected phase.

[Watch the demo](https://github.com/user-attachments/assets/e4b44f5c-593d-4607-9158-cf2a0455cbc3)

## Quick start

```bash
cp .env.example .env   # Portkey keys, provider and MCP slugs
docker compose up -d --build
open http://localhost:3018
```

## Layout

```
chatbot-v2/            Web UI (React) + Express/AI SDK backend      :3018
mcp-server/it-tools-*  IT tickets and assets (SQLite), MCP tools    :3016
mcp-server/hr-tools-*  HR employees (SQLite), MCP tools             :3017
agents/it-triage-agent Agentic MCP server (ToolLoopAgent inside)    :3019
auth-service/          Magic-link login in front of the chatbot (Kubernetes)
locales/               UI translations (9 languages)
```

See [docs/README.md](./docs/README.md) for configuration, [docs/DEPLOY.md](./docs/DEPLOY.md) for the Kubernetes deployment (a GitHub release builds and deploys to EKS) and [PRD.md](./PRD.md) for the architecture.

## License

See LICENSE file
