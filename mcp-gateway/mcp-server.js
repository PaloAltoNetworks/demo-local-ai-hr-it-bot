import express from 'express';
import cors from 'cors';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import { getLogger } from './utils/logger.js';
import { initializeLogger } from './utils/logger.js';
import { initializeI18n } from './utils/i18n.js';

dotenv.config();

// Initialize logger
initializeLogger('mcp-gateway');

/**
 * MCP Server Implementation - Following MCP Specification 2025-06-18
 * Implements JSON-RPC 2.0 over HTTP transport
 * 
 * RESPONSIBILITY: Handle ONLY MCP protocol communication
 * - JSON-RPC 2.0 request/response handling
 * - Session management  
 * - Protocol validation
 * - Message forwarding to Coordinator for routing decisions
 * 
 * DOES NOT: Make routing, security, or intelligence decisions
 */
class MCPServer {
  constructor() {
    this.protocolVersion = '2025-06-18';
    this.serverInfo = {
      name: 'mcp-gateway-server',
      version: '1.0.0',
      description: 'MCP Gateway Server - Protocol handler for MCP communication'
    };
    
    // Server capabilities
    this.capabilities = {
      tools: {
        listChanged: true
      },
      resources: {
        subscribe: true,
        listChanged: true
      },
      prompts: {
        listChanged: true
      },
      logging: {}
    };

    // Session management (MCP protocol requirement)
    this.sessions = new Map(); // sessionId -> { clientInfo, createdAt, lastAccess }
  }

  /**
   * Create a new MCP session
   */
  createSession(clientInfo) {
    const sessionId = randomUUID();
    this.sessions.set(sessionId, {
      clientInfo,
      createdAt: Date.now(),
      lastAccess: Date.now()
    });
    getLogger().debug(`[MCPServer] Created session ${sessionId} for client: ${clientInfo?.name}`);
    return sessionId;
  }

  /**
   * Validate and update session
   */
  validateSession(sessionId) {
    if (!sessionId || !this.sessions.has(sessionId)) {
      return false;
    }
    const session = this.sessions.get(sessionId);
    session.lastAccess = Date.now();
    return true;
  }

  /**
   * Handle JSON-RPC 2.0 requests
   * This is the main protocol handler
   */
  async handleRequest(jsonRpcRequest, sessionId = null) {
    const { id, method, params } = jsonRpcRequest;

    try {
      getLogger().debug(`[MCPServer] Handling request: ${method} (ID: ${id})`);

      // Session validation for non-initialize requests
      if (method !== 'initialize' && sessionId && !this.validateSession(sessionId)) {
        throw {
          code: -32001,
          message: 'Invalid session',
          data: { sessionId }
        };
      }

      switch (method) {
        case 'initialize':
          return await this.handleInitialize(params);
        case 'tools/list':
          return await this.handleListTools(params);
        case 'resources/list':
          return await this.handleListResources(params);
        case 'prompts/list':
          return await this.handleListPrompts(params);
        case 'ping':
          return { acknowledged: true };
        default:
          throw {
            code: -32601,
            message: `Method not found: ${method}`,
            data: { method }
          };
      }
    } catch (error) {
      getLogger().error(`❌ [MCPServer] Request ${method} (${id}) failed:`, error);
      throw error;
    }
  }

  async handleInitialize(params) {
    const { protocolVersion, capabilities, clientInfo } = params;
    getLogger().debug(`[MCPServer] Initialize from client: ${clientInfo?.name} v${clientInfo?.version}`);
    
    const sessionId = this.createSession(clientInfo);
    
    return {
      sessionId, // Return session ID for client to use in future requests
      protocolVersion: this.protocolVersion,
      serverInfo: this.serverInfo,
      capabilities: this.capabilities
    };
  }

  async handleListTools(params) {
    // MCP Server doesn't define tools - Coordinator does
    // This is just protocol compliance
    const tools = [];
    getLogger().debug(`[MCPServer] Listed ${tools.length} tools (delegated to coordinator)`);
    return { tools };
  }

  async handleListResources(params) {
    // MCP Server doesn't define resources - Coordinator does
    const resources = [];
    getLogger().debug(`📄 [MCPServer] Listed ${resources.length} resources (delegated to coordinator)`);
    return { resources };
  }

  async handleListPrompts(params) {
    // MCP Server doesn't define prompts - Coordinator does
    const prompts = [];
    getLogger().debug(`💬 [MCPServer] Listed ${prompts.length} prompts (delegated to coordinator)`);
    return { prompts };
  }

  /**
   * Cleanup expired sessions
   */
  cleanupSessions(maxAge = 3600000) { // 1 hour default
    const now = Date.now();
    const expired = [];
    
    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastAccess > maxAge) {
        expired.push(sessionId);
      }
    }
    
    expired.forEach(sessionId => {
      this.sessions.delete(sessionId);
      getLogger().debug(`🧹 [MCPServer] Cleaned up expired session: ${sessionId}`);
    });
    
    return expired.length;
  }
}

/**
 * MCP Server Registry - Manages registered MCP servers (downstream agents)
 * This is kept in mcp-server.js only for tracking connected servers
 * Routing decisions are made by Coordinator
 */
class MCPServerRegistry {
  constructor() {
    this.registeredServers = new Map(); // serverId -> server metadata
    this.initializedSessions = new Map(); // serverId -> sessionId with that server
    getLogger().debug('🏢 [MCPServerRegistry] Initialized');
  }

  /**
   * Parse Server-Sent Events format
   */
  parseSSEResponse(text) {
    const lines = text.split('\n');
    let eventData = '';
    let event = '';
    
    for (const line of lines) {
      if (line.startsWith('event:')) {
        event = line.substring(6).trim();
      } else if (line.startsWith('data:')) {
        eventData += line.substring(5).trim();
      } else if (line === '') {
        if (eventData && event === 'message') {
          try {
            return JSON.parse(eventData);
          } catch (error) {
            getLogger().error(`❌ [MCPServerRegistry] Failed to parse SSE JSON:`, error);
            throw error;
          }
        }
        eventData = '';
        event = '';
      }
    }
    
    // Fallback to direct JSON parsing
    try {
      return JSON.parse(text);
    } catch (error) {
      getLogger().error(`❌ [MCPServerRegistry] Failed to parse response:`, error);
      throw new Error(`Failed to parse response: ${text.substring(0, 100)}...`);
    }
  }

  /**
   * Register a downstream MCP server (agent)
   */
  register(serverData) {
    const { agentId, name, description, url, capabilities } = serverData;
    
    const serverInfo = {
      id: agentId,
      name,
      description,
      url,
      capabilities: capabilities || [],
      status: 'healthy',
      registeredAt: new Date().toISOString(),
      lastHeartbeat: new Date().toISOString()
    };

    this.registeredServers.set(agentId, serverInfo);
    getLogger().debug(`[MCPServerRegistry] Registered: ${name} (${agentId})`);
    
    return { 
      success: true, 
      agentId, 
      message: 'MCP server registered successfully'
    };
  }

  /**
   * Unregister a downstream MCP server
   */
  unregister(agentId) {
    if (this.registeredServers.has(agentId)) {
      const server = this.registeredServers.get(agentId);
      this.registeredServers.delete(agentId);
      this.initializedSessions.delete(agentId);
      getLogger().debug(`[MCPServerRegistry] Unregistered: ${server.name} (${agentId})`);
      return { success: true, message: 'MCP server unregistered successfully' };
    }
    return { success: false, message: 'MCP server not found' };
  }

  /**
   * Update heartbeat for a server
   */
  heartbeat(agentId) {
    if (this.registeredServers.has(agentId)) {
      const server = this.registeredServers.get(agentId);
      server.lastHeartbeat = new Date().toISOString();
      server.status = 'healthy';
      return { success: true, message: 'Heartbeat acknowledged' };
    }
    return { success: false, message: 'MCP server not found' };
  }

  /**
   * Get all registered servers
   */
  getRegisteredServers() {
    return Array.from(this.registeredServers.values());
  }

  /**
   * Get a specific server
   */
  getServer(agentId) {
    return this.registeredServers.get(agentId);
  }

  /**
   * Get healthy servers
   */
  getHealthyServers() {
    return Array.from(this.registeredServers.values()).filter(s => s.status === 'healthy');
  }

  /**
   * Initialize session with a downstream MCP server
   */
  async initializeSession(serverId) {
    const server = this.registeredServers.get(serverId);
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }
    
    // Check if already initialized
    if (this.initializedSessions.has(serverId)) {
      return this.initializedSessions.get(serverId);
    }

    try {
      getLogger().debug(`[MCPServerRegistry] Initializing session with ${server.name}`);
      
      const initRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: {
            name: 'mcp-gateway',
            version: '1.0.0'
          }
        }
      };

      const response = await fetch(`${server.url}/mcp`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream'
        },
        body: JSON.stringify(initRequest)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Check content type to determine how to parse
      const contentType = response.headers.get('content-type');
      let result;
      
      if (contentType && contentType.includes('text/event-stream')) {
        // Parse SSE response
        const text = await response.text();
        result = this.parseSSEResponse(text);
      } else {
        // Parse JSON response
        result = await response.json();
      }
      
      if (result.error) {
        throw new Error(`Initialization failed: ${result.error.message}`);
      }

      const sessionId = result.result?.sessionId || response.headers.get('mcp-session-id') || randomUUID();
      
      this.initializedSessions.set(serverId, sessionId);
      getLogger().debug(`[MCPServerRegistry] Session initialized with ${server.name}: ${sessionId}`);
      
      return sessionId;
    } catch (error) {
      getLogger().error(`❌ [MCPServerRegistry] Failed to initialize session with ${server.name}:`, error.message);
      throw error;
    }
  }

  /**
   * Forward request to a downstream MCP server
   * Pure protocol forwarding - no routing decisions
   */
  async forwardRequest(serverId, jsonRpcRequest) {
    const server = this.registeredServers.get(serverId);
    if (!server || server.status !== 'healthy') {
      throw new Error(`MCP server ${serverId} not available`);
    }

    try {
      // Initialize session if needed
      const sessionId = await this.initializeSession(serverId);

      getLogger().debug(`[MCPServerRegistry] Forwarding ${jsonRpcRequest.method} to ${server.name}`);
      
      const response = await fetch(`${server.url}/mcp`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'mcp-session-id': sessionId
        },
        body: JSON.stringify(jsonRpcRequest)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Check content type to determine how to parse
      const contentType = response.headers.get('content-type');
      let result;
      
      if (contentType && contentType.includes('text/event-stream')) {
        // Parse SSE response
        const text = await response.text();
        result = this.parseSSEResponse(text);
      } else {
        // Parse JSON response
        result = await response.json();
      }
      
      getLogger().debug(`[MCPServerRegistry] Response from ${server.name}`);
      
      return result;
      
    } catch (error) {
      getLogger().error(`❌ [MCPServerRegistry] Error forwarding to ${server.name}:`, error.message);
      server.status = 'unhealthy';
      throw error;
    }
  }
}

// Create Express app
const app = express();
const PORT = process.env.MCP_GATEWAY_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Initialize MCP Server and Registry
const mcpServer = new MCPServer();
const mcpRegistry = new MCPServerRegistry();

// Initialize i18n (don't await here, let code that uses translations await ensureI18nInitialized)
initializeI18n().catch(err => {
  getLogger().error('Failed to initialize i18n:', err.message);
});

// Import Coordinator (for routing decisions)
import { IntelligentCoordinator } from './coordinator.js';
const coordinator = new IntelligentCoordinator(mcpRegistry);

// Define endpoints to skip from logging
const skipLoggingEndpoints = [
  '/health',  // Health check - frequent and not informative
  // '/api/agents/:agentId/heartbeat',  // Uncomment if heartbeats are too verbose
];

// Log incoming requests (skip specified endpoints)
app.use((req, res, next) => {
  const shouldSkip = skipLoggingEndpoints.some(endpoint => {
    if (endpoint.includes(':')) {
      // Handle dynamic routes like /api/agents/:agentId/heartbeat
      const pattern = endpoint.replace(/:[^/]+/g, '[^/]+');
      return new RegExp(`^${pattern}$`).test(req.url);
    }
    return req.url === endpoint;
  });

  if (!shouldSkip) {
    getLogger().debug(`${new Date().toISOString()} [MCPGateway] ${req.method} ${req.url}`);
  }
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    server: 'mcp-gateway',
    protocol: 'MCP JSON-RPC 2.0',
    version: mcpServer.protocolVersion,
    registeredServers: mcpRegistry.getHealthyServers().length
  });
});

// Main MCP endpoint - handles JSON-RPC 2.0 requests
app.post('/', async (req, res) => {
  try {
    const jsonRpcRequest = req.body;
    const sessionId = req.headers['mcp-session-id'];
    
    // Validate JSON-RPC 2.0 format
    if (!jsonRpcRequest.jsonrpc || jsonRpcRequest.jsonrpc !== '2.0') {
      return res.status(400).json({
        jsonrpc: '2.0',
        id: jsonRpcRequest.id || null,
        error: {
          code: -32600,
          message: 'Invalid Request',
          data: 'Missing or invalid jsonrpc field'
        }
      });
    }

    if (!jsonRpcRequest.method) {
      return res.status(400).json({
        jsonrpc: '2.0',
        id: jsonRpcRequest.id || null,
        error: {
          code: -32600,
          message: 'Invalid Request',
          data: 'Missing method field'
        }
      });
    }

    // Handle notification (no response expected)
    if (jsonRpcRequest.id === undefined) {
      getLogger().debug(`[MCPGateway] Notification: ${jsonRpcRequest.method}`);
      res.status(204).end();
      return;
    }

    // PROTOCOL HANDLING: MCP Server handles protocol
    const result = await mcpServer.handleRequest(jsonRpcRequest, sessionId);
    
    // Return session ID for initialize requests
    const responseHeaders = {};
    if (jsonRpcRequest.method === 'initialize' && result.sessionId) {
      responseHeaders['mcp-session-id'] = result.sessionId;
    }

    res.set(responseHeaders).json({
      jsonrpc: '2.0',
      id: jsonRpcRequest.id,
      result: result
    });

  } catch (error) {
    const errorResponse = {
      jsonrpc: '2.0',
      id: req.body.id || null,
      error: {
        code: error.code || -32603,
        message: error.message || 'Internal error',
        data: error.data || undefined
      }
    };

    getLogger().error('❌ [MCPGateway] Error:', errorResponse.error);
    res.status(500).json(errorResponse);
  }
});

// Agent registration endpoints  
app.post('/api/agents/register', (req, res) => {
  try {
    const agentData = req.body;
    
    if (!agentData.agentId || !agentData.name || !agentData.url) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: agentId, name, url'
      });
    }

    const result = mcpRegistry.register(agentData);
    
    // Also register with coordinator
    coordinator.registerAgent(agentData);
    
    res.json(result);
  } catch (error) {
    getLogger().error('❌ [MCPGateway] Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during registration'
    });
  }
});

app.post('/api/agents/:agentId/unregister', (req, res) => {
  try {
    const { agentId } = req.params;
    const result = mcpRegistry.unregister(agentId);
    
    // Also unregister from coordinator
    coordinator.unregisterAgent(agentId);
    
    res.json(result);
  } catch (error) {
    getLogger().error('❌ [MCPGateway] Unregistration error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during unregistration'
    });
  }
});

app.post('/api/agents/:agentId/heartbeat', (req, res) => {
  try {
    const { agentId } = req.params;
    const result = mcpRegistry.heartbeat(agentId);
    res.json(result);
  } catch (error) {
    getLogger().error('❌ [MCPGateway] Heartbeat error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during heartbeat'
    });
  }
});

// llm providers endpoint - fetch available providers from coordinator
app.get('/api/llm-providers', (req, res) => {
  try {
    const providers = coordinator.getAvailableLLMProviders();
    
    if (!providers || providers.length === 0) {
      getLogger().warn('No llm providers configured');
      return res.status(503).json({
        success: false,
        message: 'No llm providers configured',
        details: 'Please configure either AWS Bedrock (AWS_REGION + BEDROCK_MODEL) or Ollama (OLLAMA_SERVER_URL) environment variables',
        providers: [],
        count: 0
      });
    }
    
    res.json({
      success: true,
      providers: providers,
      default_provider: 'aws',
      count: providers.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    getLogger().error('❌ [MCPGateway] llm providers endpoint error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch llm providers',
      error: error.message
    });
  }
});

// Coordinator endpoints (routing and intelligence)
app.post('/api/query', async (req, res) => {
  try {
    const { query, language = 'en', phase = 'phase2', userContext, streamThinking = false, llmProvider = 'aws' } = req.body;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: query'
      });
    }

    // Check if client wants streaming thinking updates
    if (streamThinking) {
      // Set up streaming response
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Set callback for streaming thinking messages
      coordinator.setStreamThinkingCallback((message) => {
        res.write(JSON.stringify({ type: 'thinking', message: message }) + '\n');
      });

      // ROUTING DECISION: Coordinator handles this
      const result = await coordinator.processQuery(query, language, phase, userContext, llmProvider);
      
      // Check if the coordinator returned an error response
      if (result.error || result.success === false) {
        res.write(JSON.stringify({ 
          type: 'response', 
          success: false, 
          message: result.response,
          error: true 
        }) + '\n');
      } else {
        // Send final response
        res.write(JSON.stringify({ 
          type: 'response', 
          success: true, 
          ...result 
        }) + '\n');
      }
      res.write('[DONE]\n');
      res.end();

      // Clear callback
      coordinator.setStreamThinkingCallback(null);
    } else {
      // Non-streaming mode (original behavior)
      const result = await coordinator.processQuery(query, language, phase, userContext, llmProvider);
      
      // Check if the coordinator returned an error response
      if (result.error || result.success === false) {
        res.status(200).json({
          success: false,
          message: result.response,
          error: true
        });
      } else {
        res.json({
          success: true,
          ...result
        });
      }
    }
  } catch (error) {
    getLogger().error('❌ [MCPGateway] Query processing error:', error);
    
    if (res.headersSent) {
      // If headers already sent (streaming mode), send error as JSON line
      res.write(JSON.stringify({ 
        type: 'error', 
        success: false, 
        message: error.message || 'Internal server error during query processing',
        error: true 
      }) + '\n');
      res.write('[DONE]\n');
      res.end();
    } else {
      res.status(500).json({
        success: false,
        message: error.message || 'Internal server error during query processing',
        error: true
      });
    }
  }
});

// Session cleanup (run periodically)
setInterval(() => {
  const cleaned = mcpServer.cleanupSessions();
  if (cleaned > 0) {
    getLogger().debug(`🧹 [MCPGateway] Cleaned up ${cleaned} expired sessions`);
  }
}, 300000); // Every 5 minutes

// Start server
app.listen(PORT, async () => {
  getLogger().debug(`[MCPGateway] MCP Gateway running on http://localhost:${PORT}`);
  getLogger().debug(`[MCPGateway] Protocol: MCP ${mcpServer.protocolVersion} (JSON-RPC 2.0)`);
  getLogger().debug(`[MCPGateway] Ready to register MCP servers`);
  
  // Initialize coordinator
  await coordinator.initialize();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  getLogger().debug('🛑 [MCPGateway] SIGTERM signal received: closing MCP Gateway...');
  await coordinator.cleanup();
  process.exit(0);
});

process.on('SIGINT', async () => {
  getLogger().debug('🛑 [MCPGateway] SIGINT signal received: closing MCP Gateway...');
  await coordinator.cleanup();
  process.exit(0);
});

export { MCPServer, MCPServerRegistry };
