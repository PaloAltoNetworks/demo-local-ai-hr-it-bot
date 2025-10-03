import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import { randomUUID } from 'node:crypto';
import axios from 'axios';

/**
 * Base MCP Agent Server
 * Provides common functionality for all agent MCP servers
 */
class MCPAgentBase {
  constructor(agentName, agentDescription) {
    this.agentName = agentName;
    this.agentDescription = agentDescription;
    this.agentId = `${agentName}-agent-${randomUUID()}`;
    this.server = new McpServer(
      {
        name: `${agentName}-agent`,
        version: '1.0.0'
      }
    );
    
    this.ollamaService = null;
    this.dataService = null;
    this.streamThinkingCallback = null;
    this.initialized = false;
    this.coordinatorUrl = process.env.COORDINATOR_URL || 'http://mcp-gateway:3001';
    this.agentPort = process.env.PORT || 3000;
    this.registrationRetries = 0;
    this.maxRegistrationRetries = 5;
    this.heartbeatStarted = false;
    
    this.setupBaseHandlers();
  }

  /**
   * Check if coordinator is available
   */
  async checkCoordinatorAvailability() {
    try {
      await axios.get(`${this.coordinatorUrl}/health`, { timeout: 3000 });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Register this agent with the coordinator
   */
  async registerWithCoordinator() {
    // Check if coordinator is available first
    const isAvailable = await this.checkCoordinatorAvailability();
    if (!isAvailable) {
      throw new Error('Coordinator is not available');
    }

    const agentUrl = `http://${this.agentName}-mcp-server:${this.agentPort}`;
    
    const registrationData = {
      agentId: this.agentId,
      name: this.agentName,
      description: this.agentDescription,
      url: agentUrl,
      capabilities: this.getCapabilities()
    };

    console.log(`📝 [${this.agentName}] Registering with coordinator at ${this.coordinatorUrl}...`);
    console.log(`📝 [${this.agentName}] Registration data:`, JSON.stringify(registrationData, null, 2));

    try {
      const response = await axios.post(`${this.coordinatorUrl}/api/agents/register`, registrationData, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 200) {
        console.log(`✅ [${this.agentName}] Successfully registered with coordinator`);
        console.log(`✅ [${this.agentName}] Registration result:`, response.data);
        this.registrationRetries = 0;
        
        // Send periodic heartbeats to maintain registration (only start once)
        if (!this.heartbeatStarted) {
          this.startHeartbeat();
          this.heartbeatStarted = true;
        }
        
        return response.data;
      } else {
        throw new Error(`Registration failed with status: ${response.status}`);
      }
    } catch (error) {
      console.error(`❌ [${this.agentName}] Failed to register with coordinator:`, error.message);
      
      // Retry registration with backoff (unless it's just coordinator unavailability)
      if (error.message !== 'Coordinator is not available') {
        this.registrationRetries++;
      }
      
      if (this.registrationRetries <= this.maxRegistrationRetries) {
        const backoffDelay = Math.min(1000 * Math.pow(2, this.registrationRetries), 30000);
        console.log(`🔄 [${this.agentName}] Retrying registration in ${backoffDelay}ms (attempt ${this.registrationRetries}/${this.maxRegistrationRetries})`);
        
        setTimeout(() => {
          this.registerWithCoordinator();
        }, backoffDelay);
      } else {
        console.error(`💀 [${this.agentName}] Max registration retries exceeded. Agent will continue running and retry periodically.`);
        
        // Continue trying to register periodically even after max retries
        setTimeout(() => {
          console.log(`🔄 [${this.agentName}] Periodic registration retry...`);
          this.registrationRetries = 0; // Reset counter for periodic retries
          this.registerWithCoordinator();
        }, 60000); // Retry every minute
      }
      
      throw error;
    }
  }

  /**
   * Start sending periodic heartbeats to the coordinator
   */
  startHeartbeat() {
    let consecutiveFailures = 0;
    let isConnected = true;
    
    setInterval(async () => {
      try {
        // Send a simple health check to maintain registration
        await axios.get(`${this.coordinatorUrl}/health`, {
          timeout: 5000
        });
        
        // Reset failure count on successful heartbeat
        if (consecutiveFailures > 0) {
          console.log(`✅ [${this.agentName}] Reconnected to coordinator`);
          consecutiveFailures = 0;
          isConnected = true;
        }
        
      } catch (error) {
        consecutiveFailures++;
        
        if (isConnected) {
          console.warn(`⚠️ [${this.agentName}] Lost connection to coordinator: ${error.message}`);
          isConnected = false;
        }
        
        console.warn(`💔 [${this.agentName}] Heartbeat failed (${consecutiveFailures} consecutive failures): ${error.message}`);
        
        // Attempt re-registration after multiple failures
        if (consecutiveFailures >= 3) {
          console.log(`🔄 [${this.agentName}] Multiple heartbeat failures detected, attempting re-registration...`);
          
          // Reset registration retry counter to allow re-registration
          this.registrationRetries = 0;
          
          try {
            await this.registerWithCoordinator();
            consecutiveFailures = 0; // Reset on successful registration
          } catch (regError) {
            console.error(`❌ [${this.agentName}] Re-registration failed: ${regError.message}`);
          }
        }
      }
    }, 30000); // Send heartbeat every 30 seconds (more frequent)
  }

  /**
   * Unregister from coordinator on shutdown
   */
  async unregisterFromCoordinator() {
    console.log(`📤 [${this.agentName}] Unregistering from coordinator...`);
    
    try {
      const response = await axios.delete(`${this.coordinatorUrl}/api/agents/${this.agentId}`, {
        timeout: 5000
      });
      
      if (response.status === 200) {
        console.log(`✅ [${this.agentName}] Successfully unregistered from coordinator`);
      }
    } catch (error) {
      console.warn(`⚠️ [${this.agentName}] Failed to unregister from coordinator:`, error.message);
    }
  }

  /**
   * Set up base MCP handlers
   */
  setupBaseHandlers() {
    // Register resources that will be exposed to LLMs
    this.setupResources();
    
    // Register MCP protocol handlers
    this.setupMCPHandlers();
  }

  /**
   * Set up MCP protocol handlers (tools/list, tools/call, etc.)
   */
  setupMCPHandlers() {
    // Register each tool individually
    const tools = this.getTools();
    
    tools.forEach(tool => {
      console.log(`🔧 [${this.agentName}] Registering tool: ${tool.name}`);
      
      this.server.registerTool(tool.name, tool.description, tool.inputSchema, async (args) => {
        console.log(`🔧 [${this.agentName}] Executing tool: ${tool.name}`);
        console.log(`🔧 [${this.agentName}] Tool arguments:`, args);
        
        try {
          let result;
          
          switch (tool.name) {
            case 'process_query':
              result = await this.processQuery(args.query, args.context || {});
              break;
              
            case 'get_capabilities':
              result = this.getCapabilities();
              break;
              
            case 'health_check':
              result = await this.healthCheck();
              break;
              
            case 'can_handle':
              result = this.canHandle(args.query, args.context || {});
              break;
              
            default:
              throw new Error(`Unknown tool: ${tool.name}`);
          }
          
          console.log(`✅ [${this.agentName}] Tool ${tool.name} executed successfully`);
          return [{
            type: "text",
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
          }];
          
        } catch (error) {
          console.error(`❌ [${this.agentName}] Tool ${tool.name} execution failed:`, error.message);
          throw error;
        }
      });
    });

    console.log(`🔧 [${this.agentName}] ${tools.length} MCP tools registered:`, tools.map(t => t.name));
  }

  /**
   * Set up MCP resources - to be implemented by each agent
   */
  setupResources() {
    // Base implementation - each agent should override this
    console.log(`⚙️  [${this.agentName}] Setting up base resources`);
  }

  /**
   * Get list of registered resources
   */
  getResourcesList() {
    try {
      // Access the MCP server's resource registry to get the list of resources
      const resources = [];
      
      // Since resources are registered with registerResource, we need to extract them
      // For now, return a basic set that agents can override
      return this.getAvailableResources ? this.getAvailableResources() : [];
    } catch (error) {
      console.warn(`⚠️ [${this.agentName}] Failed to get resources list:`, error.message);
      return [];
    }
  }

  /**
   * Get available tools - to be implemented by each agent
   */
  getTools() {
    return [
      {
        name: 'process_query',
        description: `Process a query using the ${this.agentName} agent`,
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The query to process'
            },
            context: {
              type: 'object',
              description: 'Additional context for the query',
              properties: {
                language: { type: 'string', default: 'en' },
                userId: { type: 'string' },
                sessionId: { type: 'string' }
              }
            }
          },
          required: ['query']
        }
      },
      {
        name: 'get_capabilities',
        description: `Get the capabilities of the ${this.agentName} agent`,
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'health_check',
        description: `Check the health status of the ${this.agentName} agent`,
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'can_handle',
        description: `Check if the ${this.agentName} agent can handle a specific query`,
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The query to evaluate'
            },
            context: {
              type: 'object',
              description: 'Additional context'
            }
          },
          required: ['query']
        }
      }
    ];
  }

  /**
   * Handle tool calls - to be extended by each agent
   */
  async handleToolCall(name, args) {
    switch (name) {
      case 'process_query':
        return await this.processQuery(args.query, args.context || {});
      
      case 'get_capabilities':
        return {
          capabilities: this.getCapabilities(),
          metadata: this.getMetadata()
        };
      
      case 'health_check':
        return await this.healthCheck();
      
      case 'can_handle':
        return {
          confidence: this.canHandle(args.query, args.context || {}),
          agent: this.agentName
        };
      
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  /**
   * Initialize the agent - to be implemented by each agent
   */
  async initialize(services = {}) {
    this.ollamaService = services.ollamaService;
    this.dataService = services.dataService;
    this.initialized = true;
    console.log(`✅ [${this.agentName}] MCP Agent initialized`);
  }

  /**
   * Process query - to be implemented by each agent
   */
  async processQuery(query, context = {}) {
    throw new Error('processQuery must be implemented by agent');
  }

  /**
   * Get agent capabilities - to be implemented by each agent
   */
  getCapabilities() {
    throw new Error('getCapabilities must be implemented by agent');
  }

  /**
   * Get agent metadata - to be implemented by each agent
   */
  getMetadata() {
    return {
      name: this.agentName,
      displayName: `${this.agentName.charAt(0).toUpperCase() + this.agentName.slice(1)} Agent`,
      description: this.agentDescription,
      version: '1.0.0',
      category: 'Specialist',
      author: 'System',
      tags: [this.agentName]
    };
  }

  /**
   * Check if agent can handle query - to be implemented by each agent
   */
  canHandle(query, context = {}) {
    return 0; // Default: cannot handle
  }

  /**
   * Health check
   */
  async healthCheck() {
    return {
      name: this.agentName,
      status: this.initialized ? 'healthy' : 'not_initialized',
      initialized: this.initialized,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Set thinking callback
   */
  setThinkingCallback(callback) {
    this.streamThinkingCallback = callback;
  }

  /**
   * Send thinking message
   */
  sendThinkingMessage(message) {
    if (this.streamThinkingCallback) {
      this.streamThinkingCallback(`[${this.agentName.toUpperCase()}] ${message}`);
    }
  }

  /**
   * Start the MCP server with HTTP transport
   */
  async start() {
    const app = express();
    app.use(express.json());
    
    // Log all incoming requests
    app.use((req, res, next) => {
      console.log(`🌐 [${this.agentName}] ============ INCOMING REQUEST ============`);
      console.log(`🌐 [${this.agentName}] ${req.method} ${req.url}`);
      console.log(`🌐 [${this.agentName}] From: ${req.ip || req.connection.remoteAddress}`);
      console.log(`🌐 [${this.agentName}] User-Agent: ${req.headers['user-agent'] || 'N/A'}`);
      console.log(`🌐 [${this.agentName}] Content-Length: ${req.headers['content-length'] || 'N/A'}`);
      console.log(`🌐 [${this.agentName}] Timestamp: ${new Date().toISOString()}`);
      next();
    });

    // Map to store transports by session ID
    const transports = {};

    // Handle POST requests for client-to-server communication
    app.post('/mcp', async (req, res) => {
      console.log(`🔍 [${this.agentName}] ============ MCP POST REQUEST START ============`);
      console.log(`🔍 [${this.agentName}] Request received from: ${req.ip || req.connection.remoteAddress}`);
      console.log(`🔍 [${this.agentName}] User-Agent: ${req.headers['user-agent'] || 'N/A'}`);
      console.log(`🔍 [${this.agentName}] Content-Type: ${req.headers['content-type'] || 'N/A'}`);
      console.log(`🔍 [${this.agentName}] Session ID: ${req.headers['mcp-session-id'] || 'None'}`);
      console.log(`🔍 [${this.agentName}] Request method: ${req.body?.method || 'N/A'}`);
      console.log(`🔍 [${this.agentName}] Request ID: ${req.body?.id || 'N/A'}`);
      console.log(`🔍 [${this.agentName}] Full request body:`, JSON.stringify(req.body, null, 2));
      console.log(`🔍 [${this.agentName}] All headers:`, JSON.stringify(req.headers, null, 2));

      const sessionId = req.headers['mcp-session-id'];
      let transport;

      if (sessionId && transports[sessionId]) {
        // Reuse existing transport
        console.log(`🔄 [${this.agentName}] Reusing existing transport for session: ${sessionId}`);
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        console.log(`🚀 [${this.agentName}] Initialize request detected, creating new transport`);
        
        // New initialization request
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sessionId) => {
            console.log(`✅ [${this.agentName}] Session initialized: ${sessionId}`);
            // Store the transport by session ID
            transports[sessionId] = transport;
          }
        });

        console.log(`🔗 [${this.agentName}] Transport created, connecting to server...`);

        // Clean up transport when closed
        transport.onclose = () => {
          console.log(`🔌 [${this.agentName}] Transport closed for session: ${transport.sessionId}`);
          if (transport.sessionId) {
            delete transports[transport.sessionId];
          }
        };

        try {
          // Connect the MCP server to this transport
          console.log(`🤝 [${this.agentName}] Connecting server to transport...`);
          await this.server.connect(transport);
          console.log(`✅ [${this.agentName}] Server connected to transport successfully`);
        } catch (error) {
          console.error(`❌ [${this.agentName}] Failed to connect server to transport:`, error);
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: `Transport connection failed: ${error.message}`,
            },
            id: null,
          });
          return;
        }
      } else {
        // Invalid request
        console.log(`❌ [${this.agentName}] ============ INVALID REQUEST ============`);
        console.log(`❌ [${this.agentName}] Session ID provided: ${sessionId || 'None'}`);
        console.log(`❌ [${this.agentName}] Is initialize request: ${isInitializeRequest(req.body)}`);
        console.log(`❌ [${this.agentName}] Available sessions: ${Object.keys(transports).join(', ') || 'None'}`);
        console.log(`❌ [${this.agentName}] Request body method: ${req.body?.method || 'N/A'}`);
        console.log(`❌ [${this.agentName}] Sending 400 Bad Request response`);
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided',
          },
          id: null,
        });
        return;
      }

      // Only process the request if we have a valid transport
      if (!transport) {
        console.error(`❌ [${this.agentName}] No transport available for request`);
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Internal error: No transport available',
          },
          id: null,
        });
        return;
      }

      // Handle the request
      console.log(`🔄 [${this.agentName}] ============ PROCESSING REQUEST ============`);
      console.log(`🔄 [${this.agentName}] About to handle request with transport`);
      console.log(`🔄 [${this.agentName}] Transport session ID: ${transport.sessionId || 'Not set yet'}`);
      console.log(`� [${this.agentName}] Request method: ${req.body.method}`);
      console.log(`� [${this.agentName}] Request ID: ${req.body.id}`);
      console.log(`🔄 [${this.agentName}] Request params:`, JSON.stringify(req.body.params, null, 2));
      
      try {
        // BYPASS: Handle tools/call and resources/list directly since MCP SDK transport isn't calling registered handlers properly
        if (req.body.method === 'tools/call') {
          console.log(`🔧 [${this.agentName}] ⚡ BYPASSING MCP SDK - Handling tools/call directly`);
          const { name, arguments: toolArgs } = req.body.params;
          console.log(`🔧 [${this.agentName}] Tool name: ${name}`);
          console.log(`🔧 [${this.agentName}] Tool arguments:`, toolArgs);
          
          let result;
          switch (name) {
            case 'process_query':
              console.log(`🔧 [${this.agentName}] ⚡ Calling processQuery directly`);
              result = await this.processQuery(toolArgs.query, toolArgs.context || {});
              break;
            case 'get_capabilities':
              result = this.getCapabilities();
              break;
            case 'health_check':
              result = await this.healthCheck();
              break;
            case 'can_handle':
              result = this.canHandle(toolArgs.query, toolArgs.context || {});
              break;
            default:
              throw new Error(`Unknown tool: ${name}`);
          }
          
          console.log(`✅ [${this.agentName}] Tool executed successfully, result length:`, result?.length || 0);
          
          // Send SSE response for tools/call
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'mcp-session-id': transport.sessionId
          });
          
          const toolResponse = {
            jsonrpc: '2.0',
            id: req.body.id,
            result: {
              content: [{
                type: "text",
                text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
              }]
            }
          };
          
          res.write(`event: message\n`);
          res.write(`data: ${JSON.stringify(toolResponse)}\n\n`);
          res.end();
          console.log(`✅ [${this.agentName}] ============ DIRECT TOOL EXECUTION COMPLETED ============`);
          return;
        } else if (req.body.method === 'resources/list') {
          console.log(`📋 [${this.agentName}] ⚡ BYPASSING MCP SDK - Handling resources/list directly`);
          
          // Get the list of resources from the server's resource registry
          const resources = this.getResourcesList();
          console.log(`📋 [${this.agentName}] Found ${resources.length} registered resources`);
          
          // Send SSE response for resources/list
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'mcp-session-id': transport.sessionId
          });
          
          const resourceResponse = {
            jsonrpc: '2.0',
            id: req.body.id,
            result: {
              resources: resources
            }
          };
          
          res.write(`event: message\n`);
          res.write(`data: ${JSON.stringify(resourceResponse)}\n\n`);
          res.end();
          console.log(`✅ [${this.agentName}] ============ RESOURCES LIST COMPLETED SUCCESSFULLY ============`);
          return;
        }
        
        console.log(`⚡ [${this.agentName}] Calling transport.handleRequest...`);
        await transport.handleRequest(req, res, req.body);
        console.log(`✅ [${this.agentName}] ============ REQUEST COMPLETED SUCCESSFULLY ============`);
      } catch (error) {
        console.error(`❌ [${this.agentName}] ============ REQUEST FAILED ============`);
        console.error(`❌ [${this.agentName}] Error handling request:`, error.message);
        console.error(`❌ [${this.agentName}] Error stack:`, error.stack);
        console.error(`❌ [${this.agentName}] Transport state:`, {
          sessionId: transport.sessionId,
          closed: transport.closed
        });
        if (!res.headersSent) {
          console.log(`📤 [${this.agentName}] Sending error response to client`);
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: `Request handling failed: ${error.message}`,
            },
            id: null,
          });
        } else {
          console.log(`⚠️ [${this.agentName}] Headers already sent, cannot send error response`);
        }
      }
    });

    // Reusable handler for GET and DELETE requests
    const handleSessionRequest = async (req, res) => {
      const sessionId = req.headers['mcp-session-id'];
      if (!sessionId || !transports[sessionId]) {
        res.status(400).send('Invalid or missing session ID');
        return;
      }
      
      const transport = transports[sessionId];
      await transport.handleRequest(req, res);
    };

    // Handle GET requests for server-to-client notifications via SSE
    app.get('/mcp', handleSessionRequest);

    // Handle DELETE requests for session termination
    app.delete('/mcp', handleSessionRequest);

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        agent: this.agentName,
        agentId: this.agentId,
        capabilities: this.getCapabilities(),
        timestamp: new Date().toISOString()
      });
    });

    // Start the HTTP server
    const port = this.agentPort;
    app.listen(port, async () => {
      console.log(`🚀 [${this.agentName}] MCP HTTP Server started on port ${port}`);
      console.log(`📊 [${this.agentName}] Resources registered and ready`);
      
      // Wait a bit for the server to be fully ready, then register with coordinator
      setTimeout(async () => {
        try {
          await this.registerWithCoordinator();
        } catch (error) {
          console.warn(`⚠️ [${this.agentName}] Initial registration failed, will retry automatically`);
        }
      }, 2000); // Wait 2 seconds before attempting registration
    });

    // Handle graceful shutdown
    process.on('SIGTERM', async () => {
      console.log(`🛑 [${this.agentName}] Received SIGTERM, shutting down gracefully...`);
      await this.unregisterFromCoordinator();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      console.log(`🛑 [${this.agentName}] Received SIGINT, shutting down gracefully...`);
      await this.unregisterFromCoordinator();
      process.exit(0);
    });
  }

  /**
   * Cleanup
   */
  async cleanup() {
    console.log(`🧹 [${this.agentName}] Cleaning up MCP agent`);
    
    // Unregister from coordinator
    await this.unregisterFromCoordinator();
    
    this.initialized = false;
  }
}

export { MCPAgentBase };