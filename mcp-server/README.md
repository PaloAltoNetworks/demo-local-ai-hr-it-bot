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

Each agent folder contains **4 key files**:

```
hr-mcp-server/
├── config.js              # Agent name, keywords, LLM settings, system prompt
├── service.js             # Data handling (CSV, DB, API)
├── server.js              # Agent initialization and MCP resources (~150 lines)
├── employees.csv          # Data source (specific to agent)
└── package.json
```

**Each file has ONE clear purpose:**
- `config.js` → Agent metadata, keywords, capabilities, LLM parameters, system prompt
- `service.js` → Load and query data sources (CSV, DB, API)
- `server.js` → Initialize agent, setup MCP resources, define resource handlers
- `package.json` → Agent dependencies

## Existing Agents

The system comes with three pre-built agents:

### HR Agent (`hr-mcp-server`)
Handles employee-related queries:
- Employee directory and contact information
- Organizational structure and reporting relationships
- Leave/PTO management
- Salary and compensation (with appropriate discretion)
- HR policies and procedures

**Data source:** `employees.csv` (structured employee records)
**Key methods:** `searchEmployees()`, `getEmployeeByEmail()`, `getAllEmployees()`

### IT Agent (`it-mcp-server`)
Handles technical support and ticketing:
- IT support tickets and status tracking
- Technical issue diagnosis
- System and hardware problems
- Access control and permissions
- Ticket discussion history and resolution tracking

**Data source:** SQLite database (initialized in `database-manager.js`)
**Key methods:** `getAllTickets()`, `getTicketById()`, `getTicketDiscussions()`

### General Agent (`general-mcp-server`)
Handles workplace policies and general queries:
- Company policies and procedures
- Office information and facilities
- General navigation and guidance
- Routing to appropriate specialists

**Data source:** Built-in policies in `service.js`
**Key methods:** `getPolicies()`, `searchPolicies()`

## Creating Your Own Agent (Fast Track)

### 1. Copy an existing agent
```bash
cp -r hr-mcp-server your-new-agent-mcp-server
cd your-new-agent-mcp-server
```

### 2. Update `config.js`
The config file now contains everything your agent needs:

```javascript
export const config = {
  name: 'your-agent',
  description: 'What this agent does',
  
  capabilities: [
    'What it can do #1',
    'What it can do #2'
  ],

  llm: {
    model: 'llama3.2:3b',
    temperature: 0.3,
    maxTokens: 2000
  },

  keywords: ['keyword1', 'keyword2', 'keyword3'],

  prompt: `You are a [YOUR AGENT TYPE] specialist.

Your role:
- Do this
- Do that
- Never do this

Important rules:
- Only use provided data
- Be helpful and professional`
};
```

### 3. Create `service.js` (data handling)
Replace `HRService` with your data source. Examples:

```javascript
export class YourService {
  constructor() {
    // Initialize data
  }

  async init() {
    // Load data from CSV, DB, API, etc.
  }

  // Methods to query/process your data
  async searchData(query) {
    // Return matching results
  }

  getAllData() {
    // Return all available data
  }
}
```

Data source examples:
- **CSV file** → Parse and return structured data
- **Database** → Query SQLite/SQL
- **API** → Fetch from HTTP endpoint
- **File system** → Read JSON/text files

### 4. Update `server.js` (agent initialization)
The server.js handles agent setup and MCP resource registration:

```javascript
import { MCPAgentBase } from './shared/mcp-agent-base.js';
import { QueryProcessor } from './shared/query-processor.js';
import { YourService } from './service.js';
import { config } from './config.js';

class YourAgent extends MCPAgentBase {
  constructor() {
    super(config.name, config.description);
    this.queryProcessor = new QueryProcessor(this.agentName);
  }

  async createService() {
    const service = new YourService();
    await service.init();
    return service;
  }

  async setupResources() {
    // Register MCP resources here
    // Resources are templates that the gateway can query
  }

  getCapabilities() {
    return config.capabilities;
  }

  canHandle(query) {
    const keywords = config.keywords;
    const queryLower = query.toLowerCase();
    let score = 0;
    keywords.forEach((keyword) => {
      if (queryLower.includes(keyword.toLowerCase())) {
        score += 15;
      }
    });
    return Math.min(score, 100);
  }

  async processQuery(query) {
    // Use service and LLM to process the query
    const data = this.service.getAllData();
    const fullPrompt = `${config.prompt}\n\nData: ${data}\n\nQuestion: ${query}`;
    return await this.queryProcessor.processWithModel(fullPrompt, query);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const agent = new YourAgent();
  agent.start().catch(error => {
    console.error('❌ Failed to start Your Agent:', error);
    process.exit(1);
  });
}
```

### 5. Add to docker-compose.yml
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

### 6. Build and test
```bash
docker-compose up your-new-agent-mcp-server
```

## File Reference

### config.js
All agent metadata and behavior in one place:
- `name` - Agent identifier (used in coordination)
- `description` - What agent does
- `keywords` - Used to detect if agent should handle query
- `capabilities` - List of things agent can do
- `llm.temperature` - Higher = more creative, lower = more focused (0.3 recommended for factual)
- `llm.model` - Which LLM model to use
- `llm.maxTokens` - Maximum response length
- `prompt` - System prompt defining agent behavior and rules

### service.js
**Data layer** - Handles loading and querying your data source:
- Load data (CSV, database, API, files)
- Parse and structure the data
- Provide query/search methods
- Return data to the agent for processing

Examples:
- CSV files → Parse CSV into objects
- Databases → Query SQLite with SQL
- APIs → Fetch and format API responses
- JSON files → Load and parse JSON

### server.js
**Agent orchestration** - Initializes agent and registers MCP resources:
- Extends `MCPAgentBase` (base class with common functionality)
- `createService()` - Create and initialize your data service
- `setupResources()` - Register MCP resources (optional)
- `getCapabilities()` - Return list of agent capabilities
- `canHandle()` - Score how well agent matches a query (0-100)
- `processQuery()` - Use service + LLM to answer questions

The `server.js` is about 150 lines and handles:
- Service initialization
- MCP resource registration
- Query routing to LLM
- Response formatting

## How It Works (For Curious Developers)

### Agent Architecture

The refactored architecture separates concerns clearly:

1. **config.js** - Configuration (metadata, LLM params, system prompt)
2. **service.js** - Data layer (load/query data sources)
3. **server.js** - Orchestration (agent logic, MCP resources)
4. **Base class** - Common functionality in `MCPAgentBase`

This separation makes agents easy to understand, test, and extend.

### Agent Lifecycle

1. **Startup** → `server.js` creates agent instance
2. **Initialization** → 
   - Service loads data (CSV, DB, API)
   - ResourceManager created for MCP resources
   - Resources registered (templates agents expose)
3. **Registration** → Tell coordinator "I'm ready to handle queries"
4. **Receive queries** → User asks question through gateway
5. **Route** → Coordinator checks agent keywords, sends to matching agent
6. **Process** → 
   - Call `canHandle()` to see if agent matches
   - Get data from `service`
   - Build prompt with config + data + query
   - Call LLM to generate response
7. **Respond** → Send answer back through gateway to user

### MCP Resources

Resources are templates that expose agent capabilities to the gateway:

```javascript
async setupResources() {
  // Static resource - always available
  this.resourceManager.registerStaticResource(
    'policies',
    'general://policies',
    { title: 'Policies', mimeType: 'text/plain' },
    async (uri) => ({
      contents: [{ uri: uri.href, text: this.service.getPolicies() }]
    })
  );

  // Template resource - with parameters
  this.resourceManager.registerTemplateResource(
    'query',
    { uri: 'hr://query{?q*}', params: {} },
    { title: 'Query', mimeType: 'text/plain' },
    async (uri) => {
      const query = new URL(uri.href).searchParams.get('q');
      const response = await this.processQuery(query);
      return {
        contents: [{ uri: uri.href, text: response }]
      };
    }
  );
}
```

The gateway can list and read these resources, enabling:
- Discovery of agent capabilities
- Direct data access for complex queries
- Session-based interactions

### LLM Parameters Explained

- **temperature: 0.3** → Focused, consistent answers (good for HR/IT)
- **temperature: 0.7+** → Creative, varied answers
- **maxTokens: 2000** → Max response length
- **topP: 0.9** → Diversity in token selection

For factual domains (HR, IT), use low temperature. Adjust based on testing.

## Shared Infrastructure (Common to All Agents)

These are shared utilities in `shared/` that all agents use:

### Core Base Class
- **mcp-agent-base.js** - Base class all agents extend
  - Handles initialization lifecycle
  - Resource manager integration
  - Coordinator registration
  - MCP transport management
  - Health checks

### Utilities (`shared/utils/`)
- **logger.js** - Centralized logging across agents
- **coordinator-client.js** - Register agents with gateway
- **query-processor.js** - Call LLM for query processing
- **resource-manager.js** - Register and manage MCP resources
- **transport-manager.js** - HTTP transport and session management
- **config.js** - Global configuration loader
- **llm-provider.js** - LLM provider abstraction

These utilities handle the infrastructure so agents focus on business logic.

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

### Change agent behavior/system prompt
→ Edit `config.js` - update the `prompt` field

### Adjust LLM response style
→ Edit `config.js` - change `temperature` (0.3 = focused, 0.7+ = creative)

### Use different LLM model
→ Edit `config.js` - change `llm.model` field

### Change what triggers an agent
→ Edit `config.js` - add/remove `keywords` and adjust `canHandle()` scoring in `server.js`

### Add new capability/data source
→ Update `service.js` - add new data loading or query methods

### Register new MCP resource
→ Update `server.js` - add `registerStaticResource()` or `registerTemplateResource()` in `setupResources()`

### Debug agent behavior
→ Check logs: `docker-compose logs -f hr-mcp-server`
→ Add console.log or logger calls in `server.js` or `service.js`
