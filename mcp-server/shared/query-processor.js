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
    this.llmProvider = LLMProviderFactory.create();
  }

  /**
   * Process query using LLM provider with optional provider override
   */
  async processWithModel(systemPrompt, query, providerOverride = null) {
    this.logger.debug('Processing query with LLM provider...');

    try {
      // Switch provider if override provided
      let activeProvider = this.llmProvider;
      if (providerOverride) {
        this.logger.debug(`[QueryProcessor] Switching to provider: ${providerOverride}`);
        activeProvider = LLMProviderFactory.create(providerOverride);
      }

      const metadata = activeProvider.model;
      this.logger.debug(`Processing with model`);
      this.logger.debug(`System prompt length: ${systemPrompt.length} characters`);

      const result = await activeProvider.generate(query, {
        system: systemPrompt,
        temperature: 0.3,
        maxTokens: 2000,
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
