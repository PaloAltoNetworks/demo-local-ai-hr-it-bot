# MCP Server Architecture - Refactored

## Overview

This refactored MCP (Model Context Protocol) server section provides a modular, maintainable architecture for building specialized AI agents. Each agent handles a specific domain (General, HR, IT) while sharing common infrastructure through a well-designed base class and utility modules.

## Architecture

### Directory Structure

```
mcp-server/
├── Dockerfile.agent
├── general-mcp-server
│   ├── package.json
│   └── server.js
├── hr-mcp-server
│   ├── employees.csv
│   ├── package.json
│   └── server.js
├── it-mcp-server
│   ├── package.json
│   ├── server.js
│   └── tickets.csv
├── README.md
└── shared
    ├── package.json
    └── utils
        ├── config.js
        ├── coordinator-client.js
        ├── logger.js
        ├── query-processor.js
        ├── resource-manager.js
        └── transport-manager.js
```

## Core Modules

### 1. Logger (`utils/logger.js`)

Provides consistent, contextual logging across all agents.

```javascript
import { Logger } from '../shared/utils/logger.js';

const logger = new Logger('agent-name');
logger.info('Connection established');
logger.success('Operation completed');
logger.warn('Non-critical issue');
logger.error('Operation failed', error);
logger.thinking('Analyzing query...');
```

**Log Levels:**
- `debug()` - 🔍 Debug information
- `info()` - ℹ️ Informational messages
- `success()` - ✅ Success messages
- `warn()` - ⚠️ Warning messages
- `error()` - ❌ Error messages
- `thinking()` - 💭 AI thinking process
- `request()` - 🌐 HTTP requests

### 2. ConfigManager (`utils/config.js`)

Centralized configuration management with environment variables.

```javascript
import { ConfigManager } from '../shared/utils/config.js';

const config = ConfigManager.getConfig();
// Access: config.coordinator.url, config.agent.port, etc.

const agentConfig = ConfigManager.getAgentConfig('hr');
const backoffDelay = ConfigManager.calculateBackoffDelay(attemptNumber);
```

**Configuration Defaults:**
- Coordinator URL: `http://mcp-gateway:3001`
- Agent Port: `3000`
- Ollama URL: `http://host.docker.internal:11434`
- Model: `llama3.2:3b`
- Heartbeat Interval: 30 seconds

### 3. CoordinatorClient (`utils/coordinator-client.js`)

Handles all communication with the MCP coordinator.

```javascript
import { CoordinatorClient } from '../shared/utils/coordinator-client.js';

const coordinator = new CoordinatorClient(agentName, agentId, description);

// Register with coordinator
await coordinator.register(agentUrl, capabilities);

// Start sending heartbeats
coordinator.startHeartbeat(onReconnectCallback);

// Unregister on shutdown
await coordinator.unregister();
```

**Features:**
- Automatic registration with retries and exponential backoff
- Periodic heartbeat to maintain registration
- Auto-reconnection on failure
- Graceful unregistration on shutdown

### 4. MCPTransportManager (`utils/transport-manager.js`)

Manages HTTP transport layer and session handling for MCP protocol.

```javascript
import { MCPTransportManager } from '../shared/utils/transport-manager.js';

const manager = new MCPTransportManager(agentName, mcpServer);
const app = manager.createApp();
app.listen(port);
```

**Handles:**
- Session creation and management
- Tool call request processing
- Resource list request handling
- Server-Sent Events (SSE) responses
- Request routing and transport lifecycle

### 5. QueryProcessor (`utils/query-processor.js`)

Handles query processing through Ollama.

```javascript
import { QueryProcessor } from '../shared/utils/query-processor.js';

const processor = new QueryProcessor(agentName);

// Process a query with system prompt
const response = await processor.processWithModel(systemPrompt, userQuery);

// Get available models
const models = await processor.getAvailableModels();
```

**Features:**
- Configurable model selection
- Temperature control for response consistency
- Automatic error handling
- Model availability checking

### 6. ResourceManager (`utils/resource-manager.js`)

Simplifies MCP resource registration.

```javascript
import { ResourceManager } from '../shared/utils/resource-manager.js';

const manager = new ResourceManager(agentName, mcpServer);

// Register static resource
manager.registerStaticResource(
  'resource-name',
  'protocol://resource-uri',
  { title: '...', description: '...', mimeType: 'text/plain' },
  async (uri) => ({ contents: [...] })
);

// Register template resource
manager.registerTemplateResource(
  'dynamic-resource',
  { uri: 'protocol://resource/{id}', params: {} },
  { title: '...', description: '...', mimeType: 'text/plain' },
  async (uri, params) => ({ contents: [...] })
);

// Get resources list
const resources = manager.getResourcesList();
manager.logResourceSummary();
```

## Base Agent Class

### MCPAgentBase (`shared/mcp-agent-base.js`)

The refactored base class provides a clean interface for creating specialized agents.

```javascript
import { MCPAgentBase } from '../shared/mcp-agent-base.js';

class MyAgent extends MCPAgentBase {
  constructor() {
    super('agent-name', 'Agent description');
  }

  setupResources() {
    // Register MCP resources
  }

  async processQuery(query, context = {}) {
    // Implement query processing
  }

  getCapabilities() {
    // Return array of capabilities
  }

  canHandle(query, context = {}) {
    // Return confidence score 0-100
  }
}
```

**Lifecycle:**
1. Constructor initialization
2. `setupResources()` - Register MCP resources and tools
3. `start()` - Start HTTP server and register with coordinator
4. Incoming requests → tools/resources handlers
5. `cleanup()` - Graceful shutdown

**Key Methods:**
- `start()` - Initialize server and register with coordinator
- `setupResources()` - Register MCP resources (override in subclass)
- `processQuery()` - Process user queries (implement in subclass)
- `getCapabilities()` - Describe agent capabilities (implement in subclass)
- `canHandle()` - Determine if agent can handle query (implement in subclass)
- `healthCheck()` - Return health status

## Agent Implementations

### General Agent

Fallback agent for general workplace questions.

**Resources:**
- `general://policies` - Workplace policies and guidelines
- `general://query{?q*}` - Process general queries

**Capabilities:**
- Answer general workplace questions
- Provide company policy information
- Route to appropriate specialists
- Handle miscellaneous queries

### HR Agent

Specialized agent for HR-related queries.

**Resources:**
- `hr://employees` - Complete employee database (CSV)
- `hr://employees/{employeeId}/profile` - Individual employee profile
- `hr://query{?q*}` - Process HR queries

**Capabilities:**
- Query employee information and contact details
- Find managers and reporting relationships
- Retrieve team structure and organizational hierarchy
- Check leave balances and PTO status
- Access salary and compensation information
- Provide benefits information
- Answer HR policy questions

**Data Source:** `employees.csv`

### IT Agent

Specialized agent for IT support and technical issues.

**Resources:**
- `it://tickets` - Complete IT tickets database (CSV)
- `it://tickets/{ticketId}` - Individual ticket details
- `it://query{?q*}` - Process IT queries

**Capabilities:**
- Access IT support tickets and ticket history
- Check ticket status and priority
- Find ticket assignments and responsible technicians
- Retrieve technical issue descriptions
- Check resolution details and closure information
- Answer IT policy questions
- Provide troubleshooting guidance

**Data Source:** `tickets.csv`

## Creating a New Agent

### Step 1: Create Agent Directory

```bash
mkdir mcp-server/new-agent-mcp-server
cd mcp-server/new-agent-mcp-server
```

### Step 2: Create Package.json

```json
{
  "name": "new-agent-mcp",
  "version": "1.0.0",
  "description": "New Agent MCP Server",
  "main": "server.js",
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.20.1",
    "ollama": "^0.6.0"
  },
  "devDependencies": {
    "nodemon": "^3.1.10"
  },
  "keywords": ["mcp", "agent", "chatbot"],
  "author": "System",
  "license": "MIT"
}
```

### Step 3: Implement Agent

Create `server.js`:

```javascript
import { MCPAgentBase } from '../shared/mcp-agent-base.js';
import { ResourceManager } from '../shared/utils/resource-manager.js';
import { QueryProcessor } from '../shared/utils/query-processor.js';

class NewAgent extends MCPAgentBase {
  constructor() {
    super('new-agent', 'Description of new agent');
    this.queryProcessor = new QueryProcessor(this.agentName);
    this.resourceManager = null;
  }

  setupResources() {
    this.resourceManager = new ResourceManager(this.agentName, this.server);

    // Register your resources here
    this.resourceManager.registerStaticResource(
      'my-resource',
      'newagent://resource',
      {
        title: 'My Resource',
        description: 'Resource description',
        mimeType: 'text/plain'
      },
      async (uri) => ({
        contents: [{ uri: uri.href, text: 'Resource content' }]
      })
    );

    this.resourceManager.logResourceSummary();
  }

  getAvailableResources() {
    return this.resourceManager?.getResourcesList() || [];
  }

  getCapabilities() {
    return [
      'Capability 1',
      'Capability 2'
    ];
  }

  canHandle(query, context = {}) {
    // Return confidence score 0-100
    const keywords = ['keyword1', 'keyword2'];
    let score = 0;
    keywords.forEach(kw => {
      if (query.toLowerCase().includes(kw)) score += 25;
    });
    return Math.min(score, 100);
  }

  async processQuery(query) {
    this.sendThinkingMessage('Analyzing query...');
    const systemPrompt = 'You are a helpful agent...';
    return await this.queryProcessor.processWithModel(systemPrompt, query);
  }

  async healthCheck() {
    const baseHealth = await super.healthCheck();
    return {
      ...baseHealth,
      dataTypes: [],
      resources: this.getAvailableResources().length
    };
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const agent = new NewAgent();
  agent.start().catch(error => {
    console.error('❌ Failed to start New Agent:', error);
    process.exit(1);
  });
}

export { NewAgent };
```

### Step 4: Create Dockerfile

```dockerfile
FROM node:22-alpine

WORKDIR /app

COPY mcp-server/new-agent-mcp-server/package*.json ./
COPY mcp-server/shared/package*.json ./shared/

RUN npm install
RUN cd shared && npm install

COPY mcp-server/shared/ ./shared/
COPY mcp-server/new-agent-mcp-server/server.js ./server.js

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "console.log('New Agent Health Check - OK')" || exit 1

EXPOSE 3000

CMD ["node", "server.js"]
```

### Step 5: Update docker-compose.yml

Add to your docker-compose.yml:

```yaml
  new-agent-mcp-server:
    build:
      context: .
      dockerfile: mcp-server/new-agent-mcp-server/Dockerfile
    container_name: new-agent-mcp-server
    ports:
      - "3002:3000"  # Use different port
    environment:
      - PORT=3000
      - COORDINATOR_URL=http://mcp-gateway:3001
      - OLLAMA_URL=http://host.docker.internal:11434
      - AGENT_MODEL=llama3.2:3b
    networks:
      - mcp-network
    depends_on:
      - mcp-gateway
    healthcheck:
      test: ["CMD", "node", "-e", "console.log('OK')"]
      interval: 30s
      timeout: 10s
      retries: 3
```

## Migration Guide

### From Old to New Architecture

**Old way (mcp-agent-base.js):**
```javascript
class MyAgent extends MCPAgentBase { ... }
```

**New way (mcp-agent-base.js):**
```javascript
class MyAgent extends MCPAgentBase {
  constructor() {
    super('agent-name', 'description');
    this.queryProcessor = new QueryProcessor(this.agentName);
    this.resourceManager = null;
  }

  setupResources() {
    this.resourceManager = new ResourceManager(this.agentName, this.server);
    // Register resources using manager
  }

  // ... rest of implementation
}
```

**Key Improvements:**
- ✅ Separated concerns (logging, config, coordinator, transport, query, resources)
- ✅ Dependency injection pattern
- ✅ Cleaner, more testable code
- ✅ Better error handling
- ✅ Improved logging and debugging
- ✅ Easier to add new agents
- ✅ Backward compatible (old files kept)

## Configuration & Environment Variables

All agents use these environment variables:

```bash
# Server Configuration
PORT=3000                           # Agent server port
COORDINATOR_URL=http://mcp-gateway:3001  # Coordinator endpoint

# Ollama Configuration
OLLAMA_URL=http://host.docker.internal:11434  # Ollama endpoint
AGENT_MODEL=llama3.2:3b            # Default model

# Optional
LOG_LEVEL=info                      # Log level (debug, info, warn, error)
```

## Best Practices

1. **Resource Management**
   - Use `ResourceManager` for cleaner registration
   - Organize resources by domain (e.g., `protocol://resource-type/...`)
   - Always include proper metadata (title, description, mimeType)

2. **Query Processing**
   - Use `QueryProcessor` for consistent Ollama interaction
   - Implement meaningful system prompts
   - Add thinking messages for better debugging
   - Handle errors gracefully

3. **Agent Design**
   - Implement `canHandle()` with meaningful confidence scores
   - Provide detailed capabilities
   - Implement domain-specific keywords
   - Keep query analysis logic in private methods (prefix with `_`)

4. **Error Handling**
   - Use logger for all errors
   - Provide meaningful error messages to users
   - Fail gracefully without crashing the server

5. **Logging**
   - Use appropriate log levels
   - Include context (agent name, operation, values)
   - Use emojis for quick visual identification

## Testing

### Health Check

```bash
curl http://localhost:3000/health
```

### List Resources

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"method": "resources/list", "id": 1}'
```

### Call Tool

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "process_query",
      "arguments": {"query": "your query here"}
    },
    "id": 1
  }'
```

## Troubleshooting

### Agent Not Registering with Coordinator

1. Check `COORDINATOR_URL` environment variable
2. Verify coordinator is running: `curl http://coordinator:3001/health`
3. Check logs for connection errors
4. Verify network connectivity between containers

### Query Processing Fails

1. Check Ollama is running: `curl http://host.docker.internal:11434/api/tags`
2. Verify model is available: `ollama list`
3. Check `OLLAMA_URL` environment variable
4. Review agent logs for specific errors

### Resources Not Listed

1. Verify `setupResources()` is called
2. Check `ResourceManager` is initialized
3. Review resource registration in `setupResources()`
4. Check logs for registration errors

## Future Improvements

- [ ] Database persistence layer
- [ ] Caching for frequently accessed resources
- [ ] Rate limiting and throttling
- [ ] Request validation schemas
- [ ] Agent versioning
- [ ] Plugin system for custom agents
- [ ] Monitoring and metrics
- [ ] Request/response tracing
