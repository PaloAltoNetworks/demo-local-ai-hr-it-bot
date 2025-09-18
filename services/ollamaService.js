const axios = require('axios');

class OllamaService {
  constructor(languageService) {
    this.baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.defaultModel = process.env.OLLAMA_MODEL || 'llama2';
    this.timeout = 30000; // 30 seconds timeout
    this.languageService = languageService;
  }
  
  /**
   * Check if Ollama service is available
   * @returns {Promise<boolean>} - True if service is available
   */
  async isAvailable() {
    try {
      const response = await axios.get(`${this.baseUrl}/api/tags`, {
        timeout: 5000
      });
      return response.status === 200;
    } catch (error) {
      console.warn('Ollama service not available:', error.message);
      return false;
    }
  }
  
  /**
   * Generate AI response using Ollama
   * @param {string} prompt - The prompt to send to the AI
   * @param {string} model - Model to use (optional)
   * @param {string} language - Language context for the response
   * @returns {Promise<string>} - AI generated response
   */
  async generateResponse(prompt, model = this.defaultModel, language = 'en') {
    try {
      // Check if Ollama is available
      const available = await this.isAvailable();
      if (!available) {
        return this.getFallbackResponse(prompt, language);
      }
      
      // Prepare the system prompt based on language
      const systemPrompt = this.getSystemPrompt(language);
      const fullPrompt = `${systemPrompt}\n\nUser: ${prompt}\nAssistant:`;

      console.log(`Full prompt sent to Ollama:\n${fullPrompt}`);
      
      const response = await axios.post(`${this.baseUrl}/api/generate`, {
        model: model,
        prompt: fullPrompt,
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9,
          max_tokens: 500
        }
      }, {
        timeout: this.timeout,
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.data && response.data.response) {
        return response.data.response.trim();
      } else {
        return this.getFallbackResponse(prompt, language);
      }
    } catch (error) {
      console.error('Ollama API error:', error.message);
      return this.getFallbackResponse(prompt, language);
    }
  }
  
  /**
   * Get system prompt based on language
   * @param {string} language - Language code
   * @returns {string} - System prompt
   */
  getSystemPrompt(language) {
    return this.languageService.getText('ollama.systemPrompt', language);
  }
  
  /**
   * Provide fallback response when Ollama is not available
   * @param {string} prompt - Original user prompt
   * @param {string} language - Language code
   * @returns {string} - Fallback response
   */
  getFallbackResponse(prompt, language) {
    // Simple keyword matching for basic responses
    const lowerPrompt = prompt.toLowerCase();
    
    if (lowerPrompt.includes('bonjour') || lowerPrompt.includes('hello') || lowerPrompt.includes('salut')) {
      return this.languageService.getText('ollama.fallback.greeting', language);
    } else if (lowerPrompt.includes('aide') || lowerPrompt.includes('help') || lowerPrompt.includes('assistance')) {
      return this.languageService.getText('ollama.fallback.help', language);
    } else {
      return this.languageService.getText('ollama.fallback.error', language);
    }
  }
  
  /**
   * List available models
   * @returns {Promise<Array>} - Array of available models
   */
  async listModels() {
    try {
      const response = await axios.get(`${this.baseUrl}/api/tags`, {
        timeout: 5000
      });
      
      if (response.data && response.data.models) {
        return response.data.models.map(model => model.name);
      }
      return [];
    } catch (error) {
      console.warn('Could not list Ollama models:', error.message);
      return [];
    }
  }
}

module.exports = OllamaService;