# AI HR/IT Chatbot - MCP Gateway System

An intelligent chatbot system using the Model Context Protocol (MCP) with automatic LLM provider switching (Ollama/AWS Bedrock), multi-agent routing, and multilingual support.

## � What It Does

- **Intelligent Query Routing**: Analyzes questions and routes to HR, IT, or General agents
- **Multi-Agent Coordination**: Combines responses from multiple agents when needed
- **Flexible LLM Providers**: Switch between Ollama (local, $0) and AWS Bedrock (cloud, ~$0.0045/query) with env vars only
- **Multilingual**: Automatic translation (English, French, and more)
- **Enterprise Security**: Optional Prisma AIRS integration (4 security checkpoints)

## 🏗️ System Overview

```
Frontend UI
    ↓
Backend API (Session Management)
    ↓
MCP Gateway (Routing & LLM Selection)
    ↓
┌─────────────┬──────────────┬──────────────┐
│  HR Server  │  IT Server   │ General Server
│             │              │
```

## 📚 Documentation

**→ [Complete Documentation](./docs/README.md)**

All information in one place:
- Quick start (Ollama or Bedrock)
- Configuration reference
- API endpoints
- Architecture details
- Troubleshooting

## 🚀 Quick Start

### With Ollama (Local)
```bash
# Set provider
export LLM_PROVIDER=ollama
export OLLAMA_SERVER_URL=http://localhost:11434
export COORDINATOR_MODEL=qwen2.5:1.5b

# Start
docker compose up -d
```

### With AWS Bedrock (Cloud)
```bash
# Set provider
export LLM_PROVIDER=bedrock
export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret
export BEDROCK_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0

# Start
docker compose up -d
```

### Verify
```bash
curl http://localhost:3001/health
```

## � Agents

- **HR Agent**: Employee info, manager lookup, policies
- **IT Agent**: Ticket management, IT systems
- **General Agent**: Knowledge base, Q&A

## 🔄 Provider Comparison

| Feature | Ollama | Bedrock |
|---------|--------|---------|
| Cost | Free | ~$0.0045/query |
| Setup | Download & run | AWS account |
| Latency | 500ms-2s | 1-3s |
| Best For | Development | Production |

## �️ Stack

- **Frontend**: HTML/CSS/JavaScript
- **Backend**: Node.js
- **Gateway**: MCP protocol
- **LLM**: Ollama (local) or AWS Bedrock (cloud)
- **Deployment**: Docker Compose

## � Project Structure

```
chatbot-host/     - Web interface and backend API
mcp-gateway/      - Intelligent routing and LLM provider abstraction
mcp-server/       - HR, IT, and General agents
docs/             - Complete documentation
docker-compose.yml - Container orchestration
```

## 🚀 Features

✅ Seamless Ollama ↔ Bedrock switching  
✅ Multi-language support (en, fr, etc)  
✅ Session management  
✅ Multi-agent coordination  
✅ LLM token tracking  
✅ Error handling & recovery  
✅ i18n built-in  

## 📞 Getting Help

1. Check [docs/README.md](./docs/README.md) for detailed documentation
2. Review API reference for endpoint details
3. See troubleshooting section for common issues

## 📝 License

See LICENSE file
