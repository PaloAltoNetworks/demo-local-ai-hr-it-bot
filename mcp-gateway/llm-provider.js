/**
 * LLM Provider Abstraction
 * Supports both Ollama (via OpenAI API) and AWS Bedrock
 * This allows easy switching between providers without changing application code
 */

const { OpenAI } = require('openai');
const {
  BedrockRuntimeClient,
  InvokeModelCommand,
} = require('@aws-sdk/client-bedrock-runtime');
const { getLogger } = require('./logger');

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
    getLogger().info(`[LLMProvider] Initialized Ollama OpenAI provider: ${this.model} at ${ollamaUrl}`);
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
    this.region = config.region || process.env.AWS_REGION || 'us-east-1';
    this.modelId = config.modelId || process.env.BEDROCK_COORDINATOR_MODEL || 'anthropic.claude-3-sonnet-20240229-v1:0';
    
    this.client = new BedrockRuntimeClient({ region: this.region });
    getLogger().info(`[LLMProvider] Initialized AWS Bedrock provider: ${this.modelId} in ${this.region}`);
  }

  async generate(prompt, options = {}) {
    const {
      system = '',
      temperature = 0.3,
      maxTokens = 1000,
    } = options;

    if (this.modelId.includes('claude')) {
      return this._generateClaude(prompt, system, temperature, maxTokens);
    } else if (this.modelId.includes('mistral')) {
      return this._generateMistral(prompt, system, temperature, maxTokens);
    } else if (this.modelId.includes('llama')) {
      return this._generateLlama(prompt, system, temperature, maxTokens);
    } else if (this.modelId.includes('gpt-')) {
      return this._generateGPT(prompt, system, temperature, maxTokens);
    } else if (this.modelId.includes('qwen')) {
      return this._generateQwen(prompt, system, temperature, maxTokens);
    }
    
    throw new Error(`Unsupported Bedrock model: ${this.modelId}`);
  }

  async _generateClaude(prompt, system, temperature, maxTokens) {
    const payload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: maxTokens,
      temperature: temperature,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
      ...(system && { system }),
    };

    const response = await this.client.send(
      new InvokeModelCommand({
        modelId: this.modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(payload),
      })
    );

    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const content = responseBody.content?.[0]?.text || '';

    return {
      response: content,
      usage: {
        prompt_tokens: responseBody.usage?.input_tokens || 0,
        completion_tokens: responseBody.usage?.output_tokens || 0,
        total_tokens: (responseBody.usage?.input_tokens || 0) + (responseBody.usage?.output_tokens || 0),
      },
      model: this.modelId,
    };
  }

  async _generateMistral(prompt, system, temperature, maxTokens) {
    // Mistral uses special prompt format
    const instruction = `<s>[INST] ${system ? `${system}\n\n` : ''}${prompt} [/INST]`;

    const payload = {
      prompt: instruction,
      max_tokens: maxTokens,
      temperature: temperature,
    };

    const response = await this.client.send(
      new InvokeModelCommand({
        modelId: this.modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(payload),
      })
    );

    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const content = responseBody.outputs?.[0]?.text || '';

    return {
      response: content,
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
      model: this.modelId,
    };
  }

  async _generateLlama(prompt, system, temperature, maxTokens) {
    // Llama uses special prompt format with tags
    const instruction = `
<|begin_of_text|><|start_header_id|>system<|end_header_id|>
${system || 'You are a helpful assistant.'}
<|eot_id|><|start_header_id|>user<|end_header_id|>
${prompt}
<|eot_id|><|start_header_id|>assistant<|end_header_id|>
`;

    const payload = {
      prompt: instruction,
      max_gen_len: maxTokens,
      temperature: temperature,
      top_p: 0.9,
    };

    const response = await this.client.send(
      new InvokeModelCommand({
        modelId: this.modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(payload),
      })
    );

    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const content = responseBody.generation || '';

    return {
      response: content,
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
      model: this.modelId,
    };
  }

  async _generateGPT(prompt, system, temperature, maxTokens) {
    // GPT models via Bedrock - need to verify payload format
    const payload = {
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: prompt },
      ],
      max_tokens: maxTokens,
      temperature: temperature,
    };

    const response = await this.client.send(
      new InvokeModelCommand({
        modelId: this.modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(payload),
      })
    );

    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const content = responseBody.choices?.[0]?.message?.content || '';

    return {
      response: content,
      usage: {
        prompt_tokens: responseBody.usage?.prompt_tokens || 0,
        completion_tokens: responseBody.usage?.completion_tokens || 0,
        total_tokens: responseBody.usage?.total_tokens || 0,
      },
      model: this.modelId,
    };
  }

  async _generateQwen(prompt, system, temperature, maxTokens) {
    // Qwen format - need to verify
    const payload = {
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: prompt },
      ],
      max_tokens: maxTokens,
      temperature: temperature,
    };

    const response = await this.client.send(
      new InvokeModelCommand({
        modelId: this.modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(payload),
      })
    );

    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const content = responseBody.output?.text || responseBody.choices?.[0]?.message?.content || '';

    return {
      response: content,
      usage: {
        prompt_tokens: responseBody.usage?.prompt_tokens || 0,
        completion_tokens: responseBody.usage?.completion_tokens || 0,
        total_tokens: responseBody.usage?.total_tokens || 0,
      },
      model: this.modelId,
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
          modelId: process.env.BEDROCK_COORDINATOR_MODEL,
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
