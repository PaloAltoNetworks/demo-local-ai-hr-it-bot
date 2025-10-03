# MCP Gateway Implementation Guide

## Refactoring Overview

This document describes the refactoring that split the MCP Gateway into three distinct components with clear separation of concerns.

## Objectives Achieved

✅ **mcp-server.js** - Pure MCP protocol communication  
✅ **coordinator.js** - All routing decisions and intelligence  
✅ **prisma-airs.js** - Security API communication only  
✅ Clear separation of concerns  
✅ No fallback logic - transparent errors  
✅ Prisma AIRS integration complete (Phase 3)  
✅ Enhanced testability and maintainability  

## Component Changes

### 1. mcp-server.js - Complete Rewrite

**Before:**
- Mixed protocol handling with routing logic
- Had `analyze_query` tool that made routing decisions
- Directly connected to MCP agents via axios
- ~1126 lines of mixed responsibilities
- Session management scattered across codebase

**After:**
- **Pure protocol handler** (~650 lines)
- Only handles JSON-RPC 2.0 compliance
- Dedicated session management
- Protocol validation
- Delegates ALL routing to Coordinator

**Key Changes:**

```javascript
// REMOVED: Routing logic
// REMOVED: analyze_query tool implementation
// REMOVED: Direct MCP agent communication with axios
// REMOVED: LLM-based decision making

// ADDED: Session management
createSession(clientInfo)
validateSession(sessionId)
cleanupSessions(maxAge)

// ADDED: MCPServerRegistry for protocol forwarding only
class MCPServerRegistry {
  async initializeSession(serverId)  // Session with downstream server
  async forwardRequest(serverId, jsonRpcRequest) // Pure forwarding
  register(serverData)  // Track servers
  unregister(agentId)   // Remove servers
}
```

**New Architecture:**
```javascript
// Protocol handler ONLY
class MCPServer {
  async handleRequest(jsonRpcRequest, sessionId) {
    // Validate JSON-RPC 2.0
    // Route by method to handlers
    // Return protocol-compliant response
  }
}

// No routing decisions - just protocol forwarding
class MCPServerRegistry {
  async forwardRequest(serverId, request) {
    const session = await this.initializeSession(serverId);
    // Forward via fetch() with session header
    return response;
  }
}
```

### 2. coordinator.js - Enhanced Intelligence Layer

**Before:**
- Class named `MCPGateway`
- Mixed MCP protocol concerns
- Had `initializeMCPSession()` method using axios
- Directly managed sessions with agents
- No security integration

**After:**
- Renamed to `IntelligentCoordinator`
- **Pure intelligence layer** - no protocol handling
- Uses `MCPServerRegistry` for all protocol forwarding
- **Full Prisma AIRS integration** (4 security checkpoints)
- Clean dependency injection

**Key Changes:**

```javascript
// RENAMED: MCPGateway → IntelligentCoordinator
class IntelligentCoordinator {
  constructor(ollamaUrl, mcpServerRegistry) {
    this.mcpServerRegistry = mcpServerRegistry; // Protocol delegation
    this.prismaAIRS = new PrismaAIRSIntercept(...); // Security
    this.registry = new AgentRegistry(); // Agent tracking for routing
  }

  // NEW: Four security checkpoints (Phase 3)
  async analyzeUserInput(query, language)
  async analyzeOutboundRequest(subQuery, serverName, language)  
  async analyzeInboundResponse(prompt, response, serverName, language)
  async analyzeFinalResponse(prompt, response, language)

  // MODIFIED: Uses mcpServerRegistry for forwarding
  async queryAgent(agentId, query, userContext, language) {
    // Security checkpoint 2 (outbound)
    if (shouldUsePrismaAIRS(this.securityPhase)) {
      const security = await this.analyzeOutboundRequest(query, agent.name, language);
      if (!security.approved) throw new Error(...);
    }

    // Delegate to MCPServerRegistry for protocol
    const result = await this.mcpServerRegistry.forwardRequest(agentId, request);
    
    // Security checkpoint 3 (inbound)
    if (shouldUsePrismaAIRS(this.securityPhase)) {
      const security = await this.analyzeInboundResponse(query, response, agent.name, language);
      if (!security.approved) throw new Error(...);
    }
    
    return response;
  }

  // REMOVED: initializeMCPSession() - now in MCPServerRegistry
  // REMOVED: Direct axios calls to agents
  // REMOVED: Session header management
}
```

**Security Integration (Phase 3):**

```javascript
async processQuery(query, language, userContext) {
  // CHECKPOINT 1: User input security
  if (shouldUsePrismaAIRS(this.securityPhase)) {
    const inputSecurity = await this.analyzeUserInput(query, language);
    if (!inputSecurity.approved) {
      return {
        response: inputSecurity.message,
        securityBlock: true,
        category: inputSecurity.category,
        reportId: inputSecurity.reportId
      };
    }
  }

  // Translation and routing logic...

  // CHECKPOINT 2 & 3: In queryAgent() method
  const response = await this.queryAgent(...);

  // CHECKPOINT 4: Final response security
  if (shouldUsePrismaAIRS(this.securityPhase)) {
    const finalSecurity = await this.analyzeFinalResponse(query, response, language);
    if (!finalSecurity.approved) {
      return {
        response: finalSecurity.message,
        securityBlock: true,
        category: finalSecurity.category,
        reportId: finalSecurity.reportId
      };
    }
  }

  return { response, agentUsed, translatedQuery };
}
```

### 3. prisma-airs.js - No Changes

**Status:** Already properly focused

- Pure security API client
- Clean interface for coordinator
- Proper error handling and reporting
- No refactoring needed

## Migration Guide

### Code Changes Required

**1. Import Statement:**

```javascript
// OLD
const { MCPGateway } = require('./coordinator');

// NEW
const { IntelligentCoordinator } = require('./coordinator');
```

**2. Instantiation:**

```javascript
// OLD
const gateway = new MCPGateway(ollamaUrl, dataService);

// NEW
const mcpRegistry = new MCPServerRegistry();
const coordinator = new IntelligentCoordinator(ollamaUrl, mcpRegistry);
```

**3. Method Calls:**

All public methods remain the same:
```javascript
await coordinator.initialize();
await coordinator.processQuery(query, language, userContext);
await coordinator.registerAgent(agentData);
await coordinator.unregisterAgent(agentId);
await coordinator.cleanup();
```

### Environment Variables

**New (Phase 3 Security):**
```bash
SECURITY_PHASE=phase3
PRISMA_AIRS_API_URL=https://service.api.aisecurity.paloaltonetworks.com
PRISMA_AIRS_API_TOKEN=your_token
PRISMA_AIRS_PROFILE_ID=your_profile_id
PRISMA_AIRS_PROFILE_NAME=optional_profile_name
```

**Existing (Unchanged):**
```bash
MCP_GATEWAY_PORT=3001
COORDINATOR_MODEL=qwen2.5:1.5b
TRANSLATION_MODEL=aya:8b
OLLAMA_HOST=http://localhost:11434
```

### File Structure

```
mcp-gateway/
├── mcp-server.js          # NEW: Pure protocol handler
├── mcp-server-old.js      # BACKUP: Original implementation
├── coordinator.js         # MODIFIED: Pure intelligence
├── prisma-airs.js         # UNCHANGED: Security API
├── i18n.js               # UNCHANGED: Internationalization
├── package.json          # UNCHANGED
└── Dockerfile            # UNCHANGED
```

## Integration Points

### 1. Express App Initialization

```javascript
// Create Express app
const app = express();
const PORT = process.env.MCP_GATEWAY_PORT || 3001;

// Initialize components
const mcpServer = new MCPServer();
const mcpRegistry = new MCPServerRegistry();
const coordinator = new IntelligentCoordinator(ollamaUrl, mcpRegistry);

// Initialize coordinator
app.listen(PORT, async () => {
  await coordinator.initialize();
});
```

### 2. MCP Protocol Endpoint

```javascript
// Main MCP endpoint - Protocol handled by MCPServer
app.post('/', async (req, res) => {
  const jsonRpcRequest = req.body;
  const sessionId = req.headers['mcp-session-id'];
  
  // MCP Server handles protocol
  const result = await mcpServer.handleRequest(jsonRpcRequest, sessionId);
  
  // Return session ID for initialize requests
  if (jsonRpcRequest.method === 'initialize' && result.sessionId) {
    res.set('mcp-session-id', result.sessionId);
  }
  
  res.json({ jsonrpc: '2.0', id: jsonRpcRequest.id, result });
});
```

### 3. Query Processing Endpoint

```javascript
// Query endpoint - Intelligence handled by Coordinator
app.post('/api/query', async (req, res) => {
  const { query, language = 'en', userContext } = req.body;
  
  // Coordinator handles routing and intelligence
  const result = await coordinator.processQuery(query, language, userContext);
  
  res.json({ success: true, ...result });
});
```

### 4. Agent Registration

```javascript
// Registration endpoint - Both components notified
app.post('/api/agents/register', (req, res) => {
  const agentData = req.body;
  
  // Register with MCPServerRegistry (for protocol)
  const result = mcpRegistry.register(agentData);
  
  // Register with Coordinator (for routing)
  coordinator.registerAgent(agentData);
  
  res.json(result);
});
```

## Testing Checklist

### Protocol Layer (MCPServer)

- [ ] Session creation returns valid UUID
- [ ] Session validation works correctly
- [ ] Expired sessions are cleaned up
- [ ] JSON-RPC 2.0 validation catches errors
- [ ] Initialize method creates session
- [ ] Protocol methods return correct format

### Intelligence Layer (Coordinator)

- [ ] Language detection works for supported languages
- [ ] Translation to/from English works
- [ ] Single agent routing selects correct agent
- [ ] Multi-agent coordination splits queries correctly
- [ ] Response synthesis combines results properly
- [ ] Query fails appropriately when agent unavailable

### Security Integration (Phase 3)

- [ ] Checkpoint 1: User input blocks malicious queries
- [ ] Checkpoint 2: Outbound requests are validated
- [ ] Checkpoint 3: Inbound responses are screened
- [ ] Checkpoint 4: Final output is analyzed
- [ ] Security blocks return proper error messages
- [ ] Security metadata includes report IDs

### Integration Tests

- [ ] End-to-end query flow works
- [ ] Agent registration succeeds
- [ ] Health check returns correct status
- [ ] Multi-agent queries coordinate properly
- [ ] Translation works in query flow
- [ ] Security blocks prevent response delivery

## Performance Validation

### Baseline Metrics

**Before Refactoring:**
- Average query latency: ~2-3 seconds
- Memory usage: Variable (no session cleanup)
- Protocol errors: Occasional validation issues

**After Refactoring:**
- Average query latency: Similar (~2-3 seconds)
- Memory usage: Stable (automatic session cleanup)
- Protocol errors: Clean JSON-RPC validation
- Security overhead (Phase 3): +500ms per checkpoint

### Optimization Opportunities

1. **Caching**
   - Cache translation results
   - Cache routing decisions for similar queries
   - Cache agent capabilities

2. **Parallel Execution**
   - Run security checkpoints in parallel where safe
   - Parallel multi-agent coordination

3. **Connection Pooling**
   - Reuse HTTP connections to agents
   - Keep alive for frequent queries

## Rollback Plan

If critical issues arise:

```bash
cd mcp-gateway

# Backup new version
mv mcp-server.js mcp-server-refactored.js

# Restore old version
mv mcp-server-old.js mcp-server.js

# Revert coordinator.js exports
# Change: module.exports = { IntelligentCoordinator };
# To:     module.exports = { MCPGateway };

# Restart service
npm start
```

## Common Issues & Solutions

### Issue: Agent not found errors

**Cause:** Agent not registered with both MCPServerRegistry and Coordinator

**Solution:**
```javascript
// Ensure both registrations happen
mcpRegistry.register(agentData);
coordinator.registerAgent(agentData);
```

### Issue: Session validation failures

**Cause:** Session ID not being passed in headers

**Solution:**
```javascript
// Ensure mcp-session-id header is set
headers: { 'mcp-session-id': sessionId }
```

### Issue: Security checkpoint blocks everything

**Cause:** Prisma AIRS misconfigured or unavailable

**Solution:**
```javascript
// Check configuration
if (!prismaAIRS.isConfigured()) {
  console.error('Prisma AIRS not configured');
}

// Verify environment variables
console.log(process.env.PRISMA_AIRS_API_TOKEN ? 'Token set' : 'Token missing');
```

### Issue: Translation fails

**Cause:** Ollama not running or model not available

**Solution:**
```bash
# Verify Ollama is running
curl http://localhost:11434/api/tags

# Pull required models
ollama pull qwen2.5:1.5b
ollama pull aya:8b
```

## Next Steps

1. **Monitor Production**
   - Watch logs for errors
   - Check health endpoint regularly
   - Monitor security block rates

2. **Optimize Performance**
   - Implement caching where beneficial
   - Profile slow queries
   - Optimize LLM prompts

3. **Enhance Security**
   - Add custom security rules
   - Implement rate limiting
   - Add request validation

4. **Improve Observability**
   - Add structured logging
   - Export Prometheus metrics
   - Create monitoring dashboards

## References

- [Gateway Architecture](./architecture.md)
- [API Reference](./api-reference.md)
- [Security Design](../planning/security-phase3.md)
- [MCP Specification](https://spec.modelcontextprotocol.io/)
