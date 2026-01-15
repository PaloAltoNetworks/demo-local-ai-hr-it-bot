/**
 * Query processing utilities for agents
 */
import { getLogger } from '../utils/logger.js';
import { LLMProviderFactory } from '../utils/llm-provider.js';
import { ConfigManager } from './config.js';

class QueryProcessor {
  constructor(agentName) {
    this.agentName = agentName;
    this.logger = getLogger();
    this.config = ConfigManager.getConfig();
    this.registry = LLMProviderFactory.getRegistry();
  }

  /**
   * Process query using LLM provider with optional provider override
   */
  async processWithModel(systemPrompt, query, provider = null) {
    this.logger.debug('Processing query with LLM provider...');

    try {
      this.logger.debug(`System prompt length: ${systemPrompt.length} characters`);

      const result = await LLMProviderFactory.generateText(query, {
        system: systemPrompt,
        temperature: 0.3,
        maxTokens: 2000,
        provider
      });

      this.logger.debug(`Response length: ${result.response.length} characters`);
      this.logger.debug(`Tokens - Prompt: ${result.usage?.prompt_tokens}, Completion: ${result.usage?.completion_tokens}`);
      this.logger.debug('Query processed successfully');

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
