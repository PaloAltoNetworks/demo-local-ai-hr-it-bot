/**
 * Query processing utilities for agents
 */
import { LLMProviderFactory } from './llm-provider.js';
import { getLogger } from './logger.js';
import { ConfigManager } from './config.js';

class QueryProcessor {
  constructor(agentName) {
    this.agentName = agentName;
    this.logger = getLogger();
    this.config = ConfigManager.getConfig();
    // Initialize LLM provider (supports multiple llm providers)
    this.llmProvider = LLMProviderFactory.create();
  }

  /**
   * Process query using LLM provider
   */
  async processWithModel(systemPrompt, query) {
    this.logger.debug('Processing query with LLM provider...');

    try {
      const metadata = this.llmProvider.model;
      this.logger.debug(`Processing with model`);
      this.logger.debug(`System prompt length: ${systemPrompt.length} characters`);

      const result = await this.llmProvider.generate(query, {
        system: systemPrompt,
        temperature: 0.3,
        maxTokens: 2000,
      });

      this.logger.debug(`Response length: ${result.response.length} characters`);
      this.logger.debug(`Tokens - Prompt: ${result.usage?.prompt_tokens}, Completion: ${result.usage?.completion_tokens}`);
      this.logger.info('Query processed successfully');

      return result.response;
    } catch (error) {
      this.logger.error('Failed to process query', error);
      throw error;
    }
  }

  /**
   * Get available llm providers
   */
  async getAvailableModels() {
    try {
      const providers = LLMProviderFactory.getAvailableLLMProviders();
      return providers;
    } catch (error) {
      this.logger.warn('Failed to fetch available providers', error);
      return [];
    }
  }
}

export { QueryProcessor };
