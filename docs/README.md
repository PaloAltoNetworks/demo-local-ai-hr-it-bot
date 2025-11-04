# Chatbot2 MCP Gateway - Complete Documentation

Welcome to the comprehensive documentation for the AI-powered chatbot system with MCP (Model Context Protocol) gateway architecture.

---

## 📚 Documentation Overview

### Quick Navigation
- **[Getting Started](#-getting-started)** - Setup and first steps
- **[Architecture](#-architecture)** - System design and components
- **[Configuration](#-configuration)** - Environment setup
- **[Code Quality](#-code-quality)** - Reviews and improvements

---

## Getting Started

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- (Optional) Ollama for local LLM, or AWS Bedrock credentials

### Installation - Quick Start

```bash
# Option 1: Local Development (Ollama)
export LLM_PROVIDER=ollama
export OLLAMA_SERVER_URL=http://localhost:11434
export COORDINATOR_MODEL=qwen2.5:1.5b

# Option 2: AWS Production (Bedrock)
export LLM_PROVIDER=bedrock
export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret
export BEDROCK_COORDINATOR_MODEL=anthropic.claude-3-sonnet-20240229-v1:0
export BEDROCK_AGENT_MODEL=anthropic.claude-3-sonnet-20240229-v1:0

# Start services
docker compose up -d
```

### Verify Installation

```bash
# Test the API
curl -X POST http://localhost:3001/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "Who is my manager?", "language": "en"}'
```

---

## 🏗️ Architecture

### System Overview

The chatbot system follows the **MCP (Model Context Protocol) standard** with enterprise-grade security, routing, and flexibility.

```
┌────────────────────────────────────────────────────────────┐
│                   CHATBOT HOST                             │
│            (Web Interface + Backend API)                   │
└──────────────────────┬─────────────────────────────────────┘
                       │ HTTP
┌──────────────────────▼─────────────────────────────────────┐
│                  MCP GATEWAY                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ • Request Routing & Load Balancing                   │  │
│  │ • Intelligent Agent Selection                        │  │
│  │ • Security & Access Control                          │  │
│  │ • Session Management                                 │  │
│  │ • LLM Provider Abstraction (Ollama/Bedrock)          │  │
│  │ • Token Tracking & Usage Monitoring                  │  │
│  │ • i18n Support (English/French)                      │  │
│  └──────────────────────────────────────────────────────┘  │
└─┬──────────────────────┬──────────────────────┬────────────┘
  │ MCP Protocol         │ MCP Protocol         │ MCP Protocol
  │                      │                      │
┌─▼──────────────┐  ┌────▼──────────────┐  ┌───▼──────────────┐
│ HR MCP Server  │  │ IT MCP Server     │  │ General MCP      │
│                │  │                   │  │ Server           │
│ Tools:         │  │ Tools:            │  │                  │
│ • get_employee │  │ • get_ticket      │  │ Tools:           │
│ • search_hr    │  │ • update_ticket   │  │ • search_docs    │
│ • create_report│  │ • it_query        │  │ • general_qa     │
│                │  │                   │  │ • knowledge_base │
│ Data:          │  │ Data:             │  │                  │
│ • employees.csv│  │ • tickets.db      │  │ Data:            │
│ • HR policies  │  │ • IT systems      │  │ • Knowledge base │
└────────────────┘  └───────────────────┘  └──────────────────┘
```

### Key Components

#### 1. **Chatbot Host** (`chatbot-host/`)
- **Frontend** (`frontend/`) - React-based web interface
- **Backend API** (`backend/`) - Node.js server
  - Session management
  - MCP client
  - Request translation & response formatting

#### 2. **MCP Gateway** (`mcp-gateway/`)
- **Coordinator** - Intelligent routing using LLM-based decision making
- **MCP Server** - Protocol handler for MCP standard compliance
- **LLM Provider** - Abstraction for Ollama/Bedrock switching
- **Prisma AIRS** - Security integration (enterprise feature)

#### 3. **MCP Servers** (`mcp-server/`)
- **HR Server** - Employee and HR data access
- **IT Server** - Ticket management and IT systems
- **General Server** - General knowledge and Q&A

#### 4. **Shared Utilities** (`mcp-server/shared/`)
- Common LLM interfaces
- Query processing
- Configuration management
- Logging

---

## ⚙️ Configuration

### Environment Variables

#### Universal Settings
```bash
# Logging
LOG_LEVEL=debug              # debug, info, warn, error
NODE_ENV=production          # production, development

# Internationalization
DEFAULT_LANGUAGE=en          # en, fr

# Session Management
MAX_SESSIONS=100
SESSION_TTL=3600             # seconds
```

#### LLM Provider Selection
```bash
LLM_PROVIDER=ollama          # or 'bedrock'
```

#### Ollama Configuration (Local Development)
```bash
OLLAMA_SERVER_URL=http://localhost:11434
COORDINATOR_MODEL=qwen2.5:1.5b
AGENT_MODEL=qwen2.5:1.5b
```

#### AWS Bedrock Configuration (Production)
```bash
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
BEDROCK_COORDINATOR_MODEL=anthropic.claude-3-sonnet-20240229-v1:0
BEDROCK_AGENT_MODEL=anthropic.claude-3-sonnet-20240229-v1:0
```

#### Gateway Settings
```bash
MCP_GATEWAY_PORT=3001
MCP_GATEWAY_HOST=0.0.0.0
COORDINATOR_TIMEOUT=30000    # milliseconds

# Optional: Prisma AIRS Security Integration
PRISMA_AIRS_ENABLED=false
PRISMA_AIRS_API_URL=https://...
PRISMA_AIRS_API_KEY=...
```

### Switching Between Providers

**From Ollama to Bedrock:**
```bash
# 1. Update environment variables (or modify docker-compose.yml)
LLM_PROVIDER=bedrock
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
BEDROCK_COORDINATOR_MODEL=anthropic.claude-3-sonnet-20240229-v1:0
BEDROCK_AGENT_MODEL=anthropic.claude-3-sonnet-20240229-v1:0

# 2. Restart containers
docker compose restart mcp-gateway hr-mcp-server it-mcp-server general-mcp-server
```

### Provider Comparison

| Aspect | Ollama | AWS Bedrock |
|--------|--------|-----------|
| **Cost** | Free | ~$0.0045/query |
| **Latency** | 500ms-2s | 1-3s |
| **Setup** | Download & run | AWS account + IAM |
| **Ideal For** | Development, offline work | Production, scaling |
| **GPU Required** | Recommended | No |
| **Models Available** | 1.5b-70b | Various (Claude, Llama) |

---

## 🔌 API Reference

### Query Endpoint
```bash
POST /api/query
Content-Type: application/json

{
  "query": "What are my current tasks?",
  "language": "en",
  "context": {
    "userId": "user123",
    "department": "Engineering"
  }
}
```

### Response Format
```json
{
  "response": "You have 3 current tasks...",
  "agent": "hr",
  "language": "en",
  "tokens": {
    "prompt": 234,
    "completion": 156,
    "total": 390
  },
  "timestamp": "2025-10-31T12:00:00Z"
}
```

### Health Check
```bash
GET /health
```

Returns:
```json
{
  "status": "healthy",
  "services": {
    "hr-server": "connected",
    "it-server": "connected",
    "general-server": "connected"
  },
  "uptime": 12345
}
```

---

## Security Features

### Access Control
- RBAC (Role-Based Access Control) support
- Session-based authentication
- Request validation and sanitization

### Data Protection
- Optional Prisma AIRS integration for enterprise security
- Session isolation
- Secure token tracking

### Best Practices
- All credentials stored in environment variables
- No sensitive data in logs
- HTTPS recommended for production

---

## 💬 Internationalization (i18n)

The system supports multiple languages through centralized locale files:

```bash
locales/
├── en/
│   ├── backend.json
│   └── frontend.json
└── fr/
    ├── backend.json
    └── frontend.json
```

**Switch Language:**
```bash
# In request
POST /api/query
{
  "query": "...",
  "language": "fr"
}

# Or environment variable
DEFAULT_LANGUAGE=fr
```

---

## � LLM Provider Implementation

### Architecture

Both Ollama and AWS Bedrock are accessed through a **unified LLM interface** that abstracts away provider-specific details:

```javascript
const llmProvider = LLMProviderFactory.create();

const response = await llmProvider.generate(prompt, {
  system: "You are a helpful assistant",
  temperature: 0.3,
  maxTokens: 1000
});

// Returns consistent format:
{
  response: "...",
  usage: {
    prompt_tokens: 234,
    completion_tokens: 156,
    total_tokens: 390
  }
}
```

### How It Works

**Ollama**: Uses OpenAI-compatible API endpoint at `http://localhost:11434/v1/`

**AWS Bedrock**: Uses AWS SDK with automatic format conversion

**Result**: Same code paths, seamless provider switching

### Token Tracking

All LLM calls automatically track token usage:
- Prompt tokens (input)
- Completion tokens (output)
- Total tokens (combined)

Tracking works consistently across both providers.

---

## Agent Types

### HR Agent
**Purpose**: Employee information and HR queries

**Tools**:
- Get employee information
- Search HR database
- Generate reports
- Access HR policies

**Data Source**: `employees.csv`

### IT Agent
**Purpose**: IT support and ticket management

**Tools**:
- Get ticket information
- Create/update tickets
- IT system queries
- Technical support

**Data Source**: SQLite Database (`tickets.db`)

### General Agent
**Purpose**: General knowledge and questions

**Tools**:
- Search knowledge base
- General Q&A
- Document retrieval
- Information lookup

---

## 📈 Monitoring & Observability

### Logging

All components produce structured logs with:
- Timestamp
- Log level (DEBUG, INFO, WARN, ERROR)
- Component name
- Request ID for tracing
- Performance metrics

**Access logs:**
```bash
tail -f docker-compose logs mcp-gateway
```

### Token Usage Monitoring

Track LLM token consumption:
```bash
# View in API response
"tokens": {
  "prompt": 234,
  "completion": 156,
  "total": 390
}
```

---

## Troubleshooting

### Common Issues

**Q: Agents not responding?**
- Check `/health` endpoint
- Verify all MCP servers are running: `docker ps`
- Check logs: `docker compose logs`

**Q: LLM provider not connecting?**
- For Ollama: Ensure `ollama serve` is running
- For Bedrock: Verify AWS credentials and region
- Check LLM_PROVIDER environment variable is set

**Q: Language translation issues?**
- Verify `locales/` folder is mounted
- Check DEFAULT_LANGUAGE setting
- Restart gateway: `docker compose restart mcp-gateway`

### Debug Mode

Enable verbose logging:
```bash
LOG_LEVEL=debug docker compose up
```

---

## 🏛️ Gateway Architecture

### Component Separation

The MCP Gateway is organized into three focused components:

#### 1. **mcp-server.js** - Protocol Handler
- Handles ONLY MCP protocol communication (JSON-RPC 2.0)
- Session management (create, validate, cleanup)
- Protocol validation and compliance
- Message forwarding to/from MCP servers
- MCP Server Registry

#### 2. **coordinator.js** - Intelligent Routing
- Language detection and translation
- Security analysis via Prisma AIRS (Phase 3)
- LLM-based routing decisions
- Single vs multi-agent coordination
- Query decomposition and response synthesis

#### 3. **prisma-airs.js** - Security API Client
- Prisma AIRS integration for security analysis
- Four security checkpoints:
  1. User input validation
  2. Outbound request analysis
  3. Inbound response analysis
  4. Final output validation

### Data Flow

```
User Query → MCP Protocol Handling → Security Analysis → 
LLM Routing → Agent Selection → Response Synthesis → User
```

---

## Complete API Reference

### Base URL
```
http://localhost:3001
```

### Health Check
```bash
GET /health
```
Returns gateway status and registered servers.

### Query Processing
```bash
POST /api/query
{
  "query": "Who is my manager?",
  "language": "en",
  "userContext": { "employeeId": "EMP123", "department": "Engineering" }
}
```

### MCP Protocol Endpoint
```bash
POST /
Content-Type: application/json
mcp-session-id: <session-id>

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-06-18",
    "clientInfo": { "name": "client-name", "version": "1.0.0" }
  }
}
```

### Supported MCP Methods
- `initialize` - Start new MCP session
- `tools/list` - List available tools
- `resources/list` - List available resources
- `prompts/list` - List available prompts
- `ping` - Connectivity check

### Agent Registration
```bash
POST /api/agents/register
{
  "agentId": "hr-server-001",
  "name": "hr",
  "description": "HR Management Server",
  "url": "http://hr-mcp-server:3002",
  "capabilities": ["employee_lookup", "manager_hierarchy"]
}
```

### Response Format
```json
{
  "success": true,
  "response": "Your manager is Jane Smith...",
  "agentUsed": "hr",
  "tokens": {
    "prompt": 234,
    "completion": 156,
    "total": 390
  }
}
```

### Error Responses
```json
{
  "success": false,
  "error": "Agent not found",
  "details": "hr-server not registered"
}
```

### Security Response (Phase 3)
```json
{
  "success": true,
  "response": "Cannot process this request. Contains: data leak attempt.",
  "securityBlock": true,
  "category": "dlp",
  "reportId": "abc123-def456"
}
```

---

## System Quality

The system has undergone comprehensive improvements including:

- **Code Cleanup**: Dead code removal, unused function elimination
- **Memory Management**: EventEmitter cleanup, resource leak fixes
- **Session Stability**: Proper session limit enforcement
- **Error Handling**: Improved error messages and consistency
- **Request Handling**: AbortController for proper timeout cancellation
- **Security**: Input validation and sanitization

### Known Enhancements

- Removed unreachable code paths
- Fixed memory leaks in event listeners
- Enforced session limits correctly
- Implemented proper request cancellation
- Added security checkpoints
- Standardized error handling

### Architectural Strengths

- Clean modular architecture
- Separation of concerns (protocol, routing, security)
- Comprehensive i18n support
- Enterprise security integration
- Well-documented components

---

## 🚢 Deployment

### Docker Compose
```bash
docker compose up -d
```

### Production Considerations
- Use AWS Bedrock for scalability
- Enable logging aggregation
- Set up monitoring and alerts
- Use HTTPS with proper SSL certificates
- Store credentials securely (AWS Secrets Manager)

---

## 📞 Support

### Common Commands

```bash
# View all services
docker compose ps

# View logs
docker compose logs -f mcp-gateway

# Restart a service
docker compose restart mcp-gateway

# Stop all services
docker compose down

# Rebuild and start
docker compose up --build -d
```

### Health Checks
```bash
# Check gateway health
curl http://localhost:3001/health

# Test query
curl -X POST http://localhost:3001/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "test", "language": "en"}'
```

---

## License

See LICENSE file in the project root.

---

**Last Updated**: October 31, 2025  
**Version**: 1.0 - Complete System Documentation
