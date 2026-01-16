/**
 * LLM Provider Abstraction using AI SDK with Provider Registry
 * Shared across chatbot-host, mcp-gateway, and mcp-server
 * Supports multiple llm providers:
 * - OpenAI (OpenAI API)
 * - Anthropic Claude (Anthropic API)
 * - AWS Bedrock (via AWS SDK)
 * - Google Vertex AI (GCP)
 * - Azure OpenAI (Azure)
 * - Ollama (local, OpenAI-compatible endpoint)
 * 
 * Usage:
 * import { generateText } from 'ai';
 * import { registry } from './llm-provider.js';
 * 
 * const { text } = await generateText({
 *   model: registry.languageModel('openai:gpt-4o-mini'),
 *   prompt: 'Your prompt here',
 * });
 */

import { generateText, createProviderRegistry } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createAzure } from '@ai-sdk/azure';
import { createVertex } from '@ai-sdk/google-vertex';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createOllama } from 'ollama-ai-provider-v2';
import { getLogger } from './logger.js';

/**
 * Provider Registry Factory
 * Initializes and manages the AI SDK provider registry
 */
class LLMProviderFactory {
  static _registry = null;
  static _registeredProviderKeys = [];

  // Provider metadata mapping
  static PROVIDER_METADATA = {
    openai: {
      id: 'openai',
      name: 'OpenAI',
      display_name: 'OpenAI',
      logo: './images/openai.svg',
      provider: 'openai',
      configured: true,
    },
    anthropic: {
      id: 'anthropic',
      name: 'Anthropic',
      display_name: 'Anthropic Claude',
      logo: './images/anthropic.svg',
      provider: 'anthropic',
      configured: true,
    },
    bedrock: {
      id: 'aws',
      name: 'AWS',
      display_name: 'Amazon Web Services',
      logo: './images/amazonwebservices-original-wordmark.svg',
      provider: 'bedrock',
      configured: true,
    },
    azure: {
      id: 'azure',
      name: 'Microsoft Azure',
      display_name: 'Microsoft Azure OpenAI',
      logo: './images/azure-original.svg',
      provider: 'azure',
      configured: true,
    },
    gcp: {
      id: 'gcp',
      name: 'Google Cloud Platform',
      display_name: 'Google Cloud Vertex AI',
      logo: './images/googlecloud-original.svg',
      provider: 'gcp',
      configured: true,
    },
    ollama: {
      id: 'ollama',
      name: 'Ollama',
      display_name: 'Ollama',
      logo: './images/ollama-icon.svg',
      provider: 'ollama',
      configured: true,
    },
  };

  /**
   * Initialize the provider registry with all configured providers
   */
  static initializeRegistry() {
    if (this._registry) {
      return this._registry;
    }

    const providers = {};
    const registeredKeys = [];

    // OpenAI provider
    if (process.env.OPENAI_API_KEY) {
      const openaiClient = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
      providers.openai = openaiClient;
      registeredKeys.push('openai');
      getLogger().debug('[LLMProvider] OpenAI provider registered');
    }

    // Anthropic provider
    if (process.env.ANTHROPIC_API_KEY) {
      const anthropicClient = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      providers.anthropic = anthropicClient;
      registeredKeys.push('anthropic');
      getLogger().debug('[LLMProvider] Anthropic provider registered');
    }

    // Azure OpenAI provider
    if (process.env.AZURE_API_KEY && (process.env.AZURE_RESOURCE_NAME || process.env.AZURE_BASE_URL)) {
      const azureClient = createAzure({
        apiKey: process.env.AZURE_API_KEY,
        resourceName: process.env.AZURE_RESOURCE_NAME || null,
        baseUrl: process.env.AZURE_BASE_URL || null,
        apiVersion: process.env.AZURE_API_VERSION,
        useDeploymentBasedUrls: process.env.AZURE_USE_DEPLOYMENT_URLS || false,
      });
      providers.azure = azureClient;
      registeredKeys.push('azure');
      getLogger().debug('[LLMProvider] Azure OpenAI provider registered');
    }

    // Google Cloud Vertex AI provider (with automatic service account support)
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      try {
        const vertexClient = createVertex({
          project: process.env.GOOGLE_VERTEX_PROJECT,
          location: process.env.GOOGLE_VERTEX_LOCATION || 'us-central1',
          googleAuthOptions: {
            keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS
          }
        });
        providers.gcp = vertexClient;
        registeredKeys.push('gcp');
        getLogger().debug('[LLMProvider] Google Cloud Vertex AI provider registered (Service Account)');
      } catch (error) {
        getLogger().error(`[LLMProvider] Failed to initialize Vertex AI: ${error.message}`);
      }
    }

    // AWS Bedrock provider
    if (process.env.AWS_REGION && process.env.BEDROCK_MODEL) {
      try {
        const bedrockClient = createAmazonBedrock();
        providers.bedrock = bedrockClient;
        registeredKeys.push('bedrock');
        getLogger().debug('[LLMProvider] AWS Bedrock provider registered');
      } catch (error) {
        getLogger().error(`[LLMProvider] Failed to initialize Bedrock: ${error.message}`);
      }
    }

    // Ollama provider (using ollama-ai-provider-v2)
    if (process.env.OLLAMA_SERVER_URL) {
      const ollamaUrl = process.env.OLLAMA_SERVER_URL;
      getLogger().debug(`[LLMProvider] Initializing Ollama provider with URL: ${ollamaUrl}`);
      try {
        const ollamaProvider = createOllama({
          baseURL: `${ollamaUrl}/api`,
        });
        getLogger().debug(`[LLMProvider] Ollama provider created with baseURL: ${ollamaUrl}/api`);
        providers.ollama = ollamaProvider;
        registeredKeys.push('ollama');
        getLogger().debug(`[LLMProvider] Ollama provider registered at ${ollamaUrl}`);
      } catch (error) {
        getLogger().error(`[LLMProvider] Failed to initialize Ollama provider: ${error.message}`);
        throw error;
      }
    }

    // Create the registry
    this._registry = createProviderRegistry(providers);
    this._registeredProviderKeys = registeredKeys;
    getLogger().debug(`[LLMProvider] Provider registry initialized with ${registeredKeys.length} providers`);
    return this._registry;
  }

  /**
   * Build model identifier string based on provider type
   */
  static buildModelIdentifier(provider) {
    const providerLower = provider.toLowerCase();

    switch (providerLower) {
      case 'openai':
        return `openai:${process.env.OPENAI_MODEL || 'gpt-4o-mini'}`;

      case 'anthropic':
        return `anthropic:${process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022'}`;

      case 'azure':
        return `azure:${process.env.AZURE_MODEL || 'gpt-5.2-chat'}`;

      case 'gcp':
        return `gcp:${process.env.GCP_MODEL || 'gemini-1.5-flash'}`;

      case 'aws':
        return `bedrock:${process.env.BEDROCK_MODEL || 'anthropic.claude-3-5-sonnet-20241022-v2:0'}`;

      case 'ollama':
        return `ollama:${process.env.OLLAMA_MODEL || process.env.COORDINATOR_MODEL || 'qwen2.5:1.5b'}`;

      default:
        return `ollama:${process.env.OLLAMA_MODEL || process.env.COORDINATOR_MODEL || 'qwen2.5:1.5b'}`;
    }
  }

  /**
   * Get available llm providers from registered keys
   * Returns metadata for all providers that were successfully initialized
   */
  static getAvailableLLMProviders() {
    // Ensure registry is initialized
    if (!this._registry) {
      this.initializeRegistry();
    }

    const availableProviders = [];
    for (const providerKey of this._registeredProviderKeys) {
      if (this.PROVIDER_METADATA[providerKey]) {
        availableProviders.push(this.PROVIDER_METADATA[providerKey]);
      }
    }

    if (availableProviders.length === 0) {
      getLogger().error('[LLMProvider] No llm providers properly configured. Configure at least one of: OPENAI_API_KEY, ANTHROPIC_API_KEY, AWS_REGION + BEDROCK_MODEL, AZURE_API_KEY + AZURE_RESOURCE_NAME, GOOGLE_API_KEY, or OLLAMA_SERVER_URL');
    }

    return availableProviders;
  }

  /**
   * Get the initialized registry for direct use with generateText
   */
  static getRegistry() {
    if (!this._registry) {
      this.initializeRegistry();
    }
    return this._registry;
  }
  /**
   * Generate text using the registry
   * Convenience method that handles model lookup and generateText call
   */
  static async generateText(prompt, options = {}) {
    const {
      system = '',
      temperature = 0.3,
      maxTokens = 1000,
      provider = null
    } = options;

    const registry = this.getRegistry();
    const modelIdentifier = this.buildModelIdentifier(provider);
    const model = registry.languageModel(modelIdentifier);

    const { text, usage } = await generateText({
      model,
      system,
      prompt,
      temperature,
      maxTokens,
    });

    return { response: text, usage };
  }
}

export {
  LLMProviderFactory,
};
