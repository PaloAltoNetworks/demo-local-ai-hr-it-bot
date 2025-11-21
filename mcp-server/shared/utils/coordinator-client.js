/**
 * Coordinator communication module for agent registration, heartbeats, and lifecycle management
 */
import axios from 'axios';
import { getLogger } from './logger.js';
import { ConfigManager } from './config.js';

class CoordinatorClient {
  constructor(agentName, agentId, agentDescription) {
    this.agentName = agentName;
    this.agentId = agentId;
    this.agentDescription = agentDescription;
    this.logger = getLogger();
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

    this.logger.info(`Registering with coordinator at ${this.config.coordinator.url}...`);
    this.logger.debug('Registration data:', JSON.stringify(registrationData, null, 2));

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
        this.logger.info('Successfully registered with coordinator');
        this.logger.debug('Registration result:', response.data);
        this.registrationRetries = 0;
        return response.data;
      } else {
        throw new Error(`Registration failed with status: ${response.status}`);
      }
    } catch (error) {
      this.logger.error('Failed to register with coordinator', error);
      throw error;
    }
  }

  /**
   * Start sending periodic heartbeats to maintain registration
   */
  startHeartbeat(onReconnect) {
    if (this.heartbeatStarted) {
      this.logger.warn('Heartbeat already started');
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
          this.logger.debug('Reconnected to coordinator');
          this.consecutiveHeartbeatFailures = 0;
          this.isConnected = true;
          if (onReconnect) onReconnect();
        }
      } catch (error) {
        this.consecutiveHeartbeatFailures++;

        if (this.isConnected) {
          this.logger.warn(`Lost connection to coordinator: ${error.message}`);
          this.isConnected = false;
        }

        this.logger.warn(
          `Heartbeat failed (${this.consecutiveHeartbeatFailures} consecutive failures)`
        );

        // Attempt re-registration after multiple failures
        if (this.consecutiveHeartbeatFailures >= 3 && onReconnect) {
          this.logger.warn('Multiple heartbeat failures detected, triggering reconnection...');
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

      this.logger.debug(
        `Retrying registration in ${backoffDelay}ms (attempt ${this.registrationRetries}/${this.config.coordinator.registrationRetries})`
      );

      setTimeout(retryFn, backoffDelay);
    } else {
      this.logger.error(
        'Max registration retries exceeded. Agent will retry periodically'
      );

      // Periodic retry every minute
      setTimeout(() => {
        this.logger.debug('Periodic registration retry...');
        this.registrationRetries = 0;
        retryFn();
      }, 60000);
    }
  }

  /**
   * Unregister from coordinator
   */
  async unregister() {
    this.logger.info('Unregistering from coordinator...');

    try {
      const response = await axios.post(
        `${this.config.coordinator.url}/api/agents/${this.agentId}/unregister`,
        {},
        {
          timeout: 5000
        }
      );

      if (response.status === 200) {
        this.logger.info('Successfully unregistered from coordinator');
      }
    } catch (error) {
      this.logger.warn('Failed to unregister from coordinator', error);
    }
  }
}

export { CoordinatorClient };
