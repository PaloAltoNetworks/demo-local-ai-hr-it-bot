/**
 * HTTP transport and session management for MCP servers
 */
import express from 'express';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'node:crypto';
import { getLogger } from '../../utils/index.js';

class MCPTransportManager {
  constructor(agentName, mcpServer) {
    this.agentName = agentName;
    this.mcpServer = mcpServer;
    this.logger = getLogger();
    this.transports = {};
  }

  /**
   * Create and setup Express app with MCP handlers
   */
  createApp() {
    const app = express();
    app.use(express.json({ limit: '50mb' }));

    // Request logging middleware
    app.use((req, res, next) => {
      this.logger.debug(`${req.method} ${req.url}`);
      next();
    });

    // MCP endpoint handler
    app.post('/mcp', async (req, res) => {
      try {
        await this._handleMCPRequest(req, res);
      } catch (error) {
        this.logger.error('MCP request handling failed', error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: `Request handling failed: ${error.message}`
            },
            id: null
          });
        }
      }
    });

    // GET and DELETE handlers for session management
    const handleSessionRequest = async (req, res) => {
      const sessionId = req.headers['mcp-session-id'];
      if (!sessionId || !this.transports[sessionId]) {
        res.status(400).send('Invalid or missing session ID');
        return;
      }

      const transport = this.transports[sessionId];
      await transport.handleRequest(req, res);
    };

    app.get('/mcp', handleSessionRequest);
    app.delete('/mcp', handleSessionRequest);

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        agent: this.agentName,
        timestamp: new Date().toISOString()
      });
    });

    return app;
  }

  /**
   * Handle MCP request (POST)
   */
  async _handleMCPRequest(req, res) {
    const sessionId = req.headers['mcp-session-id'];
    let transport = null;

    // Reuse existing transport or create new one
    if (sessionId && this.transports[sessionId]) {
      this.logger.debug(`Reusing existing transport for session: ${sessionId}`);
      transport = this.transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      this.logger.debug('Initialize request detected, creating new transport');
      transport = await this._createNewTransport();
    } else {
      this.logger.error('Invalid request: No valid session or not an initialize request');
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: Invalid session or request type'
        },
        id: null
      });
      return;
    }

    if (!transport) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Internal error: No transport available'
        },
        id: null
      });
      return;
    }

    // Handle specific request types with bypass for SDK issues
    if (req.body.method === 'tools/call') {
      await this._handleToolCall(req, res, transport);
      return;
    }

    if (req.body.method === 'resources/list') {
      await this._handleResourcesList(req, res, transport);
      return;
    }

    if (req.body.method === 'resources/read') {
      await this._handleResourceRead(req, res, transport);
      return;
    }

    // Standard MCP transport handling
    await transport.handleRequest(req, res, req.body);
    this.logger.debug('✓ Request completed successfully');
  }

  /**
   * Create a new transport
   */
  async _createNewTransport() {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        this.logger.debug(`Session initialized: ${sessionId}`);
        this.transports[sessionId] = transport;
      }
    });

    transport.onclose = () => {
      this.logger.debug(`Transport closed for session: ${transport.sessionId}`);
      if (transport.sessionId) {
        delete this.transports[transport.sessionId];
      }
    };

    try {
      await this.mcpServer.connect(transport);
      this.logger.debug('Server connected to transport');
    } catch (error) {
      this.logger.error('Failed to connect server to transport', error);
      throw error;
    }

    return transport;
  }

  /**
   * Handle tool/call request
   */
  async _handleToolCall(req, res, transport) {
    this.logger.debug('Handling tools/call request');
    const { name, arguments: toolArgs } = req.body.params;

    try {
      let result;
      switch (name) {
        case 'process_query':
          result = await this.mcpServer.agent.processQuery(
            toolArgs.query,
            toolArgs.context || {}
          );
          break;
        case 'get_capabilities':
          result = this.mcpServer.agent.getCapabilities();
          break;
        case 'health_check':
          result = await this.mcpServer.agent.healthCheck();
          break;
        case 'can_handle':
          result = this.mcpServer.agent.canHandle(toolArgs.query, toolArgs.context || {});
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      this.logger.debug(`Tool ${name} executed successfully`);
      this._sendSSEResponse(res, transport.sessionId, req.body.id, {
        content: [
          {
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
          }
        ]
      });
    } catch (error) {
      this.logger.error(`Tool ${name} execution failed`, error);
      throw error;
    }
  }

  /**
   * Handle resources/list request
   */
  async _handleResourcesList(req, res, transport) {
    this.logger.debug('Handling resources/list request');

    try {
      const resources = this.mcpServer.agent.getResourcesList();
      this.logger.debug(`Found ${resources.length} registered resources`);

      this._sendSSEResponse(res, transport.sessionId, req.body.id, {
        resources
      });
    } catch (error) {
      this.logger.error('Failed to list resources', error);
      throw error;
    }
  }

  /**
   * Handle resources/read request
   */
  async _handleResourceRead(req, res, transport) {
    this.logger.debug('Handling resources/read request');

    try {
      const { uri } = req.body.params;

      // Access the registered resources from the MCP server
      const agent = this.mcpServer.agent;
      const urlObj = new URL(uri);
      
      this.logger.debug(`Agent: ${!!agent}, ResourceManager: ${agent ? !!agent.resourceManager : 'N/A'}`);
      
      // Get handler from the agent's resource manager
      if (!agent) {
        throw new Error('Agent not found on MCP server');
      }
      
      if (!agent.resourceManager) {
        throw new Error('Resource manager not available on agent');
      }

      const handler = agent.resourceManager.getHandler(uri);
      if (!handler) {
        throw new Error(`Resource not found: ${uri}`);
      }

      // Call the handler to get resource content
      const resourceContent = await handler(urlObj);

      this._sendSSEResponse(res, transport.sessionId, req.body.id, {
        contents: resourceContent.contents || []
      });
    } catch (error) {
      this.logger.error('Failed to read resource', error);
      // Send error response
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'mcp-session-id': transport.sessionId
      });
      const response = {
        jsonrpc: '2.0',
        id: req.body.id,
        error: {
          code: -32603,
          message: `Failed to read resource: ${error.message}`
        }
      };
      res.write(`event: message\n`);
      res.write(`data: ${JSON.stringify(response)}\n\n`);
      res.end();
    }
  }

  /**
   * Find resource handler from the MCP server's internal registry
   * The SDK stores handlers, we need to retrieve them
   */
  _findResourceHandler(uri) {
    // The McpServer stores handlers in a private property
    // We try to access them through the server's internal structure
    if (this.mcpServer._resourceHandlers) {
      return this.mcpServer._resourceHandlers.get(uri);
    }
    
    // Alternative: search through the server's handlers
    if (this.mcpServer.handlers && this.mcpServer.handlers.resource) {
      return this.mcpServer.handlers.resource.get(uri);
    }
    
    return null;
  }

  /**
   * Check if URI matches a template pattern
   */
  _uriMatchesTemplate(template, uri) {
    if (template === uri) return true;
    
    // Simple template matching for patterns like "hr://employees/{employeeId}/profile"
    const regexPattern = template
      .replace(/\{[^}]+\}/g, '[^/]+');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(uri);
  }



  /**
   * Send SSE response
   */
  _sendSSEResponse(res, sessionId, requestId, result) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'mcp-session-id': sessionId
    });

    const response = {
      jsonrpc: '2.0',
      id: requestId,
      result
    };

    res.write(`event: message\n`);
    res.write(`data: ${JSON.stringify(response)}\n\n`);
    res.end();
  }
}

export { MCPTransportManager };
