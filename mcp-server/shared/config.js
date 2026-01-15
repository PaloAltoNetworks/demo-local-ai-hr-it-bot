/**
 * Configuration management for MCP agents
 */
class ConfigManager {
  static getConfig() {
    return {
      coordinator: {
        url: process.env.COORDINATOR_URL || 'http://mcp-gateway:3001',
        timeout: 10000,
        healthCheckTimeout: 3000,
        heartbeatInterval: 30000, // 30 seconds
        heartbeatTimeout: 5000,
        registrationRetries: 5,
        retryBackoffBase: 1000, // 1 second
        retryBackoffMax: 30000 // 30 seconds
      },
      agent: {
        port: process.env.PORT || 3000
      }
    };
  }

  static getAgentConfig(agentName) {
    const baseConfig = this.getConfig();
    return {
      ...baseConfig,
      agentName
    };
  }

  static calculateBackoffDelay(attempt, baseDelay = 1000, maxDelay = 30000) {
    const exponentialDelay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    return exponentialDelay;
  }
}

export { ConfigManager };
