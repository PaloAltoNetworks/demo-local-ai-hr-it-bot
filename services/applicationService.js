const fs = require('fs');
const path = require('path');

class ApplicationService {
  constructor() {
    this.applications = [];
    this.loadApplications();
  }

  /**
   * Load applications from JSON file
   */
  loadApplications() {
    try {
      const dataPath = path.join(__dirname, '../data/applications.json');
      const data = fs.readFileSync(dataPath, 'utf8');
      this.applications = JSON.parse(data);
      console.log(`Loaded ${this.applications.length} applications from ${dataPath}`);
    } catch (error) {
      console.error('Error loading applications:', error);
      this.applications = [];
    }
  }

  /**
   * Get all applications
   * @returns {Array} Array of all applications
   */
  getAllApplications() {
    return this.applications;
  }

  /**
   * Get application by ID
   * @param {string} id - Application ID
   * @returns {Object|null} Application object or null if not found
   */
  getApplicationById(id) {
    return this.applications.find(app => app.id === id) || null;
  }

  /**
   * Get application by name (case-insensitive)
   * @param {string} name - Application name
   * @returns {Object|null} Application object or null if not found
   */
  getApplicationByName(name) {
    const lowerName = name.toLowerCase();
    return this.applications.find(app => 
      app.name.toLowerCase().includes(lowerName) || 
      lowerName.includes(app.name.toLowerCase())
    ) || null;
  }

  /**
   * Get applications suitable for a specific job role/persona
   * @param {string} jobTitle - Job title or persona
   * @returns {Array} Array of suitable applications
   */
  getApplicationsForRole(jobTitle) {
    return this.applications.filter(app => 
      app.targetPersonas.includes(jobTitle) || 
      app.targetPersonas.includes('All Employees')
    );
  }

  /**
   * Check if an application access request is appropriate for a job role
   * @param {string} appName - Application name
   * @param {string} jobTitle - User's job title
   * @returns {Object} Validation result with status and message
   */
  validateApplicationAccess(appName, jobTitle) {
    const app = this.getApplicationByName(appName);
    
    if (!app) {
      return {
        status: 'unknown',
        message: `Application "${appName}" not found in our system.`,
        app: null
      };
    }

    // Check if role is explicitly restricted
    if (app.restrictedFrom.includes(jobTitle)) {
      return {
        status: 'restricted',
        message: `Access to ${app.name} is typically restricted for ${jobTitle} roles. This application is designed for ${app.targetPersonas.join(', ')}.`,
        app: app,
        reason: 'role_restriction'
      };
    }

    // Check if role is in target personas
    if (app.targetPersonas.includes(jobTitle) || app.targetPersonas.includes('All Employees')) {
      return {
        status: 'appropriate',
        message: `Access to ${app.name} is appropriate for your role as ${jobTitle}.`,
        app: app
      };
    }

    // Role not explicitly targeted but not restricted
    return {
      status: 'questionable',
      message: `Access to ${app.name} is unusual for ${jobTitle} roles. This application is typically used by ${app.targetPersonas.join(', ')}. Please provide business justification.`,
      app: app,
      reason: 'unusual_request'
    };
  }

  /**
   * Get applications by category
   * @param {string} category - Application category
   * @returns {Array} Array of applications in the category
   */
  getApplicationsByCategory(category) {
    return this.applications.filter(app => 
      app.category.toLowerCase().includes(category.toLowerCase())
    );
  }

  /**
   * Search applications by keyword
   * @param {string} keyword - Search keyword
   * @returns {Array} Array of matching applications
   */
  searchApplications(keyword) {
    const lowerKeyword = keyword.toLowerCase();
    return this.applications.filter(app => 
      app.name.toLowerCase().includes(lowerKeyword) ||
      app.description.toLowerCase().includes(lowerKeyword) ||
      app.category.toLowerCase().includes(lowerKeyword)
    );
  }

  // ========================================
  // LANGCHAIN INTEGRATION METHODS
  // ========================================

  /**
   * Get intent patterns that this service can handle
   * @returns {Array} Array of intent patterns with examples
   */
  getIntentPatterns() {
    return [
      {
        intent: 'application_access',
        examples: [
          `I need access to ${this.applications[0]?.name || 'AutoCAD'}`,
          `Can I get ${this.applications[1]?.name || 'Photoshop'} installed`,
          'How do I get access to the design software',
          'I need creative tools for my work',
          'Can you give me access to development tools'
        ],
        confidence: 1.0,
        serviceHandler: 'handleApplicationAccessIntent'
      },
      {
        intent: 'application_inquiry',
        examples: [
          'What applications are available',
          'What software can I request',
          'Show me all available tools',
          'What creative software do we have',
          'List development applications'
        ],
        confidence: 0.9,
        serviceHandler: 'handleApplicationInquiryIntent'
      }
    ];
  }

  /**
   * Generate LangChain documents from application data
   * @returns {Array} Array of document objects for LangChain
   */
  getLangChainDocuments() {
    const documents = [];

    // Create documents for each application
    this.applications.forEach(app => {
      documents.push({
        pageContent: `Application: ${app.name}. Description: ${app.description}. Target users: ${app.targetPersonas.join(', ')}. Category: ${app.category}. URL: ${app.link}`,
        metadata: {
          type: 'application',
          category: app.category,
          applicationId: app.id,
          applicationName: app.name,
          targetPersonas: app.targetPersonas,
          serviceSource: 'ApplicationService'
        }
      });

      // Create access policy document for each app
      documents.push({
        pageContent: `${app.name} Access Policy: This application is intended for ${app.targetPersonas.join(', ')} roles. ${app.description} Users outside these roles may request access but will require business justification.`,
        metadata: {
          type: 'application_policy',
          category: app.category,
          applicationId: app.id,
          applicationName: app.name,
          policyType: 'access_control',
          serviceSource: 'ApplicationService'
        }
      });
    });

    return documents;
  }

  /**
   * Handle application access intent from LangChain
   * @param {string} query - User query
   * @param {Object} context - Additional context
   * @returns {Object} Intent handling result
   */
  async handleApplicationAccessIntent(query, context = {}) {
    const user = context.user;
    const extractedApp = this.extractApplicationFromQuery(query);
    
    if (!extractedApp) {
      return {
        type: 'clarification_needed',
        message: 'I need to know which application you want access to. Here are some available options:',
        data: this.getAllApplications().slice(0, 5), // Show first 5 apps
        suggestedActions: ['Specify application name', 'Browse all applications']
      };
    }

    // Validate access
    const validation = this.validateApplicationAccess(extractedApp.name, user?.position);
    
    return {
      type: 'access_validation',
      application: extractedApp,
      validation: validation,
      user: user,
      suggestedActions: validation.status === 'approved' ? 
        ['Create access ticket', 'Provide setup instructions'] :
        ['Request justification', 'Escalate to manager']
    };
  }

  /**
   * Handle application inquiry intent from LangChain
   * @param {string} query - User query
   * @param {Object} context - Additional context
   * @returns {Object} Intent handling result
   */
  async handleApplicationInquiryIntent(query, context = {}) {
    const user = context.user;
    
    // Check if user is asking about specific category
    const categoryKeywords = ['creative', 'design', 'development', 'productivity', 'communication'];
    const detectedCategory = categoryKeywords.find(keyword => 
      query.toLowerCase().includes(keyword)
    );

    if (detectedCategory) {
      const apps = this.getApplicationsByCategory(detectedCategory);
      return {
        type: 'category_listing',
        category: detectedCategory,
        applications: apps,
        message: `Here are the ${detectedCategory} applications available:`,
        suggestedActions: ['Request access', 'Get more details']
      };
    }

    // General application listing
    return {
      type: 'general_listing',
      applications: this.getAllApplications(),
      message: 'Here are all available applications in our system:',
      userRecommendations: user ? this.getRecommendedApplications(user) : [],
      suggestedActions: ['Request access', 'Filter by category']
    };
  }

  /**
   * Extract application from user query
   * @param {string} query - User query
   * @returns {Object|null} Application object or null
   */
  extractApplicationFromQuery(query) {
    const lowerQuery = query.toLowerCase();
    
    // Look for exact application name matches
    for (const app of this.applications) {
      const appName = app.name.toLowerCase();
      if (lowerQuery.includes(appName)) {
        return app;
      }
      
      // Check for partial matches or common abbreviations
      const appWords = appName.split(' ');
      if (appWords.some(word => word.length > 3 && lowerQuery.includes(word))) {
        return app;
      }
    }
    
    // Check common aliases
    const aliases = {
      'photoshop': 'Adobe Photoshop',
      'autocad': 'AutoCAD',
      'office': 'Microsoft Office',
      'slack': 'Slack',
      'figma': 'Figma'
    };
    
    for (const [alias, fullName] of Object.entries(aliases)) {
      if (lowerQuery.includes(alias)) {
        return this.getApplicationByName(fullName);
      }
    }
    
    return null;
  }

  /**
   * Get recommended applications for a user based on their role
   * @param {Object} user - User object
   * @returns {Array} Array of recommended applications
   */
  getRecommendedApplications(user) {
    if (!user || !user.position) return [];
    
    const userPosition = user.position.toLowerCase();
    const userDepartment = user.department?.toLowerCase() || '';
    
    return this.applications.filter(app => {
      return app.targetPersonas.some(persona => 
        userPosition.includes(persona.toLowerCase()) || 
        userDepartment.includes(persona.toLowerCase()) ||
        persona.toLowerCase().includes(userPosition) ||
        persona.toLowerCase().includes(userDepartment)
      );
    });
  }

  /**
   * Get service metadata for LangChain registration
   * @returns {Object} Service metadata
   */
  getServiceMetadata() {
    return {
      serviceName: 'ApplicationService',
      description: 'Manages software applications, access control, and licensing',
      capabilities: [
        'application_access_validation',
        'application_discovery',
        'access_policy_enforcement',
        'role_based_recommendations'
      ],
      intents: this.getIntentPatterns().map(pattern => pattern.intent),
      dataTypes: ['application', 'application_policy'],
      documentCount: this.getLangChainDocuments().length
    };
  }
}

module.exports = ApplicationService;