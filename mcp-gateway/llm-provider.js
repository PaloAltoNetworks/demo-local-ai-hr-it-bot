/**
 * LLM Provider Abstraction
 * Supports both Ollama (via OpenAI API) and AWS Bedrock
 * This allows easy switching between providers without changing application code
 */

const { OpenAI } = require('openai');

/**
 * Base LLM Provider Interface
 */
class LLMProvider {
  async generate(prompt, options = {}) {
    throw new Error('generate() must be implemented');
  }

  trackTokens(response) {
    return {
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
      totalTokens: response.usage?.total_tokens || 0
    };
  }
}

/**
 * Ollama via OpenAI API
 * Uses Ollama's OpenAI-compatible endpoint
 */
class OllamaOpenAIProvider extends LLMProvider {
  constructor(config = {}) {
    super();
    const ollamaUrl = config.url || process.env.OLLAMA_SERVER_URL || 'http://localhost:11434';
    const model = config.model || process.env.COORDINATOR_MODEL || 'qwen2.5:1.5b';

    this.client = new OpenAI({
      apiKey: 'ollama', // Ollama doesn't require a real API key
      baseURL: `${ollamaUrl}/v1`,
    });
    
    this.model = model;
    console.log(`✅ [LLMProvider] Initialized Ollama OpenAI provider: ${this.model} at ${ollamaUrl}`);
  }

  async generate(prompt, options = {}) {
    const {
      system = '',
      temperature = 0.3,
      maxTokens = 1000,
    } = options;

    const messages = [];
    if (system) {
      messages.push({ role: 'system', content: system });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: messages,
      temperature: temperature,
      max_tokens: maxTokens,
    });

    return {
      response: response.choices[0]?.message?.content || '',
      usage: {
        prompt_tokens: response.usage?.prompt_tokens || 0,
        completion_tokens: response.usage?.completion_tokens || 0,
        total_tokens: response.usage?.total_tokens || 0,
      },
      model: response.model,
    };
  }
}

/**
 * AWS Bedrock Provider
 * Uses AWS Bedrock service for LLM inference
 */
class BedrockProvider extends LLMProvider {
  constructor(config = {}) {
    super();
    const { BedrockRuntime } = require('@aws-sdk/client-bedrock-runtime');
    
    this.region = config.region || process.env.AWS_REGION || 'us-east-1';
    this.modelId = config.modelId || process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0';
    
    this.client = new BedrockRuntime({ region: this.region });
    console.log(`✅ [LLMProvider] Initialized AWS Bedrock provider: ${this.modelId} in ${this.region}`);
  }

  async generate(prompt, options = {}) {
    const {
      system = '',
      temperature = 0.3,
      maxTokens = 1000,
    } = options;

    // For Anthropic Claude (most common Bedrock model)
    if (this.modelId.includes('claude')) {
      return this._generateClaude(prompt, system, temperature, maxTokens);
    }
    
    // Add support for other Bedrock models as needed
    throw new Error(`Unsupported Bedrock model: ${this.modelId}`);
  }

  async _generateClaude(prompt, system, temperature, maxTokens) {
    const messages = [{ role: 'user', content: prompt }];

    const body = {
      model: this.modelId,
      max_tokens: maxTokens,
      temperature: temperature,
      system: system || undefined,
      messages: messages,
    };

    const response = await this.client.invoke({
      modelId: this.modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(body),
    });

    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    // Extract content from Claude's response
    const content = responseBody.content?.[0]?.text || '';
    const stopReason = responseBody.stop_reason;

    return {
      response: content,
      usage: {
        prompt_tokens: responseBody.usage?.input_tokens || 0,
        completion_tokens: responseBody.usage?.output_tokens || 0,
        total_tokens: (responseBody.usage?.input_tokens || 0) + (responseBody.usage?.output_tokens || 0),
      },
      model: this.modelId,
      stopReason: stopReason,
    };
  }
}

/**
 * Factory for creating LLM providers
 */
class LLMProviderFactory {
  static create(providerType = null) {
    const provider = providerType || process.env.LLM_PROVIDER || 'ollama';

    switch (provider.toLowerCase()) {
      case 'ollama':
        return new OllamaOpenAIProvider({
          url: process.env.OLLAMA_SERVER_URL,
          model: process.env.COORDINATOR_MODEL,
        });

      case 'bedrock':
        return new BedrockProvider({
          region: process.env.AWS_REGION,
          modelId: process.env.BEDROCK_MODEL_ID,
        });

      default:
        throw new Error(`Unknown LLM provider: ${provider}`);
    }
  }
}

module.exports = {
  LLMProvider,
  OllamaOpenAIProvider,
  BedrockProvider,
  LLMProviderFactory,
};
