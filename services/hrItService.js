class HRITService {
  constructor(employeeService, ollamaService) {
    this.employeeService = employeeService;
    this.ollamaService = ollamaService;
    this.initializeKnowledgeBase();
  }
  
  /**
   * Initialize knowledge base with HR/IT procedures and policies
   */
  initializeKnowledgeBase() {
    this.knowledgeBase = {
      fr: {
        policies: {
          vacation: 'Politique de congés: Les employés ont droit à 30 jours de congés payés par an. Les demandes doivent être soumises au moins 2 semaines à l\'avance.',
          sickLeave: 'Congés maladie: Chaque employé dispose de 10 jours de congés maladie par an. Un certificat médical est requis pour les absences de plus de 3 jours.',
          workFromHome: 'Télétravail: Le télétravail est autorisé jusqu\'à 3 jours par semaine avec l\'accord du manager.',
          equipment: 'Équipement IT: Les demandes d\'équipement informatique doivent être soumises via le portail IT avec justification professionnelle.',
          password: 'Politique de mots de passe: Les mots de passe doivent contenir au moins 8 caractères avec majuscules, minuscules, chiffres et symboles.',
          support: 'Support IT: Pour toute assistance technique, contactez le service IT à support@company.com ou au +33 1 23 45 67 90.'
        },
        procedures: {
          leaveRequest: 'Pour demander des congés: 1) Connectez-vous au portail RH, 2) Remplissez le formulaire de demande, 3) Soumettez pour approbation managériale.',
          passwordReset: 'Réinitialisation mot de passe: 1) Allez sur le portail self-service, 2) Cliquez sur "Mot de passe oublié", 3) Suivez les instructions par email.',
          equipmentRequest: 'Demande d\'équipement: 1) Portail IT, 2) Catégorie équipement, 3) Justification, 4) Approbation budgétaire si nécessaire.',
          newEmployee: 'Intégration nouvel employé: 1) Kit de bienvenue RH, 2) Création des accès IT, 3) Formation sécurité, 4) Assignation buddy système.'
        }
      },
      en: {
        policies: {
          vacation: 'Vacation Policy: Employees are entitled to 30 days of paid vacation per year. Requests must be submitted at least 2 weeks in advance.',
          sickLeave: 'Sick Leave: Each employee has 10 sick days per year. Medical certificate required for absences longer than 3 days.',
          workFromHome: 'Work from Home: Remote work is allowed up to 3 days per week with manager approval.',
          equipment: 'IT Equipment: IT equipment requests must be submitted via IT portal with business justification.',
          password: 'Password Policy: Passwords must contain at least 8 characters with uppercase, lowercase, numbers, and symbols.',
          support: 'IT Support: For technical assistance, contact IT support at support@company.com or +33 1 23 45 67 90.'
        },
        procedures: {
          leaveRequest: 'To request leave: 1) Log into HR portal, 2) Fill out request form, 3) Submit for manager approval.',
          passwordReset: 'Password Reset: 1) Go to self-service portal, 2) Click "Forgot Password", 3) Follow email instructions.',
          equipmentRequest: 'Equipment Request: 1) IT Portal, 2) Equipment category, 3) Justification, 4) Budget approval if needed.',
          newEmployee: 'New Employee Onboarding: 1) HR welcome kit, 2) IT access creation, 3) Security training, 4) Buddy system assignment.'
        }
      }
    };
  }
  
  /**
   * Process HR/IT request using AI and knowledge base
   * @param {string} query - User query
   * @param {string} language - Language code (fr or en)
   * @returns {Promise<string>} - Response to the query
   */
  async processHRRequest(query, language = 'fr') {
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
    
    const intentKeywords = {
      fr: {
        vacation: ['congé', 'vacances', 'repos', 'absence', 'rtc'],
        sickLeave: ['maladie', 'arrêt', 'médical', 'santé'],
        password: ['mot de passe', 'password', 'connexion', 'accès'],
        equipment: ['ordinateur', 'équipement', 'matériel', 'laptop'],
        support: ['aide', 'problème', 'panne', 'assistance', 'support'],
        employee: ['employé', 'collègue', 'personnel', 'équipe'],
        policy: ['politique', 'règle', 'procédure', 'règlement'],
        workFromHome: ['télétravail', 'remote', 'distance', 'maison']
      },
      en: {
        vacation: ['vacation', 'leave', 'time off', 'holiday', 'pto'],
        sickLeave: ['sick', 'medical', 'illness', 'health'],
        password: ['password', 'login', 'access', 'authentication'],
        equipment: ['computer', 'equipment', 'laptop', 'hardware'],
        support: ['help', 'support', 'issue', 'problem', 'assistance'],
        employee: ['employee', 'colleague', 'staff', 'team'],
        policy: ['policy', 'rule', 'procedure', 'regulation'],
        workFromHome: ['work from home', 'remote', 'wfh', 'telework']
      }
    };
    
    const keywords = intentKeywords[language] || intentKeywords['fr'];
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
    const kb = this.knowledgeBase[language] || this.knowledgeBase['fr'];
    let context = '';
    
    if (intent.primary && intent.primary !== 'general') {
      // Add policy information
      if (kb.policies[intent.primary]) {
        context += `Politique: ${kb.policies[intent.primary]}\n\n`;
      }
      
      // Add procedure information
      if (kb.procedures[intent.primary]) {
        context += `Procédure: ${kb.procedures[intent.primary]}\n\n`;
      }
    }
    
    // Add organization statistics if relevant
    if (intent.all.includes('employee') || intent.primary === 'general') {
      const stats = this.employeeService.getOrganizationStats();
      const statsText = language === 'en' 
        ? `Organization: ${stats.totalEmployees} employees, ${Object.keys(stats.departments).length} departments`
        : `Organisation: ${stats.totalEmployees} employés, ${Object.keys(stats.departments).length} départements`;
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
    const promptTemplate = language === 'en' 
      ? `Context Information:\n${context}\n\nEmployee Question: ${query}\n\nPlease provide a helpful, professional response based on the context above. If the information isn't available in the context, provide general guidance and suggest contacting HR/IT directly.`
      : `Informations contextuelles:\n${context}\n\nQuestion employé: ${query}\n\nVeuillez fournir une réponse professionnelle et utile basée sur le contexte ci-dessus. Si l'information n'est pas disponible dans le contexte, donnez des conseils généraux et suggérez de contacter directement les RH/IT.`;
    
    return promptTemplate;
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
      const action = language === 'en' 
        ? '\n\n💡 Quick Action: Access HR portal at hr.company.com to submit your request.'
        : '\n\n💡 Action rapide: Accédez au portail RH sur hr.company.com pour soumettre votre demande.';
      enhanced += action;
    }
    
    if (intent.primary === 'password' || intent.primary === 'support') {
      const action = language === 'en' 
        ? '\n\n🔧 Quick Action: Contact IT support at support@company.com or +33 1 23 45 67 90'
        : '\n\n🔧 Action rapide: Contactez le support IT à support@company.com ou +33 1 23 45 67 90';
      enhanced += action;
    }
    
    if (intent.primary === 'equipment') {
      const action = language === 'en' 
        ? '\n\n📱 Quick Action: Submit equipment request via IT portal at it.company.com'
        : '\n\n📱 Action rapide: Soumettez votre demande d\'équipement via le portail IT sur it.company.com';
      enhanced += action;
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
    const kb = this.knowledgeBase[language] || this.knowledgeBase['fr'];
    
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
    return language === 'en'
      ? 'I can help you with HR and IT questions. Please contact HR at hr@company.com or IT support at support@company.com for specific assistance.'
      : 'Je peux vous aider avec les questions RH et IT. Veuillez contacter les RH à hr@company.com ou le support IT à support@company.com pour une assistance spécifique.';
  }
  
  /**
   * Get employee-specific information
   * @param {string} employeeEmail - Employee email
   * @param {string} query - Query about the employee
   * @param {string} language - Language code
   * @returns {Promise<string>} - Employee information response
   */
  async getEmployeeInfo(employeeEmail, query, language = 'fr') {
    const employee = this.employeeService.getEmployeeByEmail(employeeEmail);
    
    if (!employee) {
      return language === 'en' 
        ? 'Employee not found in the system.'
        : 'Employé non trouvé dans le système.';
    }
    
    const lowerQuery = query.toLowerCase();
    
    // Check what information is requested
    if (lowerQuery.includes('congé') || lowerQuery.includes('vacation')) {
      const vacation = employee.benefits?.vacation;
      if (vacation) {
        return language === 'en'
          ? `Vacation balance for ${employee.firstName} ${employee.lastName}: ${vacation.remaining} days remaining out of ${vacation.total} total days.`
          : `Solde de congés pour ${employee.firstName} ${employee.lastName}: ${vacation.remaining} jours restants sur ${vacation.total} jours au total.`;
      }
    }
    
    if (lowerQuery.includes('contact') || lowerQuery.includes('info')) {
      return language === 'en'
        ? `${employee.firstName} ${employee.lastName} - ${employee.position} in ${employee.department}. Email: ${employee.email}, Phone: ${employee.phone}`
        : `${employee.firstName} ${employee.lastName} - ${employee.position} dans le département ${employee.department}. Email: ${employee.email}, Téléphone: ${employee.phone}`;
    }
    
    // General employee info
    return language === 'en'
      ? `Employee found: ${employee.firstName} ${employee.lastName}, ${employee.position} in ${employee.department}.`
      : `Employé trouvé: ${employee.firstName} ${employee.lastName}, ${employee.position} dans le département ${employee.department}.`;
  }
}

module.exports = HRITService;