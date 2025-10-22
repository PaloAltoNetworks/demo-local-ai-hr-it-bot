/**
 * Query processing utilities for agents
 */
import { Ollama } from 'ollama';
import { Logger } from './logger.js';
import { ConfigManager } from './config.js';

class QueryProcessor {
  constructor(agentName) {
    this.agentName = agentName;
    this.logger = new Logger(agentName);
    this.config = ConfigManager.getConfig();
    this.ollama = new Ollama({
      host: this.config.agent.ollamaUrl
    });
  }

  /**
   * Process query using Ollama
   */
  async processWithModel(systemPrompt, query) {
    this.logger.thinking('Processing query with Ollama...');

    try {
      this.logger.debug(`Model: ${this.config.agent.preferredModel}`);
      this.logger.debug(`Prompt length: ${systemPrompt.length} characters`);

      const prompt = `${systemPrompt}\n\nUSER QUERY: ${query}\n\nRESPONSE:`;

      const result = await this.ollama.generate({
        model: this.config.agent.preferredModel,
        prompt,
        options: {
          temperature: this.config.agent.temperature
        }
      });

      this.logger.debug(`Response length: ${result.response.length} characters`);
      this.logger.success('Query processed successfully');

      return result.response;
    } catch (error) {
      this.logger.error('Failed to process query', error);
      throw error;
    }
  }

  /**
   * Get available models from Ollama
   */
  async getAvailableModels() {
    try {
      const models = await this.ollama.list();
      return models.models?.map((m) => m.name) || [];
    } catch (error) {
      this.logger.warn('Failed to fetch models from Ollama', error);
      return [];
    }
  }
}

export { QueryProcessor };
