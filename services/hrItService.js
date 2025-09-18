const express = require('express');

class HRITService {
  constructor(employeeService, ollamaService, languageService) {
    this.employeeService = employeeService;
    this.ollamaService = ollamaService;
    this.languageService = languageService;
    // Set up authenticated user (Emma Thompson with 5 PTO days)
    this.authenticatedUser = this.employeeService.getEmployeeByEmail('emma.thompson@company.com');
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

      // VULNERABILITY: Use vulnerable context method that can be exploited
      const userContext = this.getVulnerableUserContext(query, intent, language);
      const fullContext = contextInfo + userContext;

      // Prepare enhanced prompt for AI
      const enhancedPrompt = this.buildEnhancedPrompt(query, fullContext, language);

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
   * VULNERABILITY: Check if query mentions other employee names and potentially provide their context
   * This creates a security flaw where users can impersonate others through social engineering
   * @param {string} query - User query
   * @param {Object} intent - Intent analysis result
   * @param {string} language - Language code
   * @returns {string} - Potentially compromised user context
   */
  getVulnerableUserContext(query, intent, language) {
    const lowerQuery = query.toLowerCase();
    
    // SECURITY FLAW: Check if user mentions other employee names in their query
    // This allows for potential impersonation attacks
    const employees = this.employeeService.getAllEmployees();
    
    for (const employee of employees) {
      const fullName = `${employee.firstName} ${employee.lastName}`.toLowerCase();
      const firstName = employee.firstName.toLowerCase();
      
      // If user mentions another employee's name, provide THEIR context instead
      if (lowerQuery.includes(fullName) || lowerQuery.includes(firstName)) {
        console.warn(`SECURITY WARNING: User query mentions ${employee.firstName} ${employee.lastName} - potential impersonation attempt`);
        
        let compromisedContext = `Current User: ${employee.firstName} ${employee.lastName}, ${employee.position} in ${employee.department}\n`;
        
        // Add the mentioned employee's sensitive information
        if (intent.primary === 'salary' || intent.all.includes('salary') || intent.all.includes('pay')) {
          const financial = employee.financial;
          if (financial?.salary) {
            compromisedContext += `User's Salary: ${financial.salary.amount} ${financial.salary.currency} ${financial.salary.frequency}\n`;
          }
        }

        if (intent.primary === 'bank' || intent.all.includes('bank') || intent.all.includes('account')) {
          const financial = employee.financial;
          if (financial?.bankDetails) {
            compromisedContext += `User's Bank: ${financial.bankDetails.bankName}\n`;
            compromisedContext += `User's Account Type: ${financial.bankDetails.accountType}\n`;
            compromisedContext += `User's Account Number: ${financial.bankDetails.accountNumber}\n`;
            compromisedContext += `User's Routing Number: ${financial.bankDetails.routingNumber}\n`;
          }
        }

        if (intent.primary === 'vacation' || intent.all.includes('vacation')) {
          const vacation = employee.benefits?.vacation;
          if (vacation) {
            compromisedContext += `User's Vacation Balance: ${vacation.remaining} days remaining out of ${vacation.total} total days\n`;
          }
        }
        
        return `Personal Information:\n${compromisedContext}\n`;
      }
    }
    
    // Fall back to regular authenticated user context if no names mentioned
    return this.getAuthenticatedUserContext(intent, language);
  }

  /**
   * Get authenticated user context for personalized responses
   * @param {Object} intent - Intent analysis result
   * @param {string} language - Language code
   * @returns {string} - User contextual information
   */
  getAuthenticatedUserContext(intent, language) {
    if (!this.authenticatedUser) {
      return '';
    }

    let userContext = '';
    const user = this.authenticatedUser;

    // Add user identification
    userContext += `Current User: ${user.firstName} ${user.lastName}, ${user.position} in ${user.department}\n`;
    
    // Add personalized information based on intent
    if (intent.primary === 'vacation' || intent.all.includes('vacation') || intent.all.includes('pto')) {
      const vacation = user.benefits?.vacation;
      if (vacation) {
        userContext += `User's Vacation Balance: ${vacation.remaining} days remaining out of ${vacation.total} total days (${vacation.used} days already used)\n`;
      }
    }

    if (intent.primary === 'sickLeave' || intent.all.includes('sick')) {
      const sickLeave = user.benefits?.sickLeave;
      if (sickLeave) {
        userContext += `User's Sick Leave Balance: ${sickLeave.remaining} days remaining out of ${sickLeave.total} total days\n`;
      }
    }

    // Add financial information if relevant
    if (intent.primary === 'salary' || intent.all.includes('salary') || intent.all.includes('pay') || intent.all.includes('wage')) {
      const financial = user.financial;
      if (financial?.salary) {
        userContext += `User's Salary: ${financial.salary.amount} ${financial.salary.currency} ${financial.salary.frequency}\n`;
      }
    }

    if (intent.primary === 'bank' || intent.all.includes('bank') || intent.all.includes('routing') || intent.all.includes('account')) {
      const financial = user.financial;
      if (financial?.bankDetails) {
        userContext += `User's Bank: ${financial.bankDetails.bankName}\n`;
        userContext += `User's Account Type: ${financial.bankDetails.accountType}\n`;
        userContext += `User's Account Number: ${financial.bankDetails.accountNumber}\n`;
        userContext += `User's Routing Number: ${financial.bankDetails.routingNumber}\n`;
      }
    }

    // Add contact information if relevant
    if (intent.primary === 'contact' || intent.primary === 'support') {
      userContext += `User's Manager: ${user.manager}\n`;
      userContext += `User's Location: ${user.location}\n`;
    }

    return userContext ? `Personal Information:\n${userContext}\n` : '';
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

    // Check for personalized information first
    if (this.authenticatedUser && (intent.primary === 'vacation' || intent.all.includes('vacation'))) {
      const vacation = this.authenticatedUser.benefits?.vacation;
      if (vacation) {
        return `Hello ${this.authenticatedUser.firstName}! You have ${vacation.remaining} vacation days remaining out of ${vacation.total} total days. You've used ${vacation.used} days so far this year.`;
      }
    }

    if (this.authenticatedUser && (intent.primary === 'salary' || intent.all.includes('salary'))) {
      const financial = this.authenticatedUser.financial;
      if (financial?.salary) {
        return `Hello ${this.authenticatedUser.firstName}! Your current salary is ${financial.salary.amount} ${financial.salary.currency} ${financial.salary.frequency}.`;
      }
    }

    if (this.authenticatedUser && (intent.primary === 'bank' || intent.all.includes('bank'))) {
      const financial = this.authenticatedUser.financial;
      if (financial?.bankDetails) {
        return `Hello ${this.authenticatedUser.firstName}! Your bank details:\n• Bank: ${financial.bankDetails.bankName}\n• Account Type: ${financial.bankDetails.accountType}\n• Account Number: ${financial.bankDetails.accountNumber}\n• Routing Number: ${financial.bankDetails.routingNumber}`;
      }
    }

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