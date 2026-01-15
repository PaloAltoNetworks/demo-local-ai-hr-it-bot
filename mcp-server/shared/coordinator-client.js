/**
 * Coordinator communication module for agent registration, heartbeats, and lifecycle management
 */
import axios from 'axios';
import { getLogger } from '../utils/logger.js';
import { ConfigManager } from './config.js';

class CoordinatorClient {
  constructor(agentName, agentId, agentDescription) {
    this.agentName = agentName;
    this.agentId = agentId;
    this.agentDescription = agentDescription;
    this.config = ConfigManager.getConfig();
    this.registrationRetries = 0;
    this.heartbeatStarted = false;
    this.consecutiveHeartbeatFailures = 0;
    this.isConnected = true;
  }

  /**
   * Check if coordinator is available
   */
  async checkAvailability() {
    try {
      await axios.get(`${this.config.coordinator.url}/health`, {
        timeout: this.config.coordinator.healthCheckTimeout
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Register this agent with the coordinator
   */
  async register(agentUrl, capabilities, LLMProviders = []) {
    const isAvailable = await this.checkAvailability();
    if (!isAvailable) {
      throw new Error('Coordinator is not available');
    }

    const registrationData = {
      agentId: this.agentId,
      name: this.agentName,
      description: this.agentDescription,
      url: agentUrl,
      capabilities,
      LLMProviders
    };

    getLogger().info(`Registering with coordinator at ${this.config.coordinator.url}...`);
    getLogger().debug('Registration data:', JSON.stringify(registrationData, null, 2));

    try {
      const response = await axios.post(
        `${this.config.coordinator.url}/api/agents/register`,
        registrationData,
        {
          timeout: this.config.coordinator.timeout,
          headers: { 'Content-Type': 'application/json' }
        }
      );

      if (response.status === 200) {
        getLogger().info('Successfully registered with coordinator');
        getLogger().debug('Registration result:', response.data);
        this.registrationRetries = 0;
        return response.data;
      } else {
        throw new Error(`Registration failed with status: ${response.status}`);
      }
    } catch (error) {
      getLogger().error('Failed to register with coordinator', error);
      throw error;
    }
  }

  /**
   * Start sending periodic heartbeats to maintain registration
   */
  startHeartbeat(onReconnect) {
    if (this.heartbeatStarted) {
      getLogger().warn('Heartbeat already started');
      return;
    }

    this.heartbeatStarted = true;
    this.consecutiveHeartbeatFailures = 0;

    setInterval(async () => {
      try {
        await axios.get(`${this.config.coordinator.url}/health`, {
          timeout: this.config.coordinator.heartbeatTimeout
        });

        // Reset failure count on successful heartbeat
        if (this.consecutiveHeartbeatFailures > 0) {
          getLogger().debug('Reconnected to coordinator');
          this.consecutiveHeartbeatFailures = 0;
          this.isConnected = true;
          if (onReconnect) onReconnect();
        }
      } catch (error) {
        this.consecutiveHeartbeatFailures++;

        if (this.isConnected) {
          getLogger().warn(`Lost connection to coordinator: ${error.message}`);
          this.isConnected = false;
        }

        getLogger().warn(
          `Heartbeat failed (${this.consecutiveHeartbeatFailures} consecutive failures)`
        );

        // Attempt re-registration after multiple failures
        if (this.consecutiveHeartbeatFailures >= 3 && onReconnect) {
          getLogger().warn('Multiple heartbeat failures detected, triggering reconnection...');
          onReconnect();
        }
      }
    }, this.config.coordinator.heartbeatInterval);
  }

  /**
   * Retry registration with exponential backoff
   */
  retryRegistration(retryFn) {
    if (this.registrationRetries <= this.config.coordinator.registrationRetries) {
      this.registrationRetries++;
      const backoffDelay = ConfigManager.calculateBackoffDelay(
        this.registrationRetries,
        this.config.coordinator.retryBackoffBase,
        this.config.coordinator.retryBackoffMax
      );

      getLogger().debug(
        `Retrying registration in ${backoffDelay}ms (attempt ${this.registrationRetries}/${this.config.coordinator.registrationRetries})`
      );

      setTimeout(retryFn, backoffDelay);
    } else {
      getLogger().error(
        'Max registration retries exceeded. Agent will retry periodically'
      );

      // Periodic retry every minute
      setTimeout(() => {
        getLogger().debug('Periodic registration retry...');
        this.registrationRetries = 0;
        retryFn();
      }, 60000);
    }
  }

  /**
   * Unregister from coordinator
   */
  async unregister() {
    getLogger().info('Unregistering from coordinator...');

    try {
      const response = await axios.post(
        `${this.config.coordinator.url}/api/agents/${this.agentId}/unregister`,
        {},
        {
          timeout: 5000
        }
      );

      if (response.status === 200) {
        getLogger().info('Successfully unregistered from coordinator');
      }
    } catch (error) {
      getLogger().warn('Failed to unregister from coordinator', error);
    }
  }
}

export { CoordinatorClient };
