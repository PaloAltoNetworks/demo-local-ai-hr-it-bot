/**
 * Query processing utilities for agents
 */
import { getLogger } from '../utils/logger.js';
import { LLMProviderFactory } from '../utils/llm-provider.js';
import { ConfigManager } from './config.js';

class QueryProcessor {
  constructor(agentName) {
    this.agentName = agentName;
    this.config = ConfigManager.getConfig();
    this.registry = LLMProviderFactory.getRegistry();
  }

  /**
   * Process query using LLM provider with optional provider override
   */
  async processWithModel(systemPrompt, query, provider = null) {
    getLogger().debug('Processing query with LLM provider...');

    try {
      getLogger().debug(`System prompt length: ${systemPrompt.length} characters`);

      const result = await LLMProviderFactory.generateText(query, {
        system: systemPrompt,
        temperature: 0.3,
        maxTokens: 2000,
        provider
      });

      getLogger().debug(`Response length: ${result.response.length} characters`);
      getLogger().debug(`Tokens - Prompt: ${result.usage?.prompt_tokens}, Completion: ${result.usage?.completion_tokens}`);
      getLogger().debug('Query processed successfully');

      return result.response;
    } catch (error) {
      getLogger().error('Failed to process query', error);
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
      getLogger().warn('Failed to fetch available providers', error);
      return [];
    }
  }
}

export { QueryProcessor };
