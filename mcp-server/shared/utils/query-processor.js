/**
 * Query processing utilities for agents
 */
import { LLMProviderFactory } from './llm-provider.js';
import { Logger } from './logger.js';
import { ConfigManager } from './config.js';

class QueryProcessor {
  constructor(agentName) {
    this.agentName = agentName;
    this.logger = new Logger(agentName);
    this.config = ConfigManager.getConfig();
    // Initialize LLM provider (supports both Ollama and AWS Bedrock)
    this.llmProvider = LLMProviderFactory.create();
  }

  /**
   * Process query using LLM (Ollama or Bedrock)
   */
  async processWithModel(systemPrompt, query) {
    this.logger.thinking('Processing query with LLM provider...');

    try {
      const metadata = this.llmProvider.getMetadata();
      this.logger.debug(`Provider: ${metadata.provider}`);
      this.logger.debug(`Model: ${metadata.model}`);
      this.logger.debug(`Prompt length: ${systemPrompt.length} characters`);

      const result = await this.llmProvider.processQuery(systemPrompt, query);

      this.logger.debug(`Response length: ${result.response.length} characters`);
      this.logger.debug(`Tokens - Prompt: ${result.usage?.prompt_tokens}, Completion: ${result.usage?.completion_tokens}`);
      this.logger.success('Query processed successfully');

      return result.response;
    } catch (error) {
      this.logger.error('Failed to process query', error);
      throw error;
    }
  }

  /**
   * Get available models from LLM provider
   */
  async getAvailableModels() {
    try {
      const models = await this.llmProvider.getAvailableModels();
      return models;
    } catch (error) {
      this.logger.warn('Failed to fetch models from LLM provider', error);
      return [];
    }
  }
}

export { QueryProcessor };
