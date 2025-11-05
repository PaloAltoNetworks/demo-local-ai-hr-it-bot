const { EventEmitter } = require('events');
const axios = require('axios');
const { randomUUID } = require('crypto');

/**
 * MCP Client Implementation - Following MCP Specification 2025-06-18
 * Implements proper JSON-RPC 2.0 communication over HTTP transport
 */
class MCPClient extends EventEmitter {
  constructor(serverUrl, options = {}) {
    super();
    
    this.serverUrl = serverUrl;
    this.protocolVersion = '2025-06-18';
    this.isInitialized = false;
    this.requestId = 1;
    
    // Connection options
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 5;
    this.reconnectDelay = options.reconnectDelay || 1000;
    this.timeout = options.timeout || 1200000;
    
    // MCP State
    this.serverCapabilities = null;
    this.serverInfo = null;
    this.availableTools = new Map();
    this.availableResources = new Map();
    this.availablePrompts = new Map();
    
    // Request tracking
    this.pendingRequests = new Map();
    
    console.log(`[MCPClient] Initialized for MCP server: ${serverUrl}`);
  }

  /**
   * Initialize MCP connection using proper JSON-RPC 2.0 protocol
   */
  async initialize() {
    if (this.isInitialized) {
      console.log('[MCPClient] Already initialized');
      return;
    }

    console.log(`[MCPClient] Initializing MCP connection to: ${this.serverUrl}`);
    
    try {
      // Step 1: Send initialize request (JSON-RPC 2.0)
      const initializeRequest = {
        jsonrpc: '2.0',
        id: this.getNextRequestId(),
        method: 'initialize',
        params: {
          protocolVersion: this.protocolVersion,
          capabilities: {
            roots: {
              // Client supports listing and subscribing to roots
              listChanged: true
            },
            sampling: {
              // Client can handle sampling requests from the server
            }
          },
          clientInfo: {
            name: 'chatbot-host-client',
            version: '1.0.0'
          }
        }
      };

      const initResponse = await this.sendRequest(initializeRequest);
      
      // Store server info and capabilities
      this.serverInfo = initResponse.serverInfo;
      this.serverCapabilities = initResponse.capabilities;
      
      console.log(`[MCPClient] Server: ${this.serverInfo.name} v${this.serverInfo.version}`);
      console.log(`[MCPClient] Server capabilities:`, Object.keys(this.serverCapabilities));
      
      // Step 2: Send initialized notification
      await this.sendNotification({
        jsonrpc: '2.0',
        method: 'notifications/initialized'
      });
      
      // Step 3: Discover available tools, resources, prompts
      await this.discoverServerFeatures();
      
      this.isInitialized = true;
      this.reconnectAttempts = 0;
      
      console.log(`[MCPClient] MCP initialization complete`);
      this.emit('initialized', { 
        serverInfo: this.serverInfo, 
        capabilities: this.serverCapabilities 
      });
      
    } catch (error) {
      console.error('❌ [MCPClient] Initialization failed:', error.message);
      await this.handleConnectionError(error);
      throw error;
    }
  }

  /**
   * Send JSON-RPC 2.0 request and wait for response
   */
  async sendRequest(request) {
    const requestId = request.id;
    
    return new Promise(async (resolve, reject) => {
      // Create AbortController for proper request cancellation
      const controller = new AbortController();
      
      // Store pending request with abort controller
      this.pendingRequests.set(requestId, { 
        resolve, 
        reject, 
        controller,
        timestamp: Date.now() 
      });
      
      // Set up timeout with abort support
      const timeoutId = setTimeout(() => {
        controller.abort(); // Cancel the actual HTTP request
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request ${requestId} timed out after ${this.timeout}ms`));
      }, this.timeout);
      
      try {
        console.log(`[MCPClient] Sending request: ${request.method} (ID: ${requestId})`);
        
        const response = await axios.post(this.serverUrl, request, {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: this.timeout,
          signal: controller.signal // Add abort signal
        });
        
        // Clear timeout
        clearTimeout(timeoutId);
        
        // Handle response
        const jsonRpcResponse = response.data;
        this.pendingRequests.delete(requestId);
        
        if (jsonRpcResponse.error) {
          console.error(`❌ [MCPClient] Request ${requestId} failed:`, jsonRpcResponse.error);
          reject(new Error(`JSON-RPC Error ${jsonRpcResponse.error.code}: ${jsonRpcResponse.error.message}`));
        } else {
          console.log(`[MCPClient] Request ${requestId} completed successfully`);
          resolve(jsonRpcResponse.result);
        }
        
      } catch (error) {
        clearTimeout(timeoutId);
        this.pendingRequests.delete(requestId);
        
        // Distinguish between abort and other errors
        if (error.name === 'AbortError' || error.name === 'CanceledError') {
          console.log(`🚫 [MCPClient] Request ${requestId} was cancelled`);
        } else {
          console.error(`❌ [MCPClient] Request ${requestId} failed:`, error.message);
        }
        reject(error);
      }
    });
  }

  /**
   * Send JSON-RPC 2.0 notification (no response expected)
   */
  async sendNotification(notification) {
    try {
      console.log(`[MCPClient] Sending notification: ${notification.method}`);
      
      await axios.post(this.serverUrl, notification, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: this.timeout
      });
      
      console.log(`[MCPClient] Notification sent: ${notification.method}`);
      
    } catch (error) {
      console.error(`❌ [MCPClient] Notification failed: ${notification.method}`, error.message);
      throw error;
    }
  }

  /**
   * Discover server features (tools, resources, prompts)
   */
  async discoverServerFeatures() {
    console.log('[MCPClient] Discovering server features...');
    
    try {
      // Discover tools if supported
      if (this.serverCapabilities.tools) {
        const toolsRequest = {
          jsonrpc: '2.0',
          id: this.getNextRequestId(),
          method: 'tools/list'
        };
        
        const toolsResult = await this.sendRequest(toolsRequest);
        
        this.availableTools.clear();
        if (toolsResult.tools) {
          toolsResult.tools.forEach(tool => {
            this.availableTools.set(tool.name, tool);
          });
          console.log(`[MCPClient] Discovered ${this.availableTools.size} tools:`, 
            Array.from(this.availableTools.keys()));
        }
      }

      // Discover resources if supported
      if (this.serverCapabilities.resources) {
        const resourcesRequest = {
          jsonrpc: '2.0',
          id: this.getNextRequestId(),
          method: 'resources/list'
        };
        
        const resourcesResult = await this.sendRequest(resourcesRequest);
        
        this.availableResources.clear();
        if (resourcesResult.resources) {
          resourcesResult.resources.forEach(resource => {
            this.availableResources.set(resource.uri, resource);
          });
          console.log(`📄 [MCPClient] Discovered ${this.availableResources.size} resources:`, 
            Array.from(this.availableResources.keys()));
        }
      }

      // Discover prompts if supported
      if (this.serverCapabilities.prompts) {
        const promptsRequest = {
          jsonrpc: '2.0',
          id: this.getNextRequestId(),
          method: 'prompts/list'
        };
        
        const promptsResult = await this.sendRequest(promptsRequest);
        
        this.availablePrompts.clear();
        if (promptsResult.prompts) {
          promptsResult.prompts.forEach(prompt => {
            this.availablePrompts.set(prompt.name, prompt);
          });
          console.log(`💬 [MCPClient] Discovered ${this.availablePrompts.size} prompts:`, 
            Array.from(this.availablePrompts.keys()));
        }
      }

    } catch (error) {
      console.warn('⚠️ [MCPClient] Feature discovery partially failed:', error.message);
      // Don't throw - some features might not be available
    }
  }

  /**
   * Call a tool using MCP protocol
   */
  async callTool(toolName, toolArguments = {}) {
    if (!this.isInitialized) {
      throw new Error('MCP Client not initialized. Call initialize() first.');
    }

    if (!this.availableTools.has(toolName)) {
      throw new Error(`Tool '${toolName}' not available. Available tools: ${Array.from(this.availableTools.keys()).join(', ')}`);
    }

    console.log(`� [MCPClient] Calling tool: ${toolName}`);

    const toolRequest = {
      jsonrpc: '2.0',
      id: this.getNextRequestId(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: toolArguments
      }
    };

    try {
      const result = await this.sendRequest(toolRequest);
      console.log(`[MCPClient] Tool ${toolName} completed successfully`);
      return result;
    } catch (error) {
      console.error(`❌ [MCPClient] Tool ${toolName} failed:`, error.message);
      throw error;
    }
  }

  /**
   * Read resource content using MCP protocol
   */
  async readResource(uri) {
    if (!this.isInitialized) {
      throw new Error('MCP Client not initialized. Call initialize() first.');
    }

    if (!this.availableResources.has(uri)) {
      throw new Error(`Resource '${uri}' not available. Available resources: ${Array.from(this.availableResources.keys()).join(', ')}`);
    }

    console.log(`📄 [MCPClient] Reading resource: ${uri}`);

    const resourceRequest = {
      jsonrpc: '2.0',
      id: this.getNextRequestId(),
      method: 'resources/read',
      params: {
        uri: uri
      }
    };

    try {
      const result = await this.sendRequest(resourceRequest);
      console.log(`[MCPClient] Resource ${uri} read successfully`);
      return result;
    } catch (error) {
      console.error(`❌ [MCPClient] Resource ${uri} read failed:`, error.message);
      throw error;
    }
  }

  /**
   * Get prompt with arguments using MCP protocol
   */
  async getPrompt(promptName, promptArguments = {}) {
    if (!this.isInitialized) {
      throw new Error('MCP Client not initialized. Call initialize() first.');
    }

    if (!this.availablePrompts.has(promptName)) {
      throw new Error(`Prompt '${promptName}' not available. Available prompts: ${Array.from(this.availablePrompts.keys()).join(', ')}`);
    }

    console.log(`💬 [MCPClient] Getting prompt: ${promptName}`);

    const promptRequest = {
      jsonrpc: '2.0',
      id: this.getNextRequestId(),
      method: 'prompts/get',
      params: {
        name: promptName,
        arguments: promptArguments
      }
    };

    try {
      const result = await this.sendRequest(promptRequest);
      console.log(`[MCPClient] Prompt ${promptName} retrieved successfully`);
      return result;
    } catch (error) {
      console.error(`❌ [MCPClient] Prompt ${promptName} retrieval failed:`, error.message);
      throw error;
    }
  }

  /**
   * Generate next request ID
   */
  getNextRequestId() {
    return this.requestId++;
  }

  /**
   * Send ping request to test connection
   */
  async ping() {
    if (!this.isInitialized) {
      throw new Error('MCP Client not initialized');
    }

    const pingRequest = {
      jsonrpc: '2.0',
      id: this.getNextRequestId(),
      method: 'ping'
    };

    try {
      await this.sendRequest(pingRequest);
      console.log(`🏓 [MCPClient] Ping successful`);
      return true;
    } catch (error) {
      console.error(`🏓 [MCPClient] Ping failed:`, error.message);
      return false;
    }
  }

  /**
   * Get client capabilities for MCP
   */
  getClientCapabilities() {
    return {
      isInitialized: this.isInitialized,
      serverInfo: this.serverInfo,
      serverCapabilities: this.serverCapabilities,
      availableTools: Array.from(this.availableTools.keys()),
      availableResources: Array.from(this.availableResources.keys()),
      availablePrompts: Array.from(this.availablePrompts.keys()),
      protocolVersion: this.protocolVersion
    };
  }

  /**
   * Handle connection errors and attempt reconnection
   */
  async handleConnectionError(error) {
    this.isInitialized = false;

    console.error(`💥 [MCPClient] Connection error: ${error.message}`);
    this.emit('error', { error: error.message });

    // Attempt reconnection
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff
      
      console.log(`[MCPClient] Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms...`);
      
      setTimeout(async () => {
        try {
          await this.initialize();
        } catch (reconnectError) {
          console.error(`❌ [MCPClient] Reconnection attempt ${this.reconnectAttempts} failed:`, reconnectError.message);
        }
      }, delay);
    } else {
      console.error(`❌ [MCPClient] Max reconnection attempts reached. Connection abandoned.`);
      this.emit('connectionFailed');
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('[MCPClient] Shutting down...');
    
    // Cancel and abort all pending requests
    for (const [requestId, pendingRequest] of this.pendingRequests.entries()) {
      // Abort the HTTP request if controller exists
      if (pendingRequest.controller) {
        pendingRequest.controller.abort();
      }
      // Reject the promise
      pendingRequest.reject(new Error('Client shutting down'));
    }
    this.pendingRequests.clear();

    // Reset state
    this.isInitialized = false;
    this.serverInfo = null;
    this.serverCapabilities = null;
    this.availableTools.clear();
    this.availableResources.clear();
    this.availablePrompts.clear();

    console.log('[MCPClient] Shutdown complete');
    this.emit('shutdown');
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.shutdown();
    this.removeAllListeners();
  }
}

module.exports = { MCPClient };