# Chatbot2 - Intelligent MCP Gateway System

An enterprise-grade chatbot system built on the Model Context Protocol (MCP) with intelligent routing, multilingual support, and advanced security integration.

## 🌟 Features

- **MCP Protocol Compliant**: Follows MCP specification 2025-06-18
- **Intelligent Routing**: LLM-based query analysis and agent selection
- **Multilingual Support**: Automatic translation for 10+ languages
- **Multi-Agent Coordination**: Seamlessly combines responses from multiple specialized agents
- **Enterprise Security**: Prisma AIRS integration with 4-layer security checkpoints
- **Clean Architecture**: Separated protocol, intelligence, and security concerns

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CHATBOT HOST                             │
│                  (User Interface)                           │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                   MCP GATEWAY                               │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐      │
│  │ MCP Server   │  │ Coordinator   │  │ Prisma AIRS  │      │
│  │ (Protocol)   │→ │ (Intelligence)│→ │ (Security)   │      │
│  └──────────────┘  └───────────────┘  └──────────────┘      │
└────────────────────────┬────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   HR MCP     │ │   IT MCP     │ │  General MCP │
│   Server     │ │   Server     │ │   Server     │
└──────────────┘ └──────────────┘ └──────────────┘
```

## 📚 Documentation

Comprehensive documentation is available in the [`docs/`](./docs/) directory:

### Getting Started
- **[Documentation Index](./docs/README.md)** - Start here for complete documentation overview

### System Design
- **[MCP Architecture](./docs/MCP-ARCHITECTURE.md)** - Overall MCP standard compliance
- **[Intelligent Coordinator Plan](./docs/INTELLIGENT-MCP-COORDINATOR-PLAN.md)** - High-level design

### Gateway Implementation
- **[Gateway Architecture](./docs/gateway/architecture.md)** - Component separation and design
- **[Implementation Guide](./docs/gateway/implementation.md)** - Refactoring and migration details
- **[API Reference](./docs/gateway/api-reference.md)** - Complete API documentation

## 🚀 Quick Start

### Prerequisites

- Node.js 22+
- Docker and Docker Compose
- Ollama (for LLM models)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd chatbot2
   ```

2. **Install Ollama models**
   ```bash
   ollama pull qwen2.5:1.5b
   ollama pull gemma3:1b
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start with Docker Compose**
   ```bash
   docker-compose up -d
   ```

5. **Verify deployment**
   ```bash
   curl http://localhost:3001/health
   ```

## 🤝 Contributing

1. Read the [Implementation Guide](./docs/gateway/implementation.md)
2. Follow the existing code structure
3. Add tests for new features
4. Update documentation

## 📝 License

[Your License Here]

## 🔗 Links

- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [Prisma AIRS Documentation](https://docs.paloaltonetworks.com/prisma/airs)
- [Ollama](https://ollama.ai/)

## 📞 Support

For issues and questions:
- Check the [Documentation](./docs/)
- Review [Implementation Guide](./docs/gateway/implementation.md)
- See [API Reference](./docs/gateway/api-reference.md)
