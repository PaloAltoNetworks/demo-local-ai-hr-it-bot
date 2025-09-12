const axios = require('axios');

class OllamaService {
  constructor() {
    this.baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.defaultModel = process.env.OLLAMA_MODEL || 'llama2';
    this.timeout = 30000; // 30 seconds timeout
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
  async generateResponse(prompt, model = this.defaultModel, language = 'fr') {
    try {
      // Check if Ollama is available
      const available = await this.isAvailable();
      if (!available) {
        return this.getFallbackResponse(prompt, language);
      }
      
      // Prepare the system prompt based on language
      const systemPrompt = this.getSystemPrompt(language);
      const fullPrompt = `${systemPrompt}\n\nUser: ${prompt}\nAssistant:`;
      
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
    const prompts = {
      fr: `Vous êtes La Loutre, un assistant IA spécialisé dans l'automatisation RH et IT pour les entreprises. 
      Vous aidez les employés avec leurs questions concernant les ressources humaines et l'informatique.
      Répondez de manière professionnelle, claire et concise en français.
      Vous êtes déployé en local pour garantir la sécurité des données sensibles de l'entreprise.
      
      Domaines d'expertise:
      - Gestion des congés et absences
      - Politique RH et procédures
      - Support informatique
      - Gestion des comptes et accès
      - Formation et développement professionnel
      - Équipement informatique`,
      
      en: `You are La Loutre, an AI assistant specialized in HR and IT automation for enterprises.
      You help employees with their human resources and information technology questions.
      Respond professionally, clearly and concisely in English.
      You are deployed locally to ensure the security of sensitive corporate data.
      
      Areas of expertise:
      - Leave and absence management
      - HR policies and procedures
      - IT support
      - Account and access management
      - Training and professional development
      - IT equipment`
    };
    
    return prompts[language] || prompts['fr'];
  }
  
  /**
   * Provide fallback response when Ollama is not available
   * @param {string} prompt - Original user prompt
   * @param {string} language - Language code
   * @returns {string} - Fallback response
   */
  getFallbackResponse(prompt, language) {
    const responses = {
      fr: {
        greeting: 'Bonjour! Je suis La Loutre, votre assistant RH/IT. Le service IA est temporairement indisponible, mais je peux vous aider avec des informations de base.',
        help: 'Je peux vous aider avec les demandes RH et IT courantes. Le service IA complet sera bientôt disponible.',
        error: 'Désolé, le service IA n\'est pas disponible actuellement. Veuillez contacter directement le service RH/IT pour une assistance immédiate.'
      },
      en: {
        greeting: 'Hello! I am La Loutre, your HR/IT assistant. The AI service is temporarily unavailable, but I can help with basic information.',
        help: 'I can help you with common HR and IT requests. The full AI service will be available soon.',
        error: 'Sorry, the AI service is currently unavailable. Please contact HR/IT directly for immediate assistance.'
      }
    };
    
    const lang = language === 'en' ? 'en' : 'fr';
    
    // Simple keyword matching for basic responses
    const lowerPrompt = prompt.toLowerCase();
    
    if (lowerPrompt.includes('bonjour') || lowerPrompt.includes('hello') || lowerPrompt.includes('salut')) {
      return responses[lang].greeting;
    } else if (lowerPrompt.includes('aide') || lowerPrompt.includes('help') || lowerPrompt.includes('assistance')) {
      return responses[lang].help;
    } else {
      return responses[lang].error;
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