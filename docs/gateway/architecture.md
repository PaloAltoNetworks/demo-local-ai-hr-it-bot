# MCP Gateway Architecture

## Overview

The MCP Gateway acts as an intelligent routing layer between the chatbot host and specialized MCP servers. It handles protocol communication, intelligent routing, security analysis, and multi-agent coordination.

## Component Separation

The gateway is split into three distinct, focused components following the Single Responsibility Principle:

### 1. **mcp-server.js** - Protocol Handler

**Responsibility:** Handle ONLY MCP protocol communication

**What it does:**
- JSON-RPC 2.0 request/response handling
- Session management (create, validate, cleanup)
- Protocol validation and compliance
- Message forwarding to/from downstream MCP servers
- MCP Server Registry (tracks connected servers)

**What it does NOT do:**
- Make routing decisions
- Perform security analysis
- Execute LLM-based intelligence
- Translate languages
- Coordinate multi-agent responses

**Key Classes:**
- `MCPServer`: Handles MCP protocol specification compliance
- `MCPServerRegistry`: Manages connections to downstream MCP servers

### 2. **coordinator.js** - Intelligent Routing & Coordination

**Responsibility:** ALL routing decisions and intelligence

**What it does:**
- Language detection and translation
- Security analysis via Prisma AIRS (Phase 3)
- LLM-based routing strategy determination
- Single vs multi-agent decision making
- Query decomposition and coordination
- Response synthesis and quality assurance
- Agent registry and capability matching

**What it does NOT do:**
- Handle MCP protocol details
- Manage protocol sessions
- Forward protocol messages directly

**Key Classes:**
- `IntelligentCoordinator`: Main orchestrator for all intelligence
- `AgentRegistry`: Tracks agent capabilities for routing decisions

**Security Checkpoints (Phase 3):**
1. **User Input Analysis**: Validates incoming queries before processing
2. **Outbound Request Analysis**: Validates sub-queries sent to MCP servers
3. **Inbound Response Analysis**: Validates responses from MCP servers
4. **Final Response Analysis**: Validates coordinated output before user delivery

### 3. **prisma-airs.js** - Security API Client

**Responsibility:** ONLY communication with Prisma AIRS API

**What it does:**
- API request formatting for Prisma AIRS
- Security analysis execution
- Response parsing and error handling
- Threat detection reporting

**What it does NOT do:**
- Make security decisions (only reports findings)
- Handle routing logic
- Manage protocol communication

**Key Classes:**
- `PrismaAIRSIntercept`: API client for Palo Alto Networks AIRS

## Data Flow

### Simple Query Flow
```
User Request
    ↓
[MCPServer] Protocol validation & session management
    ↓
[Coordinator] Language detection & translation
    ↓
[Coordinator] Security Checkpoint 1: User Input (if Phase 3)
    ↓
[Coordinator] LLM-based routing decision
    ↓
[Coordinator] Security Checkpoint 2: Outbound Request (if Phase 3)
    ↓
[MCPServerRegistry] Forward to downstream MCP server
    ↓
[MCPServerRegistry] Receive response
    ↓
[Coordinator] Security Checkpoint 3: Inbound Response (if Phase 3)
    ↓
[Coordinator] Response processing & translation
    ↓
[Coordinator] Security Checkpoint 4: Final Response (if Phase 3)
    ↓
[MCPServer] Return via JSON-RPC 2.0
    ↓
User Response
```

### Multi-Agent Query Flow
```
User Request
    ↓
[MCPServer] Protocol validation
    ↓
[Coordinator] Translation & Security Checkpoint 1
    ↓
[Coordinator] Analyze query complexity → Multi-agent required
    ↓
[Coordinator] Decompose into sub-queries
    ↓
For each sub-query:
    [Coordinator] Security Checkpoint 2 → Outbound
    [MCPServerRegistry] Forward to server
    [Coordinator] Security Checkpoint 3 → Inbound
    ↓
[Coordinator] Synthesize all responses
    ↓
[Coordinator] Security Checkpoint 4 → Final output
    ↓
[MCPServer] Return response
    ↓
User Response
```

## Communication Patterns

### Host → Gateway
- **Protocol:** JSON-RPC 2.0 over HTTP
- **Handler:** `MCPServer`
- **Endpoint:** `POST /`
- **Session:** Managed via `mcp-session-id` header

### Gateway → Downstream MCP Servers
- **Protocol:** MCP JSON-RPC 2.0
- **Handler:** `MCPServerRegistry.forwardRequest()`
- **Session:** Managed via `mcp-session-id` headers
- **Initialization:** Automatic on first request

### Coordinator → Prisma AIRS (Phase 3)
- **Protocol:** REST API
- **Handler:** `PrismaAIRSIntercept.analyzeContent()`
- **Authentication:** `x-pan-token` header
- **Endpoint:** `/v1/scan/sync/request`

## Error Handling Philosophy

### No Fallbacks - Transparent Errors

**Design Principle:** Do not provide fallback responses. Let errors propagate to upper components and ultimately to the end user.

**Rationale:**
- **Transparency**: Users should know when something fails
- **Debugging**: Clear error messages help identify issues
- **Reliability**: Don't mask failures with degraded responses

**Examples:**

```javascript
// ✅ CORRECT: Throw errors, don't hide them
async queryAgent(agentId, query) {
  const agent = this.registry.getAgent(agentId);
  if (!agent) {
    throw new Error(`Agent ${agentId} not found`);
  }
  // ... proceed
}

// ❌ WRONG: Don't provide fallback responses
async queryAgent(agentId, query) {
  const agent = this.registry.getAgent(agentId);
  if (!agent) {
    return "I'm sorry, I couldn't process your request."; // BAD
  }
}
```

**Security Errors:**

When Prisma AIRS blocks content, return the security message directly:

```javascript
{
  response: "Cannot process this request. Contains: data leak attempt.",
  securityBlock: true,
  category: "dlp",
  reportId: "abc123"
}
```

## Session Management

### Gateway Sessions (Client ↔ Gateway)
- Created during `initialize` request
- Validated on all subsequent requests
- Stored in `MCPServer.sessions` Map
- Auto-cleanup of expired sessions (every 5 minutes)

### Downstream Sessions (Gateway ↔ MCP Servers)
- Created during first request to each server
- Stored in `MCPServerRegistry.initializedSessions` Map
- Reused for all subsequent requests to same server
- Persistent across gateway restarts (servers must re-register)

## Configuration

### Environment Variables

```bash
# MCP Server (Protocol)
MCP_GATEWAY_PORT=3001

# Coordinator (Intelligence)
COORDINATOR_MODEL=qwen2.5:1.5b
TRANSLATION_MODEL=aya:8b
OLLAMA_HOST=http://localhost:11434

# Security (Phase 3)
SECURITY_PHASE=phase3
PRISMA_AIRS_API_URL=https://service.api.aisecurity.paloaltonetworks.com
PRISMA_AIRS_API_TOKEN=your_token
PRISMA_AIRS_PROFILE_ID=your_profile_id

# Quality Thresholds
MIN_QUALITY_SCORE=0.7
MIN_COMPLETENESS_SCORE=0.6
MIN_CONFIDENCE_SCORE=0.7



# Coordination Settings
MAX_PARALLEL_SERVERS=5
SEQUENTIAL_TIMEOUT=30000
COORDINATION_TIMEOUT=15000
```

## Monitoring & Observability

### Key Metrics

**MCPServer:**
- Active session count
- Request throughput (requests/sec)
- Protocol errors (validation failures)
- Session creation/cleanup rate

**Coordinator:**
- Routing decisions (single/multi-agent split)
- Translation requests
- Security blocks (by checkpoint and category)
- Agent selection distribution

**PrismaAIRS:**
- API calls per checkpoint
- Block rate (blocked/total)
- Average latency per request
- API errors and timeouts

### Log Patterns

```
[MCPServer] - Protocol-level events
  • Session management
  • JSON-RPC validation
  • Request handling

[MCPServerRegistry] - Downstream server communication
  • Session initialization
  • Request forwarding
  • Health status

[Coordinator] - Routing and intelligence decisions
  • Language detection/translation
  • Routing strategy
  • Agent selection
  • Response synthesis

[PrismaAIRS] - Security analysis events
  • Checkpoint execution
  • Security violations
  • API errors
```

### Health Check

**Endpoint:** `GET /health`

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-03T...",
  "server": "mcp-gateway",
  "protocol": "MCP JSON-RPC 2.0",
  "version": "2025-06-18",
  "registeredServers": 3
}
```

## Testing Strategy

### Unit Testing

**Test MCPServer independently:**
```javascript
const mcpServer = new MCPServer();
const result = await mcpServer.handleRequest({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { 
    protocolVersion: '2025-06-18',
    clientInfo: { name: 'test-client' }
  }
});
expect(result.sessionId).toBeDefined();
```

**Test Coordinator independently:**
```javascript
const coordinator = new IntelligentCoordinator(ollamaUrl, mockRegistry);
await coordinator.initialize();
const result = await coordinator.processQuery("Who is my manager?", "en");
expect(result.response).toBeDefined();
```

**Test Prisma AIRS independently:**
```javascript
const prismaAIRS = new PrismaAIRSIntercept(config);
const result = await prismaAIRS.analyzePrompt("malicious query");
expect(result.approved).toBe(false);
```

### Integration Testing

**End-to-end query flow:**
1. Send query to `/api/query`
2. Verify agent selection
3. Check security checkpoints (if Phase 3)
4. Validate response format
5. Check translation (if non-English)

### Security Testing (Phase 3)

Test all four checkpoints:
1. User input with malicious content
2. Outbound request manipulation attempts
3. Inbound response with sensitive data
4. Final output data leakage

## Performance Considerations

### Optimization Strategies

**Language Translation:**
- Cache common translations
- Use lightweight translation model (aya:8b)
- Skip translation for English queries

**Security Analysis:**
- Batch analysis when possible
- Async logging to reduce latency
- Content deduplication across checkpoints

**Agent Communication:**
- Reuse MCP sessions
- Connection pooling for HTTP requests
- Parallel execution for multi-agent queries

### Scalability

**Horizontal Scaling:**
- Stateless coordinator design enables multiple instances
- Session state can be externalized (Redis, etc.)
- Load balance across gateway instances

**Resource Management:**
- Session cleanup prevents memory leaks
- Request timeouts prevent hanging connections
- Circuit breakers for failing agents

## Future Enhancements

1. **Protocol**: WebSocket transport for persistent connections
2. **Coordinator**: Response caching for repeated queries
3. **Security**: Custom security rules beyond Prisma AIRS
4. **Observability**: Prometheus metrics export
5. **Resilience**: Circuit breakers and retry policies

## References

- [MCP Specification 2025-06-18](https://spec.modelcontextprotocol.io/)
- [Prisma AIRS API Documentation](https://docs.paloaltonetworks.com/prisma/airs)
- [Implementation Guide](./implementation.md)
- [API Reference](./api-reference.md)
