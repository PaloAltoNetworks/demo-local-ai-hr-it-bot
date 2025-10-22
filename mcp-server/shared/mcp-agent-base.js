/**
 * Refactored Base MCP Agent Server with modular architecture
 * Provides common functionality for all agent MCP servers
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { randomUUID } from 'node:crypto';
import { Logger } from './utils/logger.js';
import { ConfigManager } from './utils/config.js';
import { CoordinatorClient } from './utils/coordinator-client.js';
import { MCPTransportManager } from './utils/transport-manager.js';

class MCPAgentBase {
  constructor(agentName, agentDescription) {
    this.agentName = agentName;
    this.agentDescription = agentDescription;
    this.agentId = `${agentName}-agent-${randomUUID()}`;

    // Initialize utilities
    this.logger = new Logger(agentName);
    this.config = ConfigManager.getConfig();

    // MCP Server setup
    this.server = new McpServer({
      name: `${agentName}-agent`,
      version: '1.0.0'
    });

    // Assign reference for transport manager
    this.server.agent = this;

    // Coordinator client
    this.coordinatorClient = new CoordinatorClient(
      agentName,
      this.agentId,
      agentDescription
    );

    // Transport manager
    this.transportManager = null;

    // Internal state
    this.initialized = false;
    this.streamThinkingCallback = null;
  }

  /**
   * Setup base handlers (resources and tools)
   */
  setupBaseHandlers() {
    this.logger.info('Setting up base handlers');
    this.setupResources();
    this.setupMCPHandlers();
  }

  /**
   * Setup MCP protocol handlers (tools/list, tools/call, etc.)
   */
  setupMCPHandlers() {
    const tools = this.getTools();

    tools.forEach((tool) => {
      this.logger.debug(`Registering tool: ${tool.name}`);

      this.server.registerTool(
        tool.name,
        tool.description,
        tool.inputSchema,
        async (args) => {
          this.logger.debug(`Executing tool: ${tool.name}`, args);

          try {
            const result = await this.handleToolCall(tool.name, args);
            this.logger.success(`Tool ${tool.name} executed`);

            return [
              {
                type: 'text',
                text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
              }
            ];
          } catch (error) {
            this.logger.error(`Tool ${tool.name} execution failed`, error);
            throw error;
          }
        }
      );
    });

    this.logger.success(`${tools.length} MCP tools registered`);
  }

  /**
   * Setup MCP resources - to be implemented by each agent
   */
  setupResources() {
    this.logger.debug('Setting up base resources');
  }

  /**
   * Get list of registered resources
   */
  getResourcesList() {
    try {
      return this.getAvailableResources ? this.getAvailableResources() : [];
    } catch (error) {
      this.logger.warn('Failed to get resources list', error);
      return [];
    }
  }

  /**
   * Get available tools
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
   * Handle tool calls
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
   * Abstract methods to be implemented by subclasses
   */
  async processQuery(query, context = {}) {
    throw new Error('processQuery must be implemented by agent');
  }

  getCapabilities() {
    throw new Error('getCapabilities must be implemented by agent');
  }

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

  canHandle(query, context = {}) {
    return 0;
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
    this.logger.divider(`Starting ${this.agentName.toUpperCase()} Agent`);

    try {
      // Setup base handlers
      this.setupBaseHandlers();
      this.initialized = true;

      // Create transport manager
      this.transportManager = new MCPTransportManager(this.agentName, this.server);

      // Create Express app
      const app = this.transportManager.createApp();

      // Start HTTP server
      const port = this.config.agent.port;
      await new Promise((resolve) => {
        app.listen(port, () => {
          this.logger.success(`MCP HTTP Server started on port ${port}`);
          this.logger.info('Resources registered and ready');
          resolve();
        });
      });

      // Register with coordinator after a brief delay
      setTimeout(async () => {
        try {
          await this._registerWithCoordinator();
        } catch (error) {
          this.logger.warn('Initial registration failed, will retry automatically');
        }
      }, 2000);

      // Setup graceful shutdown
      this._setupGracefulShutdown();
    } catch (error) {
      this.logger.error('Failed to start agent', error);
      process.exit(1);
    }
  }

  /**
   * Register with coordinator (with retries)
   */
  async _registerWithCoordinator() {
    const agentUrl = `http://${this.agentName}-mcp-server:${this.config.agent.port}`;

    try {
      await this.coordinatorClient.register(agentUrl, this.getCapabilities());
      this.logger.success('Agent registered with coordinator');

      // Start heartbeat to maintain registration
      this.coordinatorClient.startHeartbeat(
        () => this._registerWithCoordinator()
      );
    } catch (error) {
      this.logger.error('Registration failed', error);
      this.coordinatorClient.retryRegistration(() => this._registerWithCoordinator());
    }
  }

  /**
   * Setup graceful shutdown handlers
   */
  _setupGracefulShutdown() {
    const shutdown = async (signal) => {
      this.logger.info(`Received ${signal}, shutting down gracefully...`);
      await this.coordinatorClient.unregister();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  /**
   * Cleanup
   */
  async cleanup() {
    this.logger.info('Cleaning up agent');
    await this.coordinatorClient.unregister();
    this.initialized = false;
  }
}

export { MCPAgentBase };
