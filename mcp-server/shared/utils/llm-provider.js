/**
 * LLM Provider Abstraction for MCP Agents
 * Supports both Ollama (via OpenAI API) and AWS Bedrock
 * This allows agents to use any LLM provider without code changes
 */

import { OpenAI } from 'openai';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';

/**
 * Base LLM Provider Interface
 */
class LLMProvider {
  async processQuery(systemPrompt, query) {
    throw new Error('processQuery() must be implemented');
  }

  async getAvailableModels() {
    throw new Error('getAvailableModels() must be implemented');
  }

  getMetadata() {
    throw new Error('getMetadata() must be implemented');
  }
}

/**
 * Ollama via OpenAI API
 * Uses Ollama's OpenAI-compatible endpoint
 */
class OllamaOpenAIProvider extends LLMProvider {
  constructor(config = {}) {
    super();
    const ollamaUrl = config.ollamaUrl || process.env.OLLAMA_URL || 'http://localhost:11434';
    const model = config.model || process.env.AGENT_MODEL || 'qwen2.5:1.5b';
    const temperature = config.temperature || 0.3;

    this.client = new OpenAI({
      apiKey: 'ollama', // Ollama doesn't require a real API key
      baseURL: `${ollamaUrl}/v1`,
    });

    this.model = model;
    this.temperature = temperature;
    this.ollamaUrl = ollamaUrl;
  }

  async processQuery(systemPrompt, query) {
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: query }
    ];

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: messages,
      temperature: this.temperature,
      max_tokens: 2000,
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

  async getAvailableModels() {
    // For OpenAI-compatible endpoint, we can try to list models
    // This might not work with all endpoints, so we have a fallback
    try {
      const models = await this.client.models.list();
      return models.data.map(m => m.id) || [this.model];
    } catch (error) {
      // Fallback to just returning the configured model
      return [this.model];
    }
  }

  getMetadata() {
    return {
      provider: 'ollama',
      model: this.model,
      url: this.ollamaUrl,
      temperature: this.temperature
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
    this.modelId = config.modelId || process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0';
    this.temperature = config.temperature || 0.3;

    this.client = new BedrockRuntimeClient({ region: this.region });
  }

  async processQuery(systemPrompt, query) {
    if (this.modelId.includes('claude')) {
      return this._processClaudeQuery(systemPrompt, query);
    } else if (this.modelId.includes('mistral')) {
      return this._processMistralQuery(systemPrompt, query);
    } else if (this.modelId.includes('llama')) {
      return this._processLlamaQuery(systemPrompt, query);
    } else if (this.modelId.includes('gpt-')) {
      return this._processGPTQuery(systemPrompt, query);
    } else if (this.modelId.includes('qwen')) {
      return this._processQwenQuery(systemPrompt, query);
    }

    throw new Error(`Unsupported Bedrock model: ${this.modelId}`);
  }

  async _processClaudeQuery(systemPrompt, query) {
    const payload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 2000,
      temperature: this.temperature,
      messages: [{ role: 'user', content: [{ type: 'text', text: query }] }],
      ...(systemPrompt && { system: systemPrompt }),
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

  async _processMistralQuery(systemPrompt, query) {
    // Mistral uses special prompt format
    const instruction = `<s>[INST] ${systemPrompt ? `${systemPrompt}\n\n` : ''}${query} [/INST]`;

    const payload = {
      prompt: instruction,
      max_tokens: 2000,
      temperature: this.temperature,
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

  async _processLlamaQuery(systemPrompt, query) {
    // Llama uses special prompt format with tags
    const instruction = `
<|begin_of_text|><|start_header_id|>system<|end_header_id|>
${systemPrompt || 'You are a helpful assistant.'}
<|eot_id|><|start_header_id|>user<|end_header_id|>
${query}
<|eot_id|><|start_header_id|>assistant<|end_header_id|>
`;

    const payload = {
      prompt: instruction,
      max_gen_len: 2000,
      temperature: this.temperature,
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

  async _processGPTQuery(systemPrompt, query) {
    // GPT models via Bedrock
    const payload = {
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        { role: 'user', content: query },
      ],
      max_tokens: 2000,
      temperature: this.temperature,
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

  async _processQwenQuery(systemPrompt, query) {
    // Qwen format
    const payload = {
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        { role: 'user', content: query },
      ],
      max_tokens: 2000,
      temperature: this.temperature,
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

  async _processClaudeQuery(systemPrompt, query) {
    const messages = [{ role: 'user', content: [{ type: 'text', text: query }] }];

    const payload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 2000,
      temperature: this.temperature,
      system: systemPrompt,
      messages: messages,
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

  async _processMistralQuery(systemPrompt, query) {
    // Build the message with system prompt if provided
    let messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: query });

    const payload = {
      max_tokens: 2000,
      temperature: this.temperature,
      messages: messages,
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

  async _processLlamaQuery(systemPrompt, query) {
    // Meta Llama models use a similar format to Mistral
    let messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: query });

    const payload = {
      max_tokens: 2000,
      temperature: this.temperature,
      messages: messages,
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

  async _processGPTQuery(systemPrompt, query) {
    // OpenAI GPT models via Bedrock use OpenAI-compatible format
    let messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: query });

    const body = {
      model: this.modelId,
      max_tokens: 2000,
      temperature: this.temperature,
      messages: messages,
    };

    const response = await this.client.invoke({
      modelId: this.modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(body),
    });

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

  async _processQwenQuery(systemPrompt, query) {
    // Alibaba Qwen models use a similar format to Mistral/Llama
    let messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: query });

    const body = {
      model: this.modelId,
      max_tokens: 2000,
      temperature: this.temperature,
      messages: messages,
    };

    const response = await this.client.invoke({
      modelId: this.modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(body),
    });

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

  async getAvailableModels() {
    // Bedrock doesn't have a list models API that requires authorization
    // Return just the configured model
    return [this.modelId];
  }

  getMetadata() {
    return {
      provider: 'bedrock',
      model: this.modelId,
      region: this.region,
      temperature: this.temperature
    };
  }
}

/**
 * Factory for creating LLM providers
 */
class LLMProviderFactory {
  static create(providerType = null, config = {}) {
    const provider = providerType || process.env.LLM_PROVIDER || 'ollama';

    switch (provider.toLowerCase()) {
      case 'ollama':
        return new OllamaOpenAIProvider({
          ollamaUrl: process.env.OLLAMA_URL,
          model: process.env.AGENT_MODEL,
          temperature: 0.3,
          ...config
        });

      case 'bedrock':
        return new BedrockProvider({
          region: process.env.AWS_REGION,
          modelId: process.env.BEDROCK_MODEL_ID,
          temperature: 0.3,
          ...config
        });

      default:
        throw new Error(`Unknown LLM provider: ${provider}`);
    }
  }
}

export {
  LLMProvider,
  OllamaOpenAIProvider,
  BedrockProvider,
  LLMProviderFactory,
};
