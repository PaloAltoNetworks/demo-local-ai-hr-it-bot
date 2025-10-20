# MCP Gateway API Reference

## Overview

This document provides complete API reference for the MCP Gateway, including endpoints, protocols, request/response formats, and configuration.

## Base URL

```
http://localhost:3001
```

## Endpoints

### Health Check

Check the gateway status and registered servers.

**Endpoint:** `GET /health`

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-03T12:34:56.789Z",
  "server": "mcp-gateway",
  "protocol": "MCP JSON-RPC 2.0",
  "version": "2025-06-18",
  "registeredServers": 3
}
```

---

### MCP Protocol Endpoint

Main JSON-RPC 2.0 endpoint for MCP protocol communication.

**Endpoint:** `POST /`

**Headers:**
```
Content-Type: application/json
mcp-session-id: <session-id>  (required for all except 'initialize')
```

**Request Format (JSON-RPC 2.0):**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "<method-name>",
  "params": { }
}
```

**Response Format:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": { }
}
```

**Error Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32600,
    "message": "Invalid Request",
    "data": "Additional error details"
  }
}
```

#### Supported Methods

##### initialize

Initialize a new MCP session.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-06-18",
    "capabilities": {},
    "clientInfo": {
      "name": "my-client",
      "version": "1.0.0"
    }
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "protocolVersion": "2025-06-18",
    "serverInfo": {
      "name": "mcp-gateway-server",
      "version": "1.0.0",
      "description": "MCP Gateway Server - Protocol handler for MCP communication"
    },
    "capabilities": {
      "tools": { "listChanged": true },
      "resources": { "subscribe": true, "listChanged": true },
      "prompts": { "listChanged": true },
      "logging": {}
    }
  }
}
```

**Response Headers:**
```
mcp-session-id: 550e8400-e29b-41d4-a716-446655440000
```

##### tools/list

List available tools (currently delegated to coordinator).

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list",
  "params": {}
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "tools": []
  }
}
```

##### resources/list

List available resources.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "resources/list",
  "params": {}
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "resources": []
  }
}
```

##### prompts/list

List available prompts.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "prompts/list",
  "params": {}
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "prompts": []
  }
}
```

##### ping

Simple connectivity check.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "ping",
  "params": {}
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "result": {
    "acknowledged": true
  }
}
```

---

### Query Processing

Process user queries with intelligent routing.

**Endpoint:** `POST /api/query`

**Headers:**
```
Content-Type: application/json
```

**Request:**
```json
{
  "query": "Who is my manager?",
  "language": "en",
  "userContext": {
    "name": "John Doe",
    "email": "john.doe@example.com",
    "employeeId": "EMP123",
    "department": "Engineering",
    "role": "Software Engineer"
  }
}
```

**Parameters:**
- `query` (required): The user's question
- `language` (optional): Language code (default: "en")
  - Supported: en, fr, es, de, it, pt, zh, ja, ko, ar
- `userContext` (optional): User information for context

**Response (Success):**
```json
{
  "success": true,
  "response": "Your manager is Jane Smith, Engineering Manager.",
  "agentUsed": "hr",
  "translatedQuery": null
}
```

**Response (Security Block - Phase 3):**
```json
{
  "success": true,
  "response": "Cannot process this request. Contains: data leak attempt. Please rephrase your request.",
  "securityBlock": true,
  "category": "dlp",
  "reportId": "abc123-def456-ghi789"
}
```

**Response (Error):**
```json
{
  "success": false,
  "message": "Agent not found: hr"
}
```

---

### Agent Registration

Register a downstream MCP server.

**Endpoint:** `POST /api/agents/register`

**Request:**
```json
{
  "agentId": "hr-server-001",
  "name": "hr",
  "description": "HR Management Server",
  "url": "http://hr-mcp-server:3002",
  "capabilities": [
    "employee_lookup",
    "manager_hierarchy",
    "leave_management",
    "payroll_information"
  ]
}
```

**Parameters:**
- `agentId` (required): Unique identifier for the agent
- `name` (required): Agent name (used for routing)
- `description` (optional): Human-readable description
- `url` (required): Base URL for the MCP server
- `capabilities` (optional): Array of capability strings

**Response:**
```json
{
  "success": true,
  "agentId": "hr-server-001",
  "message": "MCP server registered successfully"
}
```

---

### Agent Unregistration

Remove a registered MCP server.

**Endpoint:** `POST /api/agents/:agentId/unregister`

**Parameters:**
- `agentId` (URL parameter): Agent ID to unregister

**Response:**
```json
{
  "success": true,
  "message": "MCP server unregistered successfully"
}
```

---

### Agent Heartbeat

Update agent health status.

**Endpoint:** `POST /api/agents/:agentId/heartbeat`

**Parameters:**
- `agentId` (URL parameter): Agent ID

**Response:**
```json
{
  "success": true,
  "message": "Heartbeat acknowledged"
}
```

## Error Codes

### JSON-RPC 2.0 Error Codes

| Code   | Message              | Description                                    |
|--------|----------------------|------------------------------------------------|
| -32700 | Parse error          | Invalid JSON received                          |
| -32600 | Invalid Request      | JSON-RPC request is not valid                  |
| -32601 | Method not found     | Method does not exist                          |
| -32602 | Invalid params       | Invalid method parameters                      |
| -32603 | Internal error       | Internal JSON-RPC error                        |
| -32001 | Invalid session      | Session ID is invalid or expired               |

### HTTP Status Codes

| Code | Meaning              | Description                                    |
|------|----------------------|------------------------------------------------|
| 200  | OK                   | Request successful                             |
| 204  | No Content           | Notification received (no response expected)   |
| 400  | Bad Request          | Invalid request format                         |
| 500  | Internal Server Error| Server error occurred                          |

## Configuration

### Environment Variables

```bash
# ============================================
# MCP Server (Protocol Layer)
# ============================================
MCP_GATEWAY_PORT=3001

# ============================================
# Coordinator (Intelligence Layer)
# ============================================

# LLM Models
COORDINATOR_MODEL=qwen2.5:1.5b      # For routing decisions
TRANSLATION_MODEL=aya:8b             # For language translation
OLLAMA_HOST=http://localhost:11434   # Ollama server

# Quality Thresholds
MIN_QUALITY_SCORE=0.7
MIN_COMPLETENESS_SCORE=0.6
MIN_CONFIDENCE_SCORE=0.7

# Coordination Settings
MAX_PARALLEL_SERVERS=5
SEQUENTIAL_TIMEOUT=30000            # milliseconds
COORDINATION_TIMEOUT=15000          # milliseconds

# ============================================
# Security (Phase 3 - Prisma AIRS)
# ============================================
SECURITY_PHASE=phase3               # phase2 or phase3
ENABLE_PRISMA_AIRS=true
PRISMA_AIRS_API_URL=https://service.api.aisecurity.paloaltonetworks.com
PRISMA_AIRS_API_TOKEN=your_x_pan_token
PRISMA_AIRS_PROFILE_ID=your_profile_id
PRISMA_AIRS_PROFILE_NAME=optional_profile_name
SECURITY_FAIL_SECURE=true           # Block on security errors
```

## Security (Phase 3)

### Security Checkpoints

When `SECURITY_PHASE=phase3`, the gateway performs security analysis at four points:

1. **User Input Analysis** - Before processing
2. **Outbound Request Analysis** - Before sending to MCP servers
3. **Inbound Response Analysis** - After receiving from MCP servers
4. **Final Response Analysis** - Before returning to user

### Security Response Format

When security blocks a request:

```json
{
  "response": "Cannot process this request. Contains: prompt injection. Please rephrase your request.",
  "securityBlock": true,
  "category": "injection",
  "reportId": "550e8400-e29b-41d4-a716-446655440000",
  "action": "block"
}
```

### Security Categories

| Category          | Description                                    |
|-------------------|------------------------------------------------|
| injection         | Prompt injection attempt detected              |
| toxic_content     | Toxic or harmful content                       |
| malicious_code    | Malicious code detected                        |
| dlp               | Data leak prevention - sensitive data          |
| topic_violation   | Inappropriate topic                            |
| url_cats          | Malicious URL category                         |
| agent             | Suspicious agent behavior                      |
| ungrounded        | Ungrounded response (hallucination)           |
| db_security       | Database security violation                    |

### Fail-Secure Behavior

- **Config Missing**: All requests blocked
- **API Unavailable**: All requests blocked
- **Network Timeout**: All requests blocked
- **Any Checkpoint Fails**: Request/response blocked

## Rate Limiting

Currently not implemented. Recommended limits:

- `/api/query`: 60 requests/minute per client
- `/api/agents/*`: 10 requests/minute per agent
- `/` (MCP protocol): 100 requests/minute per session

## Session Management

### Session Lifecycle

1. **Creation**: During `initialize` request
2. **Usage**: Validated on all subsequent requests
3. **Expiration**: After 1 hour of inactivity
4. **Cleanup**: Automatic every 5 minutes

### Session Headers

**Client → Gateway:**
```
mcp-session-id: <uuid>
```

**Gateway → Downstream Servers:**
```
mcp-session-id: <uuid>
```

Sessions are separate for each connection (client-gateway, gateway-server).

## Examples

### cURL Examples

**Health Check:**
```bash
curl http://localhost:3001/health
```

**Initialize MCP Session:**
```bash
curl -X POST http://localhost:3001/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-06-18",
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }
    }
  }'
```

**Process Query:**
```bash
curl -X POST http://localhost:3001/api/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Who is my manager?",
    "language": "en"
  }'
```

**Register Agent:**
```bash
curl -X POST http://localhost:3001/api/agents/register \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "hr-server-001",
    "name": "hr",
    "description": "HR Server",
    "url": "http://hr-server:3002",
    "capabilities": ["employee_lookup", "manager_hierarchy"]
  }'
```

### JavaScript/Node.js Example

```javascript
const axios = require('axios');

// Initialize session
const initResponse = await axios.post('http://localhost:3001/', {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    clientInfo: { name: 'my-app', version: '1.0.0' }
  }
});

const sessionId = initResponse.data.result.sessionId;

// Process query
const queryResponse = await axios.post('http://localhost:3001/api/query', {
  query: 'Who is my manager?',
  language: 'en',
  userContext: {
    employeeId: 'EMP123'
  }
});

console.log(queryResponse.data.response);
```

### Python Example

```python
import requests

# Initialize session
init_response = requests.post('http://localhost:3001/', json={
    'jsonrpc': '2.0',
    'id': 1,
    'method': 'initialize',
    'params': {
        'protocolVersion': '2025-06-18',
        'clientInfo': {'name': 'my-app', 'version': '1.0.0'}
    }
})

session_id = init_response.json()['result']['sessionId']

# Process query
query_response = requests.post('http://localhost:3001/api/query', json={
    'query': 'Who is my manager?',
    'language': 'en'
})

print(query_response.json()['response'])
```

## Monitoring

### Health Check Monitoring

Poll the health endpoint regularly:

```bash
*/1 * * * * curl -f http://localhost:3001/health || alert
```

### Log Patterns

Monitor logs for these patterns:

**Errors:**
```
❌ [MCPServer] Error:
❌ [Coordinator] Query processing failed:
❌ [PrismaAIRS] Prisma AIRS intercept error:
```

**Security Events:**
```
🚫 [Coordinator] User input BLOCKED by security
🚫 [Coordinator] Outbound request to hr BLOCKED by security
🚫 [Coordinator] Inbound response from it BLOCKED by security
🚫 [Coordinator] Final response BLOCKED by security
```

**Success:**
```
✅ [Coordinator] Response from hr agent received
✅ [MCPServerRegistry] Response from hr
```

## References

- [Gateway Architecture](./architecture.md)
- [Implementation Guide](./implementation.md)
- [MCP Specification 2025-06-18](https://spec.modelcontextprotocol.io/)
- [Prisma AIRS API Docs](https://docs.paloaltonetworks.com/prisma/airs)
