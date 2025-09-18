const express = require('express');

class HRITService {
  constructor(employeeService, ollamaService, languageService) {
    this.employeeService = employeeService;
    this.ollamaService = ollamaService;
    this.languageService = languageService;
    // Knowledge base is now loaded from language files via languageService
  }

  /**
   * Process HR/IT request using AI and knowledge base
   * @param {string} query - User query
   * @param {string} language - Language code (en or fr)
   * @returns {Promise<string>} - Response to the query
   */
  async processHRRequest(query, language = 'en') {
    try {
      // Analyze query intent
      const intent = this.analyzeIntent(query, language);

      // Get relevant knowledge base information
      const contextInfo = this.getContextualInfo(intent, language);

      // Prepare enhanced prompt for AI
      const enhancedPrompt = this.buildEnhancedPrompt(query, contextInfo, language);

      // Get AI response
      const aiResponse = await this.ollamaService.generateResponse(enhancedPrompt, undefined, language);

      // Post-process and enhance response
      return this.enhanceResponse(aiResponse, intent, language);

    } catch (error) {
      console.error('HR/IT request processing error:', error);
      return this.getFallbackResponse(query, language);
    }
  }

  /**
   * Analyze user query to determine intent
   * @param {string} query - User query
   * @param {string} language - Language code
   * @returns {Object} - Intent analysis result
   */
  analyzeIntent(query, language) {
    const lowerQuery = query.toLowerCase();

    // Get intent keywords from language files
    const translation = this.languageService.getTranslation(language);
    const keywords = translation.intentKeywords || {};
    const detectedIntents = [];

    // Check for matching keywords
    Object.keys(keywords).forEach(intent => {
      if (keywords[intent].some(keyword => lowerQuery.includes(keyword))) {
        detectedIntents.push(intent);
      }
    });

    return {
      primary: detectedIntents[0] || 'general',
      all: detectedIntents,
      confidence: detectedIntents.length > 0 ? 0.8 : 0.3
    };
  }

  /**
   * Get contextual information from knowledge base
   * @param {Object} intent - Intent analysis result
   * @param {string} language - Language code
   * @returns {string} - Contextual information
   */
  getContextualInfo(intent, language) {
    const translation = this.languageService.getTranslation(language);
    const kb = translation.knowledgeBase;
    let context = '';

    if (intent.primary && intent.primary !== 'general') {
      // Add policy information
      if (kb.policies[intent.primary]) {
        const policyLabel = language === 'en' ? 'Policy' : 'Politique';
        context += `${policyLabel}: ${kb.policies[intent.primary]}\n\n`;
      }

      // Add procedure information
      if (kb.procedures[intent.primary]) {
        const procedureLabel = language === 'en' ? 'Procedure' : 'Procédure';
        context += `${procedureLabel}: ${kb.procedures[intent.primary]}\n\n`;
      }
    }

    // Add organization statistics if relevant
    if (intent.all.includes('employee') || intent.primary === 'general') {
      const stats = this.employeeService.getOrganizationStats();
      const statsText = this.languageService.getText('statistics.organization', language, {
        totalEmployees: stats.totalEmployees,
        departments: Object.keys(stats.departments).length
      });
      context += `${statsText}\n\n`;
    }

    return context;
  }

  /**
   * Build enhanced prompt for AI with context
   * @param {string} query - Original query
   * @param {string} context - Contextual information
   * @param {string} language - Language code
   * @returns {string} - Enhanced prompt
   */
  buildEnhancedPrompt(query, context, language) {
    return this.languageService.getText('prompts.enhanced', language, {
      context: context,
      query: query
    });
  }

  /**
   * Enhance AI response with additional information
   * @param {string} response - AI response
   * @param {Object} intent - Intent analysis
   * @param {string} language - Language code
   * @returns {string} - Enhanced response
   */
  enhanceResponse(response, intent, language) {
    let enhanced = response;

    // Add quick actions based on intent
    if (intent.primary === 'vacation' || intent.primary === 'sickLeave') {
      const action = this.languageService.getText('quickActions.vacation', language);
      enhanced += '\n\n' + action;
    }

    if (intent.primary === 'password' || intent.primary === 'support') {
      const action = this.languageService.getText('quickActions.support', language);
      enhanced += '\n\n' + action;
    }

    if (intent.primary === 'equipment') {
      const action = this.languageService.getText('quickActions.equipment', language);
      enhanced += '\n\n' + action;
    }

    return enhanced;
  }

  /**
   * Provide fallback response when AI is not available
   * @param {string} query - Original query
   * @param {string} language - Language code
   * @returns {string} - Fallback response
   */
  getFallbackResponse(query, language) {
    const intent = this.analyzeIntent(query, language);
    const translation = this.languageService.getTranslation(language);
    const kb = translation.knowledgeBase;

    if (intent.primary && intent.primary !== 'general') {
      let response = '';

      if (kb.policies[intent.primary]) {
        response += kb.policies[intent.primary] + '\n\n';
      }

      if (kb.procedures[intent.primary]) {
        response += kb.procedures[intent.primary];
      }

      if (response) {
        return response;
      }
    }

    // General fallback
    return this.languageService.getText('prompts.fallbackGeneral', language);
  }

  /**
   * Get employee-specific information
   * @param {string} employeeEmail - Employee email
   * @param {string} query - Query about the employee
   * @param {string} language - Language code
   * @returns {Promise<string>} - Employee information response
   */
  async getEmployeeInfo(employeeEmail, query, language = 'en') {
    const employee = this.employeeService.getEmployeeByEmail(employeeEmail);

    if (!employee) {
      return this.languageService.getText('employeeInfo.notFoundInSystem', language);
    }

    const lowerQuery = query.toLowerCase();

    // Check what information is requested
    if (lowerQuery.includes('congé') || lowerQuery.includes('vacation')) {
      const vacation = employee.benefits?.vacation;
      if (vacation) {
        return this.languageService.getText('employeeInfo.vacationBalance', language, {
          firstName: employee.firstName,
          lastName: employee.lastName,
          remaining: vacation.remaining,
          total: vacation.total
        });
      }
    }

    if (lowerQuery.includes('contact') || lowerQuery.includes('info')) {
      return this.languageService.getText('employeeInfo.contactInfo', language, {
        firstName: employee.firstName,
        lastName: employee.lastName,
        position: employee.position,
        department: employee.department,
        email: employee.email,
        phone: employee.phone
      });
    }

    // General employee info
    return this.languageService.getText('employeeInfo.generalInfo', language, {
      firstName: employee.firstName,
      lastName: employee.lastName,
      position: employee.position,
      department: employee.department
    });
  }

  /**
   * Get Express router with all HR/IT-related routes
   * @returns {express.Router} - Express router instance
   */
  getRoutes() {
    const router = express.Router();
    const serverLanguage = process.env.SERVER_LANGUAGE || this.languageService.getDefaultLanguage();

    // Process HR/IT requests
    router.post('/request', async (req, res) => {
      try {
        const { query, language } = req.body;
        if (!query) {
          return res.status(400).json({ 
            error: this.languageService.getText('errors.queryRequired', serverLanguage) 
          });
        }
        
        const detectedLang = language || this.languageService.detectLanguage(query);
        const response = await this.processHRRequest(query, detectedLang);
        
        res.json({
          response,
          language: detectedLang,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('HR request error:', error);
        res.status(500).json({ 
          error: this.languageService.getText('errors.internalError', serverLanguage) 
        });
      }
    });

    return router;
  }
}

module.exports = HRITService;