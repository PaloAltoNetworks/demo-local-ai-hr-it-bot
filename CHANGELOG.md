# Changelog

What changed in The Otter, newest first. The chatbot shows this file when you click its version
number; each section is also the GitHub release note of that version.

## 0.0.26

### New
- **Auto (AI Gateway routing)** — a fourth LLM provider, now the default. Every request already goes
  through the AI Gateway; AWS, GCP or Azure pin the cloud, Auto lets the gateway load-balance across
  the three and fall back to another cloud if one fails. Shown first in the provider menu.
- **Claude Sonnet 5.5** answers on AWS, GCP and Azure; Haiku 4.5 still runs the reasoning steps.
- **New chat interface** built on AI Elements: thinking chain with tool cards, per-reply actions
  (retry, copy, thumbs up/down, trace link), context and cost gauge, animated halo on the home page.
- **Workflow replay** (header button): watch a request travel through the AI Gateway, the MCP
  servers and Prisma AIRS, in normal, risky and protected phases.
- **IT Triage Agent**: new IT requests are triaged, classified and filed as tickets by an agent
  that is itself an MCP server.
- **SCM AI Gateway**: the demo runs on the Strata Cloud Manager AI Gateway, SaaS or hybrid.
- **Version and changelog** in the suggestions panel (you are reading it).

### Improved
- MCP tool arguments are validated (ticket and employee ID formats, emails, lengths) before any
  database access.
- Demo data can be reset to a clean base (`npm run seed-db` in a tools server, or recreate the
  container).
- Leaner code base: unused components, dependencies and documentation removed.

### Fixed
- Empty final answers from Sonnet 5.5.
- A turn no longer fails when no MCP data tool is reachable.
- AWS logo in dark mode, provider menu width.

## 0.0.25
- The IT tools MCP server works with external hosts such as LiteLLM (SSE transport, lenient Accept
  header).

## 0.0.24
- Standalone IT tools MCP server for external LLM hosts.

## 0.0.23
- Project conventions documented (versioning, release flow, formal register in translations).

## 0.0.22
- Formal register for the capabilities question in all 9 languages; help icon.

## 0.0.21
- "How can you help me?" as the first suggested question, in all 9 languages.
