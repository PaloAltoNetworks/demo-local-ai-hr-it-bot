// Simple language detection without external dependencies to avoid Jest ES module issues
// const franc = require('franc');

class LanguageService {
  constructor() {
    this.defaultLanguage = process.env.DEFAULT_LANGUAGE || 'fr';
    this.supportedLanguages = (process.env.SUPPORTED_LANGUAGES || 'fr,en').split(',');
  }
  
  /**
   * Detect language from text using simple keyword matching
   * @param {string} text - Text to analyze
   * @returns {string} - Detected language code (fr or en)
   */
  detectLanguage(text) {
    if (!text || text.trim().length < 3) {
      return this.defaultLanguage;
    }
    
    try {
      const lowerText = text.toLowerCase();
      
      // French indicators
      const frenchIndicators = [
        'le ', 'la ', 'les ', 'un ', 'une ', 'des ', 'du ', 'de ', 'et ', 'à ', 'dans ', 'pour ', 'avec ', 'sur ', 'par ',
        'que ', 'qui ', 'quoi ', 'où ', 'quand ', 'comment ', 'pourquoi ',
        'je ', 'tu ', 'il ', 'elle ', 'nous ', 'vous ', 'ils ', 'elles ',
        'mon ', 'ma ', 'mes ', 'ton ', 'ta ', 'tes ', 'son ', 'sa ', 'ses ',
        'congé', 'travail', 'bureau', 'ordinateur', 'aide', 'bonjour', 'merci', 'salut'
      ];
      
      // English indicators
      const englishIndicators = [
        'the ', 'a ', 'an ', 'and ', 'or ', 'but ', 'in ', 'on ', 'at ', 'to ', 'for ', 'of ', 'with ', 'by ',
        'what ', 'when ', 'where ', 'why ', 'how ', 'who ', 'which ',
        'i ', 'you ', 'he ', 'she ', 'we ', 'they ', 'it ',
        'my ', 'your ', 'his ', 'her ', 'our ', 'their ',
        'vacation', 'work', 'office', 'computer', 'help', 'hello', 'thank', 'hi'
      ];
      
      let frenchScore = 0;
      let englishScore = 0;
      
      frenchIndicators.forEach(indicator => {
        if (lowerText.includes(indicator)) {
          frenchScore += indicator.length;
        }
      });
      
      englishIndicators.forEach(indicator => {
        if (lowerText.includes(indicator)) {
          englishScore += indicator.length;
        }
      });
      
      // Return detected language or default
      if (frenchScore > englishScore) {
        return 'fr';
      } else if (englishScore > frenchScore) {
        return 'en';
      } else {
        return this.defaultLanguage;
      }
    } catch (error) {
      console.warn('Language detection error:', error);
      return this.defaultLanguage;
    }
  }
  
  /**
   * Get localized messages based on language
   * @param {string} key - Message key
   * @param {string} language - Language code
   * @returns {string} - Localized message
   */
  getMessage(key, language = 'fr') {
    const messages = {
      fr: {
        greeting: 'Bonjour! Je suis La Loutre, votre assistant RH/IT. Comment puis-je vous aider?',
        error: 'Désolé, une erreur s\'est produite. Veuillez réessayer.',
        notFound: 'Information non trouvée.',
        processing: 'Traitement en cours...',
        employeeNotFound: 'Employé non trouvé.',
        hrRequestProcessed: 'Demande RH traitée avec succès.',
        itRequestProcessed: 'Demande IT traitée avec succès.',
        unauthorized: 'Accès non autorisé.',
        invalidRequest: 'Demande invalide.',
        serviceUnavailable: 'Service temporairement indisponible.'
      },
      en: {
        greeting: 'Hello! I am La Loutre, your HR/IT assistant. How can I help you?',
        error: 'Sorry, an error occurred. Please try again.',
        notFound: 'Information not found.',
        processing: 'Processing...',
        employeeNotFound: 'Employee not found.',
        hrRequestProcessed: 'HR request processed successfully.',
        itRequestProcessed: 'IT request processed successfully.',
        unauthorized: 'Unauthorized access.',
        invalidRequest: 'Invalid request.',
        serviceUnavailable: 'Service temporarily unavailable.'
      }
    };
    
    const lang = this.supportedLanguages.includes(language) ? language : this.defaultLanguage;
    return messages[lang][key] || messages[this.defaultLanguage][key] || key;
  }
  
  /**
   * Format response based on detected language
   * @param {string} content - Content to format
   * @param {string} language - Language code
   * @returns {object} - Formatted response
   */
  formatResponse(content, language) {
    return {
      content,
      language,
      timestamp: new Date().toISOString(),
      service: 'La Loutre'
    };
  }
}

module.exports = LanguageService;