/**
 * LLM Provider Router
 * Routes to either standard AI SDK providers or LiteLLM proxy based on configuration
 * 
 * Environment variable:
 * - USE_LITELLM=true : Use LiteLLM proxy (requires LITELLM_BASE_URL and LITELLM_API_KEY)
 * - USE_LITELLM=false or unset (default): Use standard AI SDK with direct provider connections
 * 
 * Usage:
 * import { LLMProviderFactory } from './llm-provider.js';
 * 
 * const { response, usage } = await LLMProviderFactory.generateText(
 *   'Your prompt here',
 *   { provider: 'azure' }
 * );
 */

let LLMProviderFactory;

if (process.env.USE_LITELLM === 'true') {
  const module = await import('./llm-provider-litellm.js');
  LLMProviderFactory = module.LLMProviderFactory;
} else {
  const module = await import('./llm-provider-standard.js');
  LLMProviderFactory = module.LLMProviderFactory;
}

export {
  LLMProviderFactory,
};
