/**
 * LLM Provider Abstraction using LiteLLM Proxy
 * Shared across chatbot-host, mcp-gateway, and mcp-server
 * Connects directly to LiteLLM proxy server which provides:
 * - OpenAI-compatible API
 * - Multi-provider support (OpenAI, Anthropic, Azure, Bedrock, Vertex AI, etc.)
 * - Model discovery via /model/info endpoint
 * 
 * Usage:
 * import { LLMProviderFactory } from './llm-provider.js';
 * 
 * const { response, usage } = await LLMProviderFactory.generateText(
 *   'Your prompt here',
 *   { provider: 'azure' }
 * );
 * 
 * Environment variables:
 * - LITELLM_BASE_URL: LiteLLM proxy server URL (required)
 * - LITELLM_API_KEY: API key for LiteLLM proxy (required)
 */

import { getLogger } from './logger.js';

/**
 * LiteLLM Provider Factory
 * Manages connection to LiteLLM proxy and model discovery
 */
class LLMProviderFactory {
  static _initialized = false;
  static _initPromise = null;
  static _modelsCache = [];
  static _providerModels = {}; // Map of provider -> first model
  static _registeredProviderKeys = []; // Track available provider keys (like original)

  // Provider metadata mapping (matches original llm-provider.js)
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
    bedrock_converse: {
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
    azure_ai: {
      id: 'azure_ai',
      name: 'Azure AI',
      display_name: 'Azure AI Foundry',
      logo: './images/azure-original.svg',
      provider: 'azure_ai',
      configured: true,
    },
    vertex_ai: {
      id: 'gcp',
      name: 'Google Cloud Platform',
      display_name: 'Google Cloud Vertex AI',
      logo: './images/googlecloud-original.svg',
      provider: 'gcp',
      configured: true,
    },
    'vertex_ai-language-models': {
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
   * Get LiteLLM configuration from environment
   */
  static getConfig() {
    const baseUrl = process.env.LITELLM_BASE_URL;
    const apiKey = process.env.LITELLM_API_KEY;

    if (!baseUrl) {
      getLogger().warn('[LiteLLMProvider] LITELLM_BASE_URL environment variable is not set');
      return null;
    }

    if (!apiKey) {
      getLogger().warn('[LiteLLMProvider] LITELLM_API_KEY environment variable is not set');
      return null;
    }

    return { baseUrl: baseUrl.replace(/\/$/, ''), apiKey };
  }

  /**
   * Initialize the provider by fetching models from LiteLLM
   * This is called automatically and caches the results
   */
  static initializeRegistry() {
    if (this._initialized) {
      return this;
    }

    const config = this.getConfig();
    if (!config) {
      getLogger().warn('[LiteLLMProvider] LiteLLM not configured - no providers available');
      this._initialized = true;
      return this;
    }

    // Start async initialization but don't block
    if (!this._initPromise) {
      this._initPromise = this._fetchModelsAsync(config)
        .then(() => {
          this._initialized = true;
          getLogger().debug(`[LiteLLMProvider] Initialization complete - ${this._registeredProviderKeys.length} providers available`);
        })
        .catch(error => {
          getLogger().error(`[LiteLLMProvider] Initialization failed: ${error.message}`);
          this._initialized = true; // Mark as initialized even on failure to prevent retry loops
        });
    }

    return this;
  }

  /**
   * Fetch models asynchronously from LiteLLM
   */
  static async _fetchModelsAsync(config) {
    const { baseUrl, apiKey } = config;
    const url = `${baseUrl}/model/info`;

    getLogger().debug(`[LiteLLMProvider] Fetching models from ${url}`);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'accept': 'application/json',
          'x-litellm-api-key': apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      this._modelsCache = data.data || [];

      // Build provider mappings
      this._buildProviderModelMap();

      getLogger().debug(`[LiteLLMProvider] Fetched ${this._modelsCache.length} models`);
    } catch (error) {
      getLogger().error(`[LiteLLMProvider] Error fetching models: ${error.message}`);
      throw error;
    }
  }

  /**
   * Ensure initialization is complete (for async operations)
   */
  static async ensureInitialized() {
    if (!this._initPromise) {
      this.initializeRegistry();
    }
    await this._initPromise;
  }

  /**
   * Build a mapping of normalized provider names to their first available model
   */
  static _buildProviderModelMap() {
    this._providerModels = {};
    this._registeredProviderKeys = [];
    const seenProviders = new Set();

    for (const model of this._modelsCache) {
      const litellmProvider = model.model_info?.litellm_provider;
      if (!litellmProvider) continue;

      // Normalize the provider name
      const normalizedProvider = this._normalizeProviderName(litellmProvider);
      
      // Only keep the first model for each provider
      if (!seenProviders.has(normalizedProvider)) {
        seenProviders.add(normalizedProvider);
        this._providerModels[normalizedProvider] = {
          model_name: model.model_name,
          model_id: model.model_info?.id,
          litellm_provider: litellmProvider,
          max_tokens: model.model_info?.max_tokens,
          max_input_tokens: model.model_info?.max_input_tokens,
          max_output_tokens: model.model_info?.max_output_tokens,
        };
        
        // Add to registered keys using the metadata key
        const metadataKey = this._getMetadataKey(litellmProvider);
        if (metadataKey && !this._registeredProviderKeys.includes(metadataKey)) {
          this._registeredProviderKeys.push(metadataKey);
        }
        
        getLogger().debug(`[LiteLLMProvider] Registered ${normalizedProvider} -> ${model.model_name}`);
      }
    }
  }

  /**
   * Get the metadata key for a litellm provider
   */
  static _getMetadataKey(litellmProvider) {
    const providerLower = litellmProvider.toLowerCase();
    
    if (providerLower.includes('bedrock')) return 'bedrock';
    if (providerLower.includes('vertex')) return 'vertex_ai';
    if (providerLower === 'azure_ai') return 'azure_ai';
    if (providerLower === 'azure') return 'azure';
    if (providerLower === 'anthropic') return 'anthropic';
    if (providerLower === 'openai') return 'openai';
    if (providerLower === 'ollama') return 'ollama';
    
    return litellmProvider;
  }

  /**
   * Normalize provider name to standard format
   */
  static _normalizeProviderName(litellmProvider) {
    const providerLower = litellmProvider.toLowerCase();
    
    if (providerLower.includes('bedrock')) return 'aws';
    if (providerLower.includes('vertex')) return 'gcp';
    if (providerLower === 'azure_ai') return 'azure_ai';
    if (providerLower === 'azure') return 'azure';
    if (providerLower === 'anthropic') return 'anthropic';
    if (providerLower === 'openai') return 'openai';
    if (providerLower === 'ollama') return 'ollama';
    
    return providerLower;
  }

  /**
   * Get the model configuration for a specific provider
   */
  static async getModelForProvider(provider) {
    await this.ensureInitialized();
    
    const normalizedProvider = provider?.toLowerCase() || 'azure';
    const modelConfig = this._providerModels[normalizedProvider];
    
    if (!modelConfig) {
      // Try to find any available model
      const availableProviders = Object.keys(this._providerModels);
      if (availableProviders.length > 0) {
        getLogger().warn(`[LiteLLMProvider] Provider '${provider}' not found, using first available: ${availableProviders[0]}`);
        return this._providerModels[availableProviders[0]];
      }
      throw new Error(`No models available for provider: ${provider}`);
    }
    
    return modelConfig;
  }

  /**
   * Get available LLM providers (synchronous - matches original API)
   * Returns metadata for all providers that have at least one model available
   */
  static getAvailableLLMProviders() {
    // Ensure registry initialization has started
    if (!this._initPromise) {
      this.initializeRegistry();
    }

    const availableProviders = [];
    const seenProviderIds = new Set();

    for (const providerKey of this._registeredProviderKeys) {
      const metadata = this.PROVIDER_METADATA[providerKey];
      if (metadata && !seenProviderIds.has(metadata.id)) {
        seenProviderIds.add(metadata.id);
        
        // Find the model info for this provider
        const normalizedName = this._normalizeProviderName(providerKey);
        const modelConfig = this._providerModels[normalizedName];
        
        availableProviders.push({
          ...metadata,
          model_name: modelConfig?.model_name,
          model_id: modelConfig?.model_id,
        });
      }
    }

    if (availableProviders.length === 0) {
      getLogger().warn('[LiteLLMProvider] No llm providers configured');
    }

    return availableProviders;
  }

  /**
   * Get the initialized registry (compatibility stub)
   * LiteLLM uses direct API calls, not a registry pattern
   */
  static getRegistry() {
    if (!this._initPromise) {
      this.initializeRegistry();
    }
    // Return this class as the "registry" for compatibility
    return this;
  }

  /**
   * Build model identifier string based on provider type
   * For compatibility with the original llm-provider.js interface
   */
  static buildModelIdentifier(provider) {
    const normalizedProvider = provider?.toLowerCase() || 'azure';
    const modelConfig = this._providerModels[normalizedProvider];
    
    if (modelConfig) {
      return `${modelConfig.litellm_provider}:${modelConfig.model_name}`;
    }
    
    // Fallback to first available
    const firstProvider = Object.keys(this._providerModels)[0];
    if (firstProvider) {
      const config = this._providerModels[firstProvider];
      return `${config.litellm_provider}:${config.model_name}`;
    }
    
    return 'unknown:unknown';
  }

  /**
   * Generate text using LiteLLM OpenAI-compatible API
   */
  static async generateText(prompt, options = {}) {
    const {
      system = '',
      temperature = 0.3,
      maxTokens = 1000,
      provider = null,
    } = options;

    const config = this.getConfig();
    if (!config) {
      throw new Error('LiteLLM not configured - LITELLM_BASE_URL and LITELLM_API_KEY required');
    }

    const { baseUrl, apiKey } = config;
    const modelConfig = await this.getModelForProvider(provider);
    
    // Build the OpenAI-compatible endpoint URL using model ID
    const url = `${baseUrl}/openai/deployments/${modelConfig.model_id}/chat/completions`;

    // Build messages array
    const messages = [];
    if (system) {
      messages.push({ role: 'system', content: system });
    }
    messages.push({ role: 'user', content: prompt });

    // Prepare request body
    const requestBody = {
      model: modelConfig.model_name,
      messages,
      temperature,
      max_tokens: maxTokens,
    };

    getLogger().debug(`[LiteLLMProvider] Generating text with model: ${modelConfig.model_name} (provider: ${provider || 'default'})`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'Content-Type': 'application/json',
          'x-litellm-api-key': apiKey,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LiteLLM API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      
      const text = data.choices?.[0]?.message?.content || '';
      const usage = {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      };

      getLogger().debug(`[LiteLLMProvider] Generated ${usage.completionTokens} tokens`);

      return { response: text, usage };
    } catch (error) {
      getLogger().error(`[LiteLLMProvider] Error generating text: ${error.message}`);
      throw error;
    }
  }

  /**
   * Chat completion with full message history
   * Supports multi-turn conversations
   */
  static async chatCompletion(messages, options = {}) {
    const {
      temperature = 0.3,
      maxTokens = 1000,
      provider = null,
    } = options;

    const config = this.getConfig();
    if (!config) {
      throw new Error('LiteLLM not configured');
    }

    const { baseUrl, apiKey } = config;
    const modelConfig = await this.getModelForProvider(provider);
    
    const url = `${baseUrl}/openai/deployments/${modelConfig.model_id}/chat/completions`;

    const requestBody = {
      model: modelConfig.model_name,
      messages,
      temperature,
      max_tokens: maxTokens,
    };

    getLogger().debug(`[LiteLLMProvider] Chat completion with model: ${modelConfig.model_name}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'Content-Type': 'application/json',
          'x-litellm-api-key': apiKey,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LiteLLM API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      
      return {
        message: data.choices?.[0]?.message || { role: 'assistant', content: '' },
        usage: {
          promptTokens: data.usage?.prompt_tokens || 0,
          completionTokens: data.usage?.completion_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0,
        },
        finishReason: data.choices?.[0]?.finish_reason || 'stop',
        model: data.model,
      };
    } catch (error) {
      getLogger().error(`[LiteLLMProvider] Error in chat completion: ${error.message}`);
      throw error;
    }
  }

  /**
   * Streaming chat completion
   * Returns an async generator that yields chunks
   */
  static async *streamChatCompletion(messages, options = {}) {
    const {
      temperature = 0.3,
      maxTokens = 1000,
      provider = null,
    } = options;

    const config = this.getConfig();
    if (!config) {
      throw new Error('LiteLLM not configured');
    }

    const { baseUrl, apiKey } = config;
    const modelConfig = await this.getModelForProvider(provider);
    
    const url = `${baseUrl}/openai/deployments/${modelConfig.model_id}/chat/completions`;

    const requestBody = {
      model: modelConfig.model_name,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
    };

    getLogger().debug(`[LiteLLMProvider] Streaming chat completion with model: ${modelConfig.model_name}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'Content-Type': 'application/json',
          'x-litellm-api-key': apiKey,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LiteLLM API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const json = JSON.parse(trimmed.slice(6));
            const delta = json.choices?.[0]?.delta;
            if (delta?.content) {
              yield {
                content: delta.content,
                finishReason: json.choices?.[0]?.finish_reason,
              };
            }
          } catch (parseError) {
            // Skip malformed JSON chunks
            getLogger().debug(`[LiteLLMProvider] Skipping malformed chunk: ${trimmed}`);
          }
        }
      }
    } catch (error) {
      getLogger().error(`[LiteLLMProvider] Error in streaming chat completion: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all available models with their full information
   */
  static async getAllModels() {
    await this.ensureInitialized();
    return this._modelsCache.map(model => ({
      name: model.model_name,
      id: model.model_info?.id,
      provider: model.model_info?.litellm_provider,
      customProvider: model.litellm_params?.custom_llm_provider,
      credentialName: model.litellm_params?.litellm_credential_name,
      maxTokens: model.model_info?.max_tokens,
      maxInputTokens: model.model_info?.max_input_tokens,
      maxOutputTokens: model.model_info?.max_output_tokens,
      supportsVision: model.model_info?.supports_vision,
      supportsFunctionCalling: model.model_info?.supports_function_calling,
      supportsStreaming: model.model_info?.supports_native_streaming,
    }));
  }

  /**
   * Clear the models cache
   */
  static clearCache() {
    this._modelsCache = [];
    this._providerModels = {};
    this._registeredProviderKeys = [];
    this._initialized = false;
    this._initPromise = null;
    getLogger().debug('[LiteLLMProvider] Cache cleared');
  }
}

export {
  LLMProviderFactory,
};
