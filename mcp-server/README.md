# MCP Server - Agent Architecture

## Quick Overview

The MCP server hosts specialized AI agents. Each agent is **self-contained in its own folder** with a simple structure:

```
mcp-server/
├── shared/                    # Shared utilities (base class, logger, etc.)
├── hr-mcp-server/             # HR agent (employee queries)
├── it-mcp-server/             # IT agent (support tickets)
├── general-mcp-server/        # General agent (policies, navigation)
├── Dockerfile.agent           # Build any agent
└── README.md
```

## Agent Structure (Simple & Scalable)

Each agent folder contains **5 key files**:

```
hr-mcp-server/
├── config.js              # Agent name, keywords, LLM settings
├── prompt.txt             # System prompt (plain text)
├── service.js             # Data handling (CSV, DB, API)
├── agent.js               # Tools and resources definitions
├── server.js              # Entry point (~20 lines)
├── employees.csv          # Data source (specific to agent)
└── package.json
```

**Each file has ONE clear purpose:**
- `config.js` → What the agent does, LLM parameters
- `prompt.txt` → How the agent thinks/responds
- `service.js` → Where/how to get data
- `agent.js` → What tools/resources are available
- `server.js` → Start the agent

## Creating Your Own Agent (Fast Track)

### 1. Copy an existing agent
```bash
cp -r hr-mcp-server your-new-agent-mcp-server
cd your-new-agent-mcp-server
```

### 2. Update `config.js`
```javascript
export const config = {
  name: 'your-agent',
  description: 'What this agent does',
  
  llm: {
    model: 'llama3.2:3b',
    temperature: 0.3,
    maxTokens: 2000
  },
  
  keywords: ['keyword1', 'keyword2', 'keyword3'],
  
  capabilities: [
    'What it can do #1',
    'What it can do #2'
  ]
};
```

### 3. Rewrite `prompt.txt`
```
You are a [YOUR AGENT TYPE] specialist.

Your role:
- Do this
- Do that
- Never do this

Important rules:
- Only use provided data
- Be helpful and professional
```

### 4. Update `service.js` (data handling)
Replace `HRService` with your data source. Examples:
- **CSV file** → Parse employees.csv
- **Database** → Query SQLite/SQL
- **API** → Fetch from HTTP endpoint
- **File system** → Read JSON/text files

### 5. Define tools in `agent.js`
```javascript
export async function setupAgent(agent, service) {
  agent.getTools = function() {
    return [
      {
        name: 'my_tool',
        description: 'What it does',
        inputSchema: { /* JSON schema */ },
        handler: async (args) => {
          // Use service to get data
          return await service.getData(args.query);
        }
      }
    ];
  };
}
```

### 6. Add to docker-compose.yml
```yaml
  your-new-agent-mcp-server:
    build:
      context: .
      dockerfile: mcp-server/Dockerfile.agent
      args:
        AGENT_NAME: your-new-agent
    hostname: your-new-agent-mcp-server
    ports:
      - "3006:3000"
    env_file:
      - ./.env
    depends_on:
      - mcp-gateway
    networks:
      - mcp-network
```

### 7. Build and test
```bash
docker-compose up your-new-agent-mcp-server
```

## File Reference

### config.js
Agent metadata and LLM parameters. Change these to customize behavior:
- `name` - Agent identifier
- `keywords` - Used to detect if agent should handle query
- `llm.temperature` - Higher = more creative, lower = more focused
- `capabilities` - Describe what agent does

### prompt.txt
System prompt for the LLM. Define the agent's personality, rules, and behavior here.

### service.js
**Data layer** - Handles loading and querying your data source:
- CSV files → `HRService` (parse CSV)
- Databases → `ITService` (query SQLite)
- APIs → Create similar service class
- Files → Load JSON/text

Replace the implementation to match your data source.

### agent.js
**Define agent capabilities**:
- `setupAgent()` - Load prompt, define resources
- `getTools()` - Return array of available tools
- Tools define what the agent can do

### server.js
**Just initialize and start** - Don't modify unless necessary.
- Loads config
- Initializes service
- Calls `setupAgent()`
- Starts HTTP server

## How It Works (For Curious Developers)

### Agent Lifecycle

1. **Startup** → `server.js` creates agent instance
2. **Initialization** → Load config, data (service), prompt
3. **Registration** → Tell coordinator "I'm ready to handle queries"
4. **Receive queries** → User asks question through gateway
5. **Route** → Coordinator checks agent keywords, sends to matching agent
6. **Process** → Agent uses prompt + data to answer with LLM
7. **Respond** → Send answer back through gateway to user

### Adding Tools

Each agent can expose tools (callable functions). Example:

```javascript
// In agent.js getTools()
{
  name: 'search_employees',
  description: 'Search employees by name or email',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' }
    }
  },
  handler: async (args) => {
    // Use service to get data
    return await service.searchEmployees(args.query);
  }
}
```

The LLM can call this tool when needed.

### LLM Parameters Explained

- **temperature: 0.3** → Focused, consistent answers (good for HR/IT)
- **temperature: 0.7+** → Creative, varied answers
- **maxTokens: 2000** → Max response length
- **topP: 0.9** → Diversity in token selection

For factual domains (HR, IT), use low temperature. Adjust based on testing.

## Shared Infrastructure (Don't Worry About These)

- `shared/mcp-agent-base.js` - Base class all agents extend
- `shared/utils/logger.js` - Logging across agents
- `shared/utils/coordinator-client.js` - Register with gateway
- `shared/utils/query-processor.js` - Call LLM
- `shared/utils/resource-manager.js` - Register resources
- `shared/utils/transport-manager.js` - HTTP transport

## Quick Commands

```bash
# Build specific agent
docker-compose build hr-mcp-server

# Run single agent (for testing)
docker-compose up hr-mcp-server

# View logs
docker-compose logs -f hr-mcp-server

# Stop agent
docker-compose down hr-mcp-server
```

## Common Tasks

### Change agent behavior
→ Edit `prompt.txt`

### Add new capability
→ Add tool in `agent.js`

### Change data source
→ Rewrite `service.js`

### Adjust LLM response
→ Change `temperature` in `config.js`

### Use different model
→ Change `model` in `config.js`
