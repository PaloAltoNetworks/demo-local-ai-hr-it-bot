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
 * This allows easy switching between providers without changing application code
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
 * Base LLM Provider Interface
 */
class LLMProvider {
  async generate(prompt, options = {}) {
    throw new Error('generate() must be implemented');
  }

  trackTokens(response) {
    return {
      promptTokens: response.usage?.promptTokens || 0,
      completionTokens: response.usage?.completionTokens || 0,
      totalTokens: (response.usage?.promptTokens || 0) + (response.usage?.completionTokens || 0),
    };
  }
}

/**
 * Unified LLM Provider
 * Wraps the AI SDK to provide consistent interface across all providers
 */
class AIProvider extends LLMProvider {
  constructor(model) {
    super();
    this.model = model;
  }

  async generate(prompt, options = {}) {
    const {
      system = '',
      temperature = 0.3,
      maxTokens = 1000,
    } = options;

    try {
      const messages = [];
      if (system) {
        messages.push({ role: 'system', content: system });
      }
      messages.push({ role: 'user', content: prompt });

      getLogger().debug(`[AIProvider] Using model instance: ${this.model?.modelId || 'unknown'} (Provider: ${this.model?.provider || 'unknown'})`);
      getLogger().debug(`[AIProvider] Model object keys: ${Object.keys(this.model || {}).join(', ')}`);
      getLogger().debug(`[AIProvider] Sending request - temperature=${temperature}, maxTokens=${maxTokens}, messageCount=${messages.length}`);
      getLogger().debug(`[AIProvider] First message content: ${messages[0]?.content?.substring(0, 100) || 'N/A'}`);

      const response = await generateText({
        model: this.model,
        messages,
        temperature,
        maxTokens,
      });

      getLogger().debug(`[AIProvider] Response received successfully`);
      getLogger().debug(`[AIProvider] Response text length: ${response.text?.length || 0} chars`);
      getLogger().debug(`[AIProvider] Response usage: ${JSON.stringify(response.usage || {})}`);
      getLogger().debug(`[AIProvider] Response model: ${response.model || 'N/A'}`);
      
      if (!response.text || response.text.trim().length === 0) {
        getLogger().warn(`[AIProvider] Empty response received`);
      }

      // Extract token usage - try multiple paths as different providers format differently
      // Ollama uses: inputTokens, outputTokens
      // Most providers use: promptTokens, completionTokens
      const promptTokens = response.usage?.promptTokens || response.usage?.prompt_tokens || response.usage?.inputTokens || response.promptTokens || 0;
      const completionTokens = response.usage?.completionTokens || response.usage?.completion_tokens || response.usage?.outputTokens || response.completionTokens || 0;
      const totalTokens = promptTokens + completionTokens;
      
      getLogger().debug(`[AIProvider] Token consumption - Prompt: ${promptTokens}, Completion: ${completionTokens}, Total: ${totalTokens}`);

      return {
        response: response.text,
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: totalTokens,
        },
        model: response.model || 'unknown',
      };
    } catch (error) {
      getLogger().error(`[AIProvider] Error generating text: ${error.message}`);
      getLogger().error(`[AIProvider] Full error: ${JSON.stringify(error, null, 2)}`);
      
      if (error.message?.includes('Invalid JSON response')) {
        getLogger().error('[AIProvider] This often indicates Bedrock endpoint misconfiguration or authentication issue');
      }
      
      if (error.message?.includes('Not Found') || error.status === 404) {
        getLogger().error('[AIProvider] 404 Not Found - check if model exists or endpoint URL is correct');
        getLogger().error(`[AIProvider] Model ID being used: ${this.model?.modelId}`);
        getLogger().error(`[AIProvider] Provider: ${this.model?.provider}`);
      }
      
      throw error;
    }
  }
}

/**
 * Factory for creating LLM providers using AI SDK Provider Registry
 * The registry allows dynamic provider selection with simple string identifiers
 */
class LLMProviderFactory {
  static _registry = null;

  /**
   * Initialize the provider registry with all configured providers
   */
  static _initializeRegistry() {
    if (this._registry) {
      return this._registry;
    }

    const providers = {};

    // OpenAI provider
    if (process.env.OPENAI_API_KEY) {
      const openaiClient = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
      providers.openai = openaiClient;
      getLogger().debug('[LLMProvider] OpenAI provider registered');
    }

    // Anthropic provider
    if (process.env.ANTHROPIC_API_KEY) {
      const anthropicClient = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      providers.anthropic = anthropicClient;
      getLogger().debug('[LLMProvider] Anthropic provider registered');
    }

    // Azure OpenAI provider
    if (process.env.AZURE_API_KEY && (process.env.AZURE_RESOURCE_NAME || process.env.AZURE_BASE_URL)) {
      const azureClient = createAzure({
        apiKey: process.env.AZURE_API_KEY,
        resourceName: process.env.AZURE_RESOURCE_NAME,
        baseUrl: process.env.AZURE_BASE_URL,
        apiVersion: process.env.AZURE_API_VERSION,
        useDeploymentBasedUrls: true,
      });
      providers.azure = azureClient;
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
        getLogger().debug(`[LLMProvider] Ollama provider registered at ${ollamaUrl}`);
      } catch (error) {
        getLogger().error(`[LLMProvider] Failed to initialize Ollama provider: ${error.message}`);
        throw error;
      }
    }

    // Create the registry
    this._registry = createProviderRegistry(providers);
    getLogger().debug(`[LLMProvider] Provider registry initialized with ${Object.keys(providers).length} providers`);
    return this._registry;
  }

  /**
   * Create a model instance using the provider registry
   * Priority: explicit providerType > first available provider > error
   */
  static create(providerType = null, modelId = null) {
    const availableProviders = this.getAvailableLLMProviders();
    
    let provider = providerType;
    if (!provider) {
      if (availableProviders.length === 0) {
        throw new Error('[LLMProvider] No LLM providers configured. Configure at least one of: OPENAI_API_KEY, ANTHROPIC_API_KEY, AWS_REGION + BEDROCK_MODEL, AZURE_API_KEY + AZURE_RESOURCE_NAME, GOOGLE_APPLICATION_CREDENTIALS, or OLLAMA_SERVER_URL');
      }
      provider = availableProviders[0].id;
      getLogger().info(`[LLMProvider] No provider specified, using first available: ${provider}`);
    }
    
    getLogger().debug(`[LLMProvider] Creating model - provider: ${provider}, modelId: ${modelId || 'default'}`);

    const registry = this._initializeRegistry();
    const modelIdentifier = this._buildModelIdentifier(provider, modelId);
    
    try {
      getLogger().debug(`[LLMProvider] Creating model from registry: ${modelIdentifier}`);
      getLogger().debug(`[LLMProvider] Registry keys: ${Object.keys(registry).join(', ')}`);
      
      const model = registry.languageModel(modelIdentifier);
      
      getLogger().debug(`[LLMProvider] Model object created - type: ${typeof model}`);
      getLogger().debug(`[LLMProvider] Model properties: modelId=${model?.modelId}, provider=${model?.provider}`);
      getLogger().debug(`[LLMProvider] Created provider instance: ${modelIdentifier}`);
      
      return new AIProvider(model);
    } catch (error) {
      getLogger().error(`[LLMProvider] Failed to create model ${modelIdentifier}: ${error.message}`);
      getLogger().error(`[LLMProvider] Error details:`, error);
      throw new Error(`Unable to create model for provider: ${provider}. Error: ${error.message}`);
    }
  }

  /**
   * Build model identifier string based on provider type
   */
  static _buildModelIdentifier(provider, modelId) {
    const providerLower = provider.toLowerCase();
    
    switch (providerLower) {
      case 'openai':
        return `openai:${modelId || process.env.OPENAI_MODEL || 'gpt-4o-mini'}`;
      
      case 'anthropic':
        return `anthropic:${modelId || process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022'}`;
      
      case 'azure':
        return `azure:${modelId || process.env.AZURE_MODEL || ''}`;
      
      case 'gcp':
        return `gcp:${modelId || process.env.GCP_MODEL || 'gemini-1.5-flash'}`;
      
      case 'aws':
        return `bedrock:${modelId || process.env.BEDROCK_MODEL || 'anthropic.claude-3-5-sonnet-20241022-v2:0'}`;
      
      case 'ollama':
        return `ollama:${modelId || process.env.OLLAMA_MODEL || process.env.COORDINATOR_MODEL || 'qwen2.5:1.5b'}`;
      
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Detect available llm providers based on configured environment variables
   * Only checks for configuration availability, never exposes credentials
   * Returns list of providers that have necessary configuration
   */
  static getAvailableLLMProviders() {
    const availableProviders = [];

    // Check OpenAI configuration
    if (process.env.OPENAI_API_KEY) {
      availableProviders.push({
        id: 'openai',
        name: 'OpenAI',
        display_name: 'OpenAI',
        logo: './images/openai.svg',
        provider: 'openai',
        configured: true,
      });
      getLogger().debug('[LLMProvider] OpenAI provider detected (configured via OPENAI_API_KEY)');
    }

    // Check Anthropic configuration
    if (process.env.ANTHROPIC_API_KEY) {
      availableProviders.push({
        id: 'anthropic',
        name: 'Anthropic',
        display_name: 'Anthropic Claude',
        logo: './images/anthropic.svg',
        provider: 'anthropic',
        configured: true,
      });
      getLogger().debug('[LLMProvider] Anthropic provider detected (configured via ANTHROPIC_API_KEY)');
    }

    // Check AWS Bedrock configuration
    // Requires AWS_REGION and BEDROCK_MODEL (credentials come from AWS SDK env vars)
    if (process.env.AWS_REGION && process.env.BEDROCK_MODEL) {
      availableProviders.push({
        id: 'aws',
        name: 'AWS',
        display_name: 'Amazon Web Services',
        logo: './images/amazonwebservices-original-wordmark.svg',
        provider: 'bedrock',
        configured: true,
      });
      getLogger().debug('[LLMProvider] AWS Bedrock provider detected (configured via AWS_REGION and BEDROCK_MODEL)');
    } else if (process.env.AWS_REGION || process.env.BEDROCK_MODEL) {
      getLogger().warn('[LLMProvider] AWS Bedrock partially configured - missing AWS_REGION or BEDROCK_MODEL');
    }

    // Check Azure OpenAI configuration
    if (process.env.AZURE_API_KEY && process.env.AZURE_RESOURCE_NAME) {
      availableProviders.push({
        id: 'azure',
        name: 'Microsoft Azure',
        display_name: 'Microsoft Azure OpenAI',
        logo: './images/azure-original.svg',
        provider: 'azure',
        configured: true,
      });
      getLogger().debug('[LLMProvider] Azure OpenAI provider detected (configured via Azure credentials)');
    } else if (process.env.AZURE_API_KEY || process.env.AZURE_RESOURCE_NAME) {
      getLogger().warn('[LLMProvider] Azure OpenAI partially configured - missing API key, resource name, or deployment ID');
    }

    // Check Google Cloud Vertex AI configuration
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      availableProviders.push({
        id: 'gcp',
        name: 'Google Cloud Platform',
        display_name: 'Google Cloud Vertex AI',
        logo: './images/googlecloud-original.svg',
        provider: 'gcp',
        configured: true,
      });
      getLogger().debug('[LLMProvider] Google Cloud Vertex AI provider detected (Service Account)');
    }

    // Check Ollama configuration
    // Requires OLLAMA_SERVER_URL to be explicitly set, or defaults to localhost
    if (process.env.OLLAMA_SERVER_URL) {
      availableProviders.push({
        id: 'ollama',
        name: 'Ollama',
        display_name: 'Ollama',
        logo: './images/ollama-icon.svg',
        provider: 'ollama',
        configured: true,
      });
      getLogger().debug('[LLMProvider] Ollama provider detected (configured via OLLAMA_SERVER_URL)');
    }

    // If no providers are properly configured, return error information
    if (availableProviders.length === 0) {
      getLogger().error('[LLMProvider] No llm providers properly configured. Configure at least one of: OPENAI_API_KEY, ANTHROPIC_API_KEY, AWS_REGION + BEDROCK_MODEL, AZURE_API_KEY + AZURE_RESOURCE_NAME, GOOGLE_API_KEY, or OLLAMA_SERVER_URL');
      return [];
    }

    getLogger().debug(`[LLMProvider] Available llm providers: ${availableProviders.map((p) => p.id).join(', ')}`);
    return availableProviders;
  }
}

export {
  LLMProvider,
  AIProvider,
  LLMProviderFactory,
};
