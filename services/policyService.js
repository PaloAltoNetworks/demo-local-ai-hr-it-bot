/**
 * Policy Service
 * Handles HR policies, procedures, and work-from-home guidelines
 */

const fs = require('fs');
const path = require('path');

class PolicyService {
  constructor() {
    this.policies = this.loadPolicies();
    console.log(`📋 Loaded ${Object.keys(this.policies).length} HR policies`);
  }

  /**
   * Load HR policies from data
   */
  loadPolicies() {
    const policiesPath = path.join(__dirname, '../data/hr-policies.json');
    
    // Create default policies if file doesn't exist
    if (!fs.existsSync(policiesPath)) {
      this.createDefaultPolicies(policiesPath);
    }
    
    try {
      const data = fs.readFileSync(policiesPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading HR policies:', error);
      return this.getDefaultPolicies();
    }
  }

  /**
   * Create default HR policies file
   */
  createDefaultPolicies(filePath) {
    const defaultPolicies = this.getDefaultPolicies();
    
    try {
      fs.writeFileSync(filePath, JSON.stringify(defaultPolicies, null, 2));
      console.log('📋 Created default HR policies file');
    } catch (error) {
      console.error('Error creating HR policies file:', error);
    }
  }

  /**
   * Get default policy definitions
   */
  getDefaultPolicies() {
    return {
      "work_from_home": {
        "id": "wfh_policy_2024",
        "title": "Work From Home Policy",
        "category": "remote_work",
        "description": "Guidelines and procedures for remote work arrangements",
        "eligibility": {
          "departments": ["Engineering", "Marketing", "Sales", "HR", "Finance"],
          "positions": ["Software Engineer", "Product Manager", "Marketing Specialist", "Sales Rep", "HR Specialist"],
          "minimumTenure": 90, // days
          "performanceRequirement": "Satisfactory or above"
        },
        "process": {
          "steps": [
            {
              "step": 1,
              "action": "Submit WFH request form",
              "description": "Employee submits formal request through HR portal",
              "requiredDocs": ["WFH Agreement Form", "Home Office Setup Checklist"],
              "timeline": "At least 2 weeks before desired start date"
            },
            {
              "step": 2,
              "action": "Manager approval",
              "description": "Direct manager reviews and approves/denies request",
              "criteria": ["Performance history", "Role suitability", "Team impact"],
              "timeline": "5 business days"
            },
            {
              "step": 3,
              "action": "HR validation",
              "description": "HR validates eligibility and policy compliance",
              "checks": ["Tenure verification", "Performance review", "IT security clearance"],
              "timeline": "3 business days"
            },
            {
              "step": 4,
              "action": "IT setup coordination",
              "description": "IT team provisions necessary equipment and access",
              "deliverables": ["VPN access", "Security software", "Equipment allocation"],
              "timeline": "5-7 business days"
            }
          ],
          "totalTimeline": "2-3 weeks",
          "approvalRequired": ["Direct Manager", "HR", "IT Security"]
        },
        "allowedFrequency": {
          "fullTime": "With approval for eligible roles",
          "partTime": "2-3 days per week standard",
          "occasional": "As needed with manager approval"
        },
        "requirements": {
          "equipment": ["Secure internet connection", "Dedicated workspace", "Company-provided laptop"],
          "availability": "Available during core hours (9 AM - 3 PM local time)",
          "communication": "Daily check-ins with team, weekly 1:1 with manager"
        },
        "lastUpdated": "2024-01-15"
      },
      
      "vacation_policy": {
        "id": "vacation_policy_2024", 
        "title": "Vacation and Time Off Policy",
        "category": "time_off",
        "description": "Annual leave, vacation days, and PTO guidelines",
        "entitlement": {
          "newEmployee": {"days": 15, "description": "First year employees"},
          "standard": {"days": 20, "description": "2-5 years of service"},
          "senior": {"days": 25, "description": "5+ years of service"},
          "carryover": {"maxDays": 5, "description": "Maximum days that can be carried to next year"}
        },
        "process": {
          "requestProcess": "Submit request through HR portal at least 2 weeks in advance",
          "approvalRequired": "Direct manager approval required",
          "blackoutPeriods": ["End of fiscal year", "Major product launches"],
          "documentation": "Vacation request form with business justification for extended leave"
        },
        "lastUpdated": "2024-01-15"
      },

      "expense_reimbursement": {
        "id": "expense_policy_2024",
        "title": "Expense Reimbursement Policy", 
        "category": "financial",
        "description": "Guidelines for business expense reimbursement",
        "eligibleExpenses": [
          {"category": "Travel", "maxAmount": 200, "description": "Business travel, hotels, flights"},
          {"category": "Meals", "maxAmount": 75, "description": "Business meals and client entertainment", "perDay": true},
          {"category": "Equipment", "maxAmount": 1000, "description": "Work-related equipment and software", "approvalRequired": true},
          {"category": "Training", "maxAmount": 2000, "description": "Professional development and certifications", "approvalRequired": true}
        ],
        "process": {
          "submission": "Submit receipts through expense portal within 30 days",
          "documentation": "Original receipts and business justification required",
          "approval": "Manager approval for amounts over $100",
          "reimbursement": "Processed within 2 weeks of approval"
        },
        "lastUpdated": "2024-01-15"
      },

      "professional_development": {
        "id": "dev_policy_2024",
        "title": "Professional Development Policy",
        "category": "development", 
        "description": "Training, conferences, and skill development support",
        "budget": {
          "annual": 3000,
          "description": "Per employee annual development budget",
          "categories": ["Conferences", "Online courses", "Certifications", "Books and materials"]
        },
        "process": {
          "preApproval": "Required for expenses over $500",
          "documentation": "Learning objectives and business relevance",
          "reporting": "Post-training summary and knowledge sharing session"
        },
        "lastUpdated": "2024-01-15"
      }
    };
  }

  /**
   * Get intent patterns for LangChain integration
   */
  getIntentPatterns() {
    return [
      // Work from home intents
      {
        pattern: "work from home policy",
        intent: "work_from_home_inquiry", 
        keywords: ["work from home", "remote work", "wfh", "télétravail", "travail à distance"],
        confidence: 0.9
      },
      {
        pattern: "can I work from home",
        intent: "work_from_home_eligibility",
        keywords: ["puis-je", "can I", "eligible", "autorisé", "allowed"],
        confidence: 0.85
      },
      
      // Vacation policy intents
      {
        pattern: "vacation policy",
        intent: "vacation_policy_inquiry",
        keywords: ["vacation", "time off", "pto", "congés", "vacances", "jours de congé"],
        confidence: 0.9
      },
      
      // Expense policy intents  
      {
        pattern: "expense reimbursement",
        intent: "expense_policy_inquiry",
        keywords: ["expense", "reimbursement", "remboursement", "frais", "dépenses"],
        confidence: 0.9
      },
      
      // Professional development intents
      {
        pattern: "professional development",
        intent: "development_policy_inquiry", 
        keywords: ["training", "development", "formation", "développement", "certification"],
        confidence: 0.9
      },
      
      // General policy intents
      {
        pattern: "company policy",
        intent: "general_policy_inquiry",
        keywords: ["policy", "politique", "règles", "guidelines", "procedures"],
        confidence: 0.8
      }
    ];
  }

  /**
   * Get documents for LangChain vector store
   */
  getLangChainDocuments() {
    const documents = [];
    
    Object.entries(this.policies).forEach(([policyKey, policy]) => {
      // Main policy document
      documents.push({
        pageContent: `${policy.title}: ${policy.description}`,
        metadata: {
          source: 'PolicyService',
          type: 'policy_overview',
          policyId: policy.id,
          category: policy.category
        }
      });
      
      // Detailed content based on policy type
      if (policy.eligibility) {
        documents.push({
          pageContent: `Eligibility for ${policy.title}: Departments: ${policy.eligibility.departments?.join(', ')}. Positions: ${policy.eligibility.positions?.join(', ')}. Minimum tenure: ${policy.eligibility.minimumTenure} days.`,
          metadata: {
            source: 'PolicyService',
            type: 'policy_eligibility',
            policyId: policy.id
          }
        });
      }
      
      if (policy.process) {
        documents.push({
          pageContent: `Process for ${policy.title}: ${JSON.stringify(policy.process)}`,
          metadata: {
            source: 'PolicyService',
            type: 'policy_process',
            policyId: policy.id
          }
        });
      }
    });
    
    return documents;
  }

  /**
   * Handle work from home related inquiries
   */
  async handleWorkFromHomeIntent(query, userContext, ragContext) {
    const user = userContext.user;
    const wfhPolicy = this.policies.work_from_home;
    
    // Check eligibility
    const isEligible = this.checkWFHEligibility(user, wfhPolicy);
    
    if (query.toLowerCase().includes('eligible') || query.toLowerCase().includes('puis-je')) {
      return {
        type: 'eligibility_check',
        message: isEligible.eligible 
          ? `Oui, vous êtes éligible au télétravail ! ${isEligible.reason}`
          : `Désolé, vous n'êtes pas éligible actuellement. ${isEligible.reason}`,
        eligible: isEligible.eligible,
        details: isEligible,
        nextSteps: isEligible.eligible ? wfhPolicy.process.steps : null
      };
    }
    
    // General WFH policy information
    return {
      type: 'policy_information',
      message: this.formatWFHPolicyInfo(wfhPolicy, isEligible),
      policy: wfhPolicy,
      userEligibility: isEligible
    };
  }

  /**
   * Check work from home eligibility
   */
  checkWFHEligibility(user, policy) {
    const eligibility = policy.eligibility;
    const reasons = [];
    
    // Check department
    if (!eligibility.departments.includes(user.department)) {
      return {
        eligible: false,
        reason: `Votre département (${user.department}) n'est pas éligible au télétravail selon la politique actuelle.`,
        failedChecks: ['department']
      };
    }
    
    // Check position
    if (!eligibility.positions.includes(user.position)) {
      return {
        eligible: false, 
        reason: `Votre poste (${user.position}) n'est pas éligible au télétravail selon la politique actuelle.`,
        failedChecks: ['position']
      };
    }
    
    // Check tenure (simplified - assuming all employees meet tenure for demo)
    const tenureOk = true; // In real app, would check hire date
    
    if (!tenureOk) {
      return {
        eligible: false,
        reason: `Vous devez avoir au moins ${eligibility.minimumTenure} jours d'ancienneté.`,
        failedChecks: ['tenure']
      };
    }
    
    return {
      eligible: true,
      reason: `Votre département (${user.department}) et votre poste (${user.position}) sont éligibles au télétravail.`,
      passedChecks: ['department', 'position', 'tenure']
    };
  }

  /**
   * Format WFH policy information
   */
  formatWFHPolicyInfo(policy, eligibility) {
    let message = `📋 **Politique de Télétravail**\n\n`;
    
    if (eligibility.eligible) {
      message += `✅ Vous êtes éligible au télétravail !\n\n`;
    } else {
      message += `❌ Vous n'êtes pas éligible actuellement.\n${eligibility.reason}\n\n`;
    }
    
    message += `**Fréquences autorisées :**\n`;
    message += `• Temps plein : ${policy.allowedFrequency.fullTime}\n`;
    message += `• Temps partiel : ${policy.allowedFrequency.partTime}\n`;
    message += `• Occasionnel : ${policy.allowedFrequency.occasional}\n\n`;
    
    if (eligibility.eligible) {
      message += `**Processus de demande :**\n`;
      policy.process.steps.forEach((step, index) => {
        message += `${step.step}. ${step.action} (${step.timeline})\n`;
      });
      message += `\nDurée totale : ${policy.process.totalTimeline}`;
    }
    
    return message;
  }

  /**
   * Handle vacation policy inquiries
   */
  async handleVacationPolicyIntent(query, userContext, ragContext) {
    const user = userContext.user;
    const vacationPolicy = this.policies.vacation_policy;
    
    // Determine entitlement based on tenure (simplified)
    const entitlement = this.getVacationEntitlement(user);
    
    return {
      type: 'vacation_policy_info',
      message: this.formatVacationPolicyInfo(vacationPolicy, entitlement),
      entitlement: entitlement,
      policy: vacationPolicy
    };
  }

  /**
   * Get vacation entitlement for user
   */
  getVacationEntitlement(user) {
    // Simplified logic - in real app would check hire date
    return {
      days: 20,
      category: 'standard',
      description: 'Employé standard (2-5 ans de service)'
    };
  }

  /**
   * Format vacation policy information
   */
  formatVacationPolicyInfo(policy, entitlement) {
    let message = `📋 **Politique de Congés**\n\n`;
    
    message += `**Votre allocation :** ${entitlement.days} jours (${entitlement.description})\n\n`;
    
    message += `**Processus de demande :**\n`;
    message += `• ${policy.process.requestProcess}\n`;
    message += `• ${policy.process.approvalRequired}\n\n`;
    
    message += `**Périodes d'exclusion :** ${policy.process.blackoutPeriods.join(', ')}\n`;
    message += `**Report maximum :** ${policy.entitlement.carryover.maxDays} jours vers l'année suivante`;
    
    return message;
  }

  /**
   * Handle general policy inquiries
   */
  async handleGeneralPolicyIntent(query, userContext, ragContext) {
    const availablePolicies = Object.entries(this.policies).map(([key, policy]) => 
      `• ${policy.title} - ${policy.description}`
    );
    
    return {
      type: 'policy_listing',
      message: `📋 **Politiques RH disponibles :**\n\n${availablePolicies.join('\n')}\n\nSur quelle politique souhaitez-vous plus d'informations ?`,
      policies: Object.keys(this.policies)
    };
  }

  /**
   * Handle intent routing from LangChain orchestrator
   */
  async handleIntent(intent, query, userContext, ragContext) {
    return await this.handlePolicyIntent(intent, query, userContext, ragContext);
  }

  /**
   * Main handler for policy-related intents
   */
  async handlePolicyIntent(intent, query, userContext, ragContext) {
    console.log(`📋 Handling policy intent: ${intent}`);
    
    switch (intent) {
      case 'work_from_home_inquiry':
      case 'work_from_home_eligibility':
        return this.handleWorkFromHomeIntent(query, userContext, ragContext);
        
      case 'vacation_policy_inquiry':
        return this.handleVacationPolicyIntent(query, userContext, ragContext);
        
      case 'expense_policy_inquiry':
        return this.handleExpensePolicyIntent(query, userContext, ragContext);
        
      case 'development_policy_inquiry':
        return this.handleDevelopmentPolicyIntent(query, userContext, ragContext);
        
      case 'general_policy_inquiry':
        return this.handleGeneralPolicyIntent(query, userContext, ragContext);
        
      default:
        return this.handleGeneralPolicyIntent(query, userContext, ragContext);
    }
  }

  /**
   * Handle expense policy inquiries
   */
  async handleExpensePolicyIntent(query, userContext, ragContext) {
    const expensePolicy = this.policies.expense_reimbursement;
    
    let message = `💰 **Politique de Remboursement des Frais**\n\n`;
    
    message += `**Catégories éligibles :**\n`;
    expensePolicy.eligibleExpenses.forEach(expense => {
      message += `• ${expense.category}: ${expense.description} `;
      message += expense.perDay ? `(${expense.maxAmount}€/jour)\n` : `(max ${expense.maxAmount}€)\n`;
    });
    
    message += `\n**Processus :**\n`;
    message += `• ${expensePolicy.process.submission}\n`;
    message += `• ${expensePolicy.process.documentation}\n`;
    message += `• ${expensePolicy.process.approval}\n`;
    message += `• ${expensePolicy.process.reimbursement}`;
    
    return {
      type: 'expense_policy_info',
      message: message,
      policy: expensePolicy
    };
  }

  /**
   * Handle development policy inquiries
   */
  async handleDevelopmentPolicyIntent(query, userContext, ragContext) {
    const devPolicy = this.policies.professional_development;
    
    let message = `🎓 **Politique de Développement Professionnel**\n\n`;
    
    message += `**Budget annuel :** ${devPolicy.budget.annual}€ par employé\n\n`;
    
    message += `**Catégories couvertes :**\n`;
    devPolicy.budget.categories.forEach(category => {
      message += `• ${category}\n`;
    });
    
    message += `\n**Processus :**\n`;
    message += `• ${devPolicy.process.preApproval}\n`;
    message += `• ${devPolicy.process.documentation}\n`;
    message += `• ${devPolicy.process.reporting}`;
    
    return {
      type: 'development_policy_info',
      message: message,
      policy: devPolicy
    };
  }

  /**
   * Get policy by ID
   */
  getPolicyById(policyId) {
    return Object.values(this.policies).find(policy => policy.id === policyId);
  }

  /**
   * Search policies by keyword
   */
  searchPolicies(keyword) {
    const results = [];
    const searchTerm = keyword.toLowerCase();
    
    Object.entries(this.policies).forEach(([key, policy]) => {
      if (
        policy.title.toLowerCase().includes(searchTerm) ||
        policy.description.toLowerCase().includes(searchTerm) ||
        policy.category.toLowerCase().includes(searchTerm)
      ) {
        results.push(policy);
      }
    });
    
    return results;
  }
}

module.exports = PolicyService;