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
        port: process.env.PORT || 3000,
        ollamaUrl: process.env.OLLAMA_URL || 'http://host.docker.internal:11434',
        preferredModel: process.env.AGENT_MODEL || 'llama3.2:3b',
        temperature: 0.3
      },
      server: {
        healthCheckInterval: 30,
        healthCheckTimeout: 10,
        healthCheckStartPeriod: 30,
        healthCheckRetries: 3
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
