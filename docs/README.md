# Documentation Index

Welcome to the Chatbot2 MCP Gateway documentation.

## 📚 Documentation Structure

### System Overview
- **[MCP Architecture](./MCP-ARCHITECTURE.md)** - Overall MCP standard compliance and system design
- **[Intelligent Coordinator Plan](./INTELLIGENT-MCP-COORDINATOR-PLAN.md)** - High-level design for LLM-based routing

### Gateway Implementation
- **[Gateway Architecture](./gateway/architecture.md)** - MCP Gateway component separation and design
- **[Implementation Guide](./gateway/implementation.md)** - Refactoring details and migration guide
- **[API Reference](./gateway/api-reference.md)** - Endpoints, protocols, and configuration

### Planning & Design
- **[Security Design](./planning/security-phase3.md)** - Prisma AIRS integration architecture
- **[Future Enhancements](./planning/roadmap.md)** - Planned improvements and features

### Code Quality & Refactoring
- **[Code Review Documentation](./code-review/README.md)** - Comprehensive code reviews, issue tracking, and refactoring progress
  - Code review reports and findings
  - Dead code removal and memory leak fixes
  - Session management improvements
  - Security and performance enhancements

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      CHATBOT HOST                           │
│                    (User Interface)                         │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│                       MCP GATEWAY                           │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐      │
│  │ MCP Server   │  │ Coordinator   │  │ Prisma AIRS  │      │
│  │ (Protocol)   │→ │ (Intelligence)│→ │ (Security)   │      │
│  └──────────────┘  └───────────────┘  └──────────────┘      │
└────────────────────────────┬────────────────────────────────┘
                             │
            ┌────────────────┼────────────────┐
            ▼                ▼                ▼
     ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
     │   HR MCP     │ │   IT MCP     │ │  General MCP │
     │   Server     │ │   Server     │ │   Server     │
     └──────────────┘ └──────────────┘ └──────────────┘
```

## 🎯 Key Concepts

### Component Separation
1. **MCP Server (mcp-server.js)** - Pure protocol handler
2. **Coordinator (coordinator.js)** - Intelligence and routing
3. **Prisma AIRS (prisma-airs.js)** - Security API client

### Security Phases
- **Phase 2**: Basic validation
- **Phase 3**: Full Prisma AIRS integration with 4 security checkpoints

### Design Principles
- ✅ Single Responsibility Principle
- ✅ Separation of Concerns
- ✅ Transparent Error Handling (no fallbacks)
- ✅ Fail-Secure by Default

## 🚀 Quick Start

1. **Setup Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

2. **Start the Gateway**
   ```bash
   cd mcp-gateway
   npm install
   npm start
   ```

3. **Register MCP Servers**
   - HR, IT, and General servers auto-register on startup
   - Check `/health` endpoint to verify

4. **Test Queries**
   ```bash
   curl -X POST http://localhost:3001/api/query \
     -H "Content-Type: application/json" \
     -d '{"query": "Who is my manager?", "language": "en"}'
   ```

## 📖 Reading Guide

### For Developers
1. Start with [MCP Architecture](./MCP-ARCHITECTURE.md)
2. Read [Gateway Architecture](./gateway/architecture.md)
3. Review [Implementation Guide](./gateway/implementation.md)

### For Security Engineers
1. Review [Security Design](./planning/security-phase3.md)
2. Check [API Reference](./gateway/api-reference.md) for security endpoints

### For System Architects
1. Read [Intelligent Coordinator Plan](./INTELLIGENT-MCP-COORDINATOR-PLAN.md)
2. Review [Gateway Architecture](./gateway/architecture.md)
3. Check [Future Enhancements](./planning/roadmap.md)

## 🔧 Configuration

Key environment variables:

```bash
# Gateway
MCP_GATEWAY_PORT=3001

# Intelligence
COORDINATOR_MODEL=qwen2.5:1.5b
TRANSLATION_MODEL=aya:8b
OLLAMA_HOST=http://localhost:11434

# Security (Phase 3)
SECURITY_PHASE=phase3
PRISMA_AIRS_API_URL=https://service.api.aisecurity.paloaltonetworks.com
PRISMA_AIRS_API_TOKEN=your_token
PRISMA_AIRS_PROFILE_ID=your_profile_id
```

## 🤝 Contributing

When adding documentation:
1. Place system-level docs in `/docs`
2. Place component-specific docs in `/docs/{component}/`
3. Update this index
4. Follow existing formatting conventions

## 📝 License

[Your License Here]
