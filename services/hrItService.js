const express = require('express');
const ServiceOrientedLangChainService = require('./serviceOrientedLangChainService');
const TicketService = require('./ticketService');
const ConversationHistoryService = require('./conversationHistoryService');
const PolicyService = require('./policyService');

class HRITService {
  constructor(employeeService, ollamaService, languageService, applicationService) {
    this.employeeService = employeeService;
    this.ollamaService = ollamaService;
    this.languageService = languageService;
    this.applicationService = applicationService;
    this.ticketService = new TicketService();
    this.conversationHistory = new ConversationHistoryService();
    this.policyService = new PolicyService();
    
    // Initialize service-oriented LangChain
    this.langchainOrchestrator = new ServiceOrientedLangChainService(ollamaService);
    
    // Register services with LangChain
    this.registerServices();
    
    // Set up authenticated user (Emma Thompson)
    this.authenticatedUser = this.employeeService.getEmployeeByEmail('emma.thompson@company.com');
  }

  /**
   * Register all services with the LangChain orchestrator
   */
  registerServices() {
    console.log('🔌 Registering services with LangChain orchestrator...');
    
    // Register ApplicationService
    this.langchainOrchestrator.registerService(this.applicationService, 'ApplicationService');
    
    // Register EmployeeService
    this.langchainOrchestrator.registerService(this.employeeService, 'EmployeeService');
    
    // Register PolicyService
    this.langchainOrchestrator.registerService(this.policyService, 'PolicyService');
    
    // Register TicketService if it has LangChain integration
    if (typeof this.ticketService.getIntentPatterns === 'function') {
      this.langchainOrchestrator.registerService(this.ticketService, 'TicketService');
    }
    
    console.log('✅ All services registered with LangChain');
  }

  /**
   * Process HR/IT request using Service-Oriented LangChain RAG with conversation history
   * @param {string} query - User query
   * @param {string} language - Language code (en or fr)
   * @returns {Promise<string>} - Response to the query
   */
  async processHRRequest(query, language = 'en') {
    try {
      const user = this.authenticatedUser;
      const userId = user.email;
      
      // Check for pending actions (multi-step interactions)
      const pendingActions = this.conversationHistory.getPendingActionTypes(userId);
      if (pendingActions.length > 0) {
        const response = await this.handlePendingActions(query, pendingActions, userId, language);
        if (response) {
          // Add to conversation history
          this.conversationHistory.addExchange(userId, query, response, {
            intent: 'pending_action_response',
            pendingActions: pendingActions
          });
          return response;
        }
      }

      // Get conversation context for better understanding
      const conversationContext = this.conversationHistory.getContextForLangChain(userId);
      
      // Prepare user context for RAG
      const userContext = {
        user: user,
        userInfo: `Current User: ${user.firstName} ${user.lastName}, ${user.position} in ${user.department}\nJob Responsibilities: ${user.jobDescription || 'Not specified'}`,
        conversationHistory: conversationContext
      };

      // Use Service-Oriented LangChain for processing
      const ragResult = await this.langchainOrchestrator.processQueryWithServiceRAG(query, userContext);
      
      console.log(`🎯 Intent: ${ragResult.intent.primary} (confidence: ${ragResult.intent.confidence.toFixed(2)})`);
      console.log(`📚 Retrieved ${ragResult.metadata.retrievedDocs} documents`);
      
      let response;
      
      if (ragResult.handledByService) {
        console.log(`🔄 Handled by ${ragResult.handlingService} service`);
        response = this.formatServiceResponse(ragResult.serviceResult, ragResult, language);
        
        // Check if service wants to set up a pending action
        if (ragResult.serviceResult.pendingAction) {
          this.conversationHistory.setPendingAction(
            userId, 
            ragResult.serviceResult.pendingAction.type,
            ragResult.serviceResult.pendingAction.data
          );
        }
      } else {
        // Handle cases not covered by specific services
        switch (ragResult.intent.primary) {
          case 'it_support':
            response = await this.handleGeneralITSupport(query, ragResult, language);
            break;
          case 'policy_question':
            response = await this.handlePolicyQuestionWithRAG(query, ragResult, language);
            break;
          default:
            response = await this.handleGeneralRequestWithRAG(query, ragResult, language);
        }
      }

      // Add exchange to conversation history
      this.conversationHistory.addExchange(userId, query, response, {
        intent: ragResult.intent.primary,
        confidence: ragResult.intent.confidence,
        handlingService: ragResult.handlingService || 'HRITService',
        sources: ragResult.metadata.sources
      });

      return response;

    } catch (error) {
      console.error('HR/IT request processing error:', error);
      const fallbackResponse = this.getFallbackResponse(query, language);
      
      // Still log the failed exchange
      try {
        this.conversationHistory.addExchange(user.email, query, fallbackResponse, {
          intent: 'error',
          error: error.message
        });
      } catch (historyError) {
        console.error('Failed to log conversation history:', historyError);
      }
      
      return fallbackResponse;
    }
  }

  /**
   * Handle pending actions from multi-step interactions
   * @param {string} query - User query
   * @param {Array} pendingActions - List of pending action types
   * @param {string} userId - User identifier
   * @param {string} language - Language code
   * @returns {Promise<string|null>} - Response if handled, null otherwise
   */
  async handlePendingActions(query, pendingActions, userId, language) {
    const confirmation = this.conversationHistory.detectConfirmation(query);
    
    for (const actionType of pendingActions) {
      switch (actionType) {
        case 'ticket_creation_confirmation':
          if (confirmation.isConfirmation) {
            const ticketData = this.conversationHistory.getPendingAction(userId, actionType);
            
            if (confirmation.isPositive) {
              // Create the ticket
              const ticket = await this.ticketService.createApplicationAccessTicket(
                ticketData.user,
                ticketData.application,
                {
                  autoApproved: false,
                  requestReason: ticketData.reason || 'Manual request via chatbot',
                  conversationContext: query
                }
              );
              
              this.conversationHistory.clearPendingAction(userId, actionType);
              
              return `Parfait ! J'ai créé le ticket #${ticket.id} pour votre demande d'accès à ${ticketData.application.name}.\n\n🎫 **Ticket créé**\n📋 Numéro : #${ticket.id}\n🕐 Statut : En attente d'approbation\n📧 Vous recevrez un email de confirmation.\n\nY a-t-il autre chose pour laquelle je peux vous aider ?`;
            } else {
              // User declined ticket creation
              this.conversationHistory.clearPendingAction(userId, actionType);
              
              return `D'accord, je n'ai pas créé de ticket pour ${ticketData.application.name}. Si vous changez d'avis, n'hésitez pas à me redemander !\n\nComment puis-je vous aider d'autre ?`;
            }
          }
          break;
          
        case 'policy_clarification':
          if (confirmation.isConfirmation) {
            const policyData = this.conversationHistory.getPendingAction(userId, actionType);
            
            if (confirmation.isPositive) {
              // Provide detailed policy information
              this.conversationHistory.clearPendingAction(userId, actionType);
              
              const detailedInfo = await this.policyService.handlePolicyIntent(
                policyData.intent,
                policyData.originalQuery + " détails complets",
                { user: this.authenticatedUser },
                policyData.ragContext
              );
              
              return detailedInfo.message + "\n\nY a-t-il autre chose que vous souhaitez savoir ?";
            } else {
              this.conversationHistory.clearPendingAction(userId, actionType);
              return `Pas de problème ! Comment puis-je vous aider autrement ?`;
            }
          }
          break;
      }
    }
    
    return null; // No pending action was handled
  }

  /**
   * Format response from service handlers
   * @param {Object} serviceResult - Result from service handler
   * @param {Object} ragResult - RAG processing result
   * @param {string} language - Language code
   * @returns {string} - Formatted response
   */
  formatServiceResponse(serviceResult, ragResult, language) {
    const user = this.authenticatedUser;
    
    switch (serviceResult.type) {
      case 'access_validation':
        return this.formatApplicationAccessResponse(serviceResult, ragResult);
      
      case 'vacation_info':
        return this.formatVacationResponse(serviceResult, user);
      
      case 'salary_info':
        return this.formatSalaryResponse(serviceResult, user);
      
      case 'benefits_info':
        return this.formatBenefitsResponse(serviceResult, user);
      
      case 'manager_info':
        return this.formatManagerResponse(serviceResult, user);
      
      case 'general_employee_info':
        return this.formatEmployeeInfoResponse(serviceResult, user);
      
      case 'department_lookup':
      case 'employee_search':
        return this.formatEmployeeLookupResponse(serviceResult, user);
      
      case 'category_listing':
      case 'general_listing':
        return this.formatApplicationListingResponse(serviceResult, user);
      
      case 'clarification_needed':
      case 'authentication_required':
      case 'access_denied':
      case 'no_matches':
        return this.formatErrorResponse(serviceResult, user);
      
      // Policy service responses
      case 'policy_information':
      case 'eligibility_check':
      case 'vacation_policy_info':
      case 'expense_policy_info':
      case 'development_policy_info':
      case 'policy_listing':
        return this.formatPolicyResponse(serviceResult, user);
      
      default:
        return `Salut ${user.firstName} ! ${serviceResult.message || 'J\'ai traité votre demande.'}\n\nComment puis-je vous aider d'autre ?`;
    }
  }

  /**
   * Handle application access requests with RAG-enhanced decision making
   * @param {string} query - User query
   * @param {Object} ragResult - LangChain RAG result
   * @param {string} language - Language code
   * @returns {Promise<string>} - Response message
   */
  async handleApplicationAccessWithRAG(query, ragResult, language) {
    const user = this.authenticatedUser;
    
    // Extract requested application from query
    const requestedApp = this.extractApplicationFromQuery(query, ragResult.intent);
    
    if (!requestedApp) {
      return `Hi ${user.firstName}! I understand you need application access, but I need more details. Based on our policies:\n\n${ragResult.context}\n\nCould you please specify which application or software you need access to?`;
    }

    // Use RAG context to make intelligent access decisions
    const accessDecision = await this.evaluateApplicationAccessWithRAG(user, requestedApp, query, ragResult);
    
    if (accessDecision.approved) {
      // Create and auto-approve ticket
      const ticket = this.ticketService.createApplicationAccessTicket({
        user: user,
        application: requestedApp,
        justification: accessDecision.justification
      });
      
      this.ticketService.processTicketDecision(ticket.id, accessDecision);
      
      return `✅ **ACCESS APPROVED** - Ticket ${ticket.id}

Hi ${user.firstName}! I've **automatically approved** your access to **${requestedApp.name}**.

**AI Decision Reasoning:** ${accessDecision.reason}

**What happens next:**
1. Access will be provisioned within 15 minutes
2. You'll receive login credentials at: ${user.email}
3. Documentation: ${requestedApp.link}

**Relevant Policy Information:**
${this.getRelevantPolicyText(ragResult.ragContext, 'application_policy')}

Need help getting started? Just ask!`;
    } else {
      // Create ticket but flag for review
      const ticket = this.ticketService.createApplicationAccessTicket({
        user: user,
        application: requestedApp,
        justification: accessDecision.justification
      });
      
      this.ticketService.processTicketDecision(ticket.id, accessDecision);
      
      return `⚠️ **ACCESS REQUIRES REVIEW** - Ticket ${ticket.id}

Hi ${user.firstName}! Your **${requestedApp.name}** access request needs additional review.

**AI Analysis:** ${accessDecision.reason}

**Relevant Company Policy:**
${this.getRelevantPolicyText(ragResult.ragContext, 'application_policy')}

**Next Steps:**
1. Your request has been escalated for approval
2. You'll be contacted within 24 hours
3. Please prepare business justification if needed

Anything else I can help you with?`;
    }
  }

  /**
   * Handle policy questions with RAG-retrieved information
   * @param {string} query - User query
   * @param {Object} ragResult - LangChain RAG result
   * @param {string} language - Language code
   * @returns {Promise<string>} - Response message
   */
  async handlePolicyQuestionWithRAG(query, ragResult, language) {
    const user = this.authenticatedUser;
    
    // Use RAG context to provide detailed policy information
    const enhancedPrompt = `
You are the IT/HR assistant. The user asked about company policy.

Retrieved Policy Information:
${ragResult.context}

User: ${user.firstName} ${user.lastName} (${user.position})
Question: ${query}

Provide a clear, helpful answer using the retrieved policy information. Be specific and include relevant details from the policies above.
    `;

    const aiResponse = await this.ollamaService.generateResponse(enhancedPrompt, undefined, language);
    
    return `📋 **Policy Information**

Hi ${user.firstName}! Here's what I found about your policy question:

${aiResponse}

**Sources:** ${ragResult.metadata.sources.join(', ')}

Need clarification on anything? I'm here to help!`;
  }

  /**
   * Handle IT support with RAG context and immediate solutions
   * @param {string} query - User query
   * @param {Object} ragResult - LangChain RAG result
   * @param {string} language - Language code
   * @returns {Promise<string>} - Response message
   */
  async handleITSupportWithRAG(query, ragResult, language) {
    const user = this.authenticatedUser;
    const category = this.categorizeITRequest(query, ragResult.intent);
    
    // Check if we can provide immediate help using RAG context
    const immediateHelp = this.getImmediateSolutionFromRAG(query, category, ragResult);
    
    if (immediateHelp) {
      return `🔧 **IT Support - Quick Solution**

Hi ${user.firstName}! I found a solution for you:

${immediateHelp}

**Based on our knowledge base:**
${this.getRelevantPolicyText(ragResult.ragContext, 'it_policy')}

**If this doesn't solve your issue:**
- I can create a support ticket for you
- Our IT team response time: 2-24 hours depending on priority

Did this help? Let me know if you need further assistance!`;
    }

    // Create ticket for complex issues
    const ticket = this.ticketService.createITSupportTicket({
      user: user,
      issue: query,
      category: category
    });

    return `🔧 **IT Support Ticket Created** - ${ticket.id}

Hi ${user.firstName}! I've created a support ticket for: "${query}"

**Ticket Details:**
- Priority: ${ticket.priority}
- Category: ${category}
- Assigned to: IT Support Team

**Relevant Information:**
${this.getRelevantPolicyText(ragResult.ragContext, 'it_policy')}

**Expected Response Time:** Within 24 hours

I'll ensure our team addresses this quickly. Anything else I can help with?`;
  }

  /**
   * Handle HR inquiries with personalized and RAG-enhanced responses
   * @param {string} query - User query
   * @param {Object} ragResult - LangChain RAG result
   * @param {string} language - Language code
   * @returns {Promise<string>} - Response message
   */
  async handleHRInquiryWithRAG(query, ragResult, language) {
    const user = this.authenticatedUser;
    
    // Handle common HR queries with personalized data
    if (query.toLowerCase().includes('vacation') || query.toLowerCase().includes('pto')) {
      const vacation = user.benefits?.vacation;
      if (vacation) {
        return `📅 **Your Vacation Balance**

Hi ${user.firstName}! Here's your current PTO status:

**📊 Your Current Balance:**
- **Total Annual Days:** ${vacation.total}
- **Days Used:** ${vacation.used} 
- **Days Remaining:** ${vacation.remaining}

**📋 Vacation Policy (from our knowledge base):**
${this.getRelevantPolicyText(ragResult.ragContext, 'hr_policy')}

**🚀 Quick Actions:**
- Want to request time off? I can help you with that!
- Need to check holiday calendar? Just ask!
- Questions about carryover? I have the latest policy info!

What would you like to do next?`;
      }
    }

    if (query.toLowerCase().includes('salary')) {
      const salary = user.financial?.salary;
      if (salary) {
        return `💰 **Your Salary Information**

Hi ${user.firstName}! Here are your current compensation details:

**💵 Current Salary:**
- **Annual Amount:** ${salary.amount.toLocaleString()} ${salary.currency}
- **Payment Frequency:** ${salary.frequency}
- **Position:** ${user.position}

**📋 Related Policies:**
${this.getRelevantPolicyText(ragResult.ragContext, 'hr_policy')}

**💡 Need Help With:**
- Questions about raises or reviews? I can create an HR ticket
- Want to understand your benefits package? Just ask!
- Need tax documents or pay stubs? I can guide you to the right place!

How can I help you further?`;
      }
    }

    // Use RAG for other HR inquiries
    const enhancedPrompt = `
You are the HR assistant. Provide a helpful response to this HR inquiry.

Employee Information:
- Name: ${user.firstName} ${user.lastName}
- Position: ${user.position}
- Department: ${user.department}

Retrieved HR Information:
${ragResult.context}

Employee Question: ${query}

Provide a personalized, helpful response using the HR information above.
    `;

    const aiResponse = await this.ollamaService.generateResponse(enhancedPrompt, undefined, language);
    
    return `👥 **HR Information**

Hi ${user.firstName}! ${aiResponse}

**Sources:** ${ragResult.metadata.sources.join(', ')}

Need to create an HR ticket or have other questions? I'm here to help!`;
  }

  /**
   * Handle general requests with enhanced RAG context
   * @param {string} query - User query
   * @param {Object} ragResult - LangChain RAG result
   * @param {string} language - Language code
   * @returns {Promise<string>} - Response message
   */
  async handleGeneralRequestWithRAG(query, ragResult, language) {
    const user = this.authenticatedUser;
    
    const enhancedPrompt = `
You are the intelligent IT/HR assistant. Answer this question helpfully.

Employee: ${user.firstName} ${user.lastName} (${user.position})
Company Knowledge Base:
${ragResult.context}

Question: ${query}

Provide a helpful, professional response using the company information above. If you need to create a ticket or take action, mention it clearly.
    `;

    const aiResponse = await this.ollamaService.generateResponse(enhancedPrompt, undefined, language);
    
    return `Hi ${user.firstName}! ${aiResponse}

${ragResult.metadata.sources.length > 0 ? `**Sources:** ${ragResult.metadata.sources.join(', ')}` : ''}

Is there anything else I can help you with?`;
  }

  /**
   * Application access requests with auto-approval (LEGACY - kept for compatibility)
   * @param {string} query - User query
   * @param {Object} intent - Intent analysis result
   * @param {string} language - Language code
   * @returns {Promise<string>} - Response message
   */
  async handleApplicationAccess(query, intent, language) {
    const user = this.authenticatedUser;
    
    // Extract requested application from query
    const requestedApp = this.extractApplicationFromQuery(query, intent);
    
    if (!requestedApp) {
      // Create a general access request ticket
      const ticket = this.ticketService.createApplicationAccessTicket({
        user: user,
        application: { name: 'Unknown Application', id: 'unknown' },
        justification: query
      });
      
      return `I've created ticket ${ticket.id} for your application access request. Based on your role as ${user.position}, I'll need to review what specific application you need access to. Could you please specify which application or software you need?`;
    }

    // Check if user should have access based on job role
    const accessDecision = this.evaluateApplicationAccess(user, requestedApp, query);
    
    // Create ticket
    const ticket = this.ticketService.createApplicationAccessTicket({
      user: user,
      application: requestedApp,
      justification: accessDecision.justification || query
    });

    // Auto-approve or flag for review
    if (accessDecision.approved) {
      this.ticketService.processTicketDecision(ticket.id, accessDecision);
      return `✅ **ACCESS APPROVED** - Ticket ${ticket.id}

Hi ${user.firstName}! As your IT/HR assistant, I've **automatically approved** your access to **${requestedApp.name}**. 

**Reason:** ${accessDecision.reason}

**Next Steps:**
1. You'll receive login credentials within 15 minutes
2. Access will be provisioned to your account: ${user.email}
3. Documentation: ${requestedApp.link}

If you need help getting started, just let me know!`;
    } else {
      this.ticketService.processTicketDecision(ticket.id, accessDecision);
      return `⚠️ **ACCESS REQUIRES REVIEW** - Ticket ${ticket.id}

Hi ${user.firstName}! I've created a ticket for your **${requestedApp.name}** access request.

**Status:** Requires additional approval
**Reason:** ${accessDecision.reason}

**What happens next:**
1. Your request has been escalated for review
2. You'll be contacted within 24 hours
3. Please be ready to provide business justification

Is there anything else I can help you with in the meantime?`;
    }
  }

  /**
   * Handle IT support requests
   * @param {string} query - User query
   * @param {Object} intent - Intent analysis result
   * @param {string} language - Language code
   * @returns {Promise<string>} - Response message
   */
  async handleITSupport(query, intent, language) {
    const user = this.authenticatedUser;
    const lowerQuery = query.toLowerCase();
    
    // Determine support category
    const category = this.categorizeITRequest(query, intent);
    
    // Provide immediate help for common issues WITHOUT creating tickets
    const immediateHelp = this.getImmediateITHelp(query, category);
    
    if (immediateHelp && !this.requiresTicket(lowerQuery, category)) {
      return `🔧 **IT Self-Help Solution**

Hi ${user.firstName}! I can help you with that right away:

**${this.getCategoryTitle(category)}**
${immediateHelp}

**Still having issues?** Just let me know and I'll create a support ticket for hands-on help.

💡 **Tip:** For future reference, you can always ask me for quick IT help before we escalate to a ticket!`;
    }

    // Create ticket for complex issues or when self-help doesn't work
    const ticket = this.ticketService.createITSupportTicket({
      user: user,
      issue: query,
      category: category
    });

    let response = `🔧 **IT SUPPORT** - Ticket ${ticket.id}

Hi ${user.firstName}! I've created a support ticket for your issue.`;

    if (immediateHelp) {
      response += `

**Try This First:**
${immediateHelp}`;
    }

    response += `

**Ticket Details:**
• **Issue:** ${query}
• **Priority:** ${ticket.priority}
• **Category:** ${category.replace('_', ' ')}
• **Expected Response:** ${this.getResponseTime(category)}

Our IT team will reach out to you soon. Need help with anything else?`;

    return response;
  }

  /**
   * Handle HR inquiries with personalized information
   * @param {string} query - User query
   * @param {Object} intent - Intent analysis result
   * @param {string} language - Language code
   * @returns {Promise<string>} - Response message
   */
  async handleHRInquiry(query, intent, language) {
    const user = this.authenticatedUser;
    const lowerQuery = query.toLowerCase();
    
    // Handle vacation/PTO inquiries directly
    if (lowerQuery.includes('vacation') || lowerQuery.includes('pto') || lowerQuery.includes('time off')) {
      const vacation = user.benefits?.vacation;
      if (vacation) {
        // Check if they want to request time off or just check balance
        if (lowerQuery.includes('request') || lowerQuery.includes('take') || lowerQuery.includes('book')) {
          const ticket = this.ticketService.createHRTicket({
            user: user,
            request: `Time-off request: ${query}`,
            category: 'time_off_request'
          });
          
          return `📅 **Time-Off Request** - Ticket ${ticket.id}

Hi ${user.firstName}! I've created your time-off request.

**Current Balance:** ${vacation.remaining} days remaining
**Request:** ${query}
**Status:** Pending approval
**Response Time:** Within 24 hours

Your manager will review and approve your request. You'll receive an email confirmation once processed.`;
        } else {
          // Just checking balance - no ticket needed
          return `📅 **Your Vacation Balance**

Hi ${user.firstName}! Here's your current PTO status:

**Total Annual Days:** ${vacation.total}
**Days Used:** ${vacation.used}
**Days Remaining:** ${vacation.remaining}

💡 To request time off, just ask me "I want to request 3 vacation days" or similar, and I'll create the request for you!`;
        }
      }
    }

    // Handle salary inquiries directly
    if (lowerQuery.includes('salary') || lowerQuery.includes('pay')) {
      const salary = user.financial?.salary;
      if (salary) {
        return `💰 **Your Salary Information**

Hi ${user.firstName}! Here are your current salary details:

**Annual Salary:** ${salary.amount.toLocaleString()} ${salary.currency}
**Payment Frequency:** ${salary.frequency}

💡 For questions about raises, bonuses, or salary adjustments, just let me know and I can create an HR ticket for you.`;
      }
    }

    // Handle benefits inquiries directly
    if (lowerQuery.includes('benefit') || lowerQuery.includes('insurance') || lowerQuery.includes('health')) {
      return `🏥 **Your Benefits Information**

Hi ${user.firstName}! Here's an overview of your benefits:

**Health Insurance:** Company Health Plan
**Dental:** Basic Coverage Included  
**Vision:** Basic Coverage Included
**Retirement:** 401(k) with company matching
**Life Insurance:** 2x annual salary

💡 For specific benefit details, enrollment changes, or claims help, I can create an HR ticket for you. Just let me know what you need!`;
    }

    // Handle emergency contact updates
    if (lowerQuery.includes('emergency contact') || lowerQuery.includes('contact update')) {
      const ticket = this.ticketService.createHRTicket({
        user: user,
        request: `Emergency contact update: ${query}`,
        category: 'personal_info_update'
      });
      
      return `📞 **Contact Update** - Ticket ${ticket.id}

Hi ${user.firstName}! I've created a ticket to update your emergency contact information.

**Current Emergency Contact:** ${user.emergencyContact.name} (${user.emergencyContact.relationship})
**Update Request:** ${query}
**Status:** Processing
**Response Time:** Within 24 hours

Your information will be updated securely. Is there anything else I can help you with?`;
    }

    // Only create tickets for complex requests that need HR intervention
    if (lowerQuery.includes('complaint') || lowerQuery.includes('issue') || lowerQuery.includes('problem') || 
        lowerQuery.includes('policy violation') || lowerQuery.includes('harassment') || lowerQuery.includes('discrimination')) {
      const ticket = this.ticketService.createHRTicket({
        user: user,
        request: query,
        category: 'hr_concern'
      });

      return `👥 **HR Concern** - Ticket ${ticket.id}

Hi ${user.firstName}! I've created a confidential HR ticket for your concern.

**Your Request:** "${query}"
**Status:** Under review
**Priority:** High
**Response Time:** Within 4 hours

This will be handled with complete confidentiality. An HR representative will contact you directly.`;
    }

    // For general questions, provide helpful information without creating tickets
    return `👥 **HR Information**

Hi ${user.firstName}! I'm here to help with your HR needs. I can help you with:

**Quick Answers:**
• Vacation balance and time-off requests
• Salary and benefits information  
• Company policies and procedures
• Emergency contact updates

**What I can create tickets for:**
• Complex HR issues or concerns
• Policy clarifications
• Benefits enrollment changes
• Personal information updates

What would you like help with today?`;
  }

  /**
   * Handle general requests and questions
   * @param {string} query - User query
   * @param {Object} intent - Intent analysis result
   * @param {string} language - Language code
   * @returns {Promise<string>} - Response message
   */
  async handleGeneralRequest(query, intent, language) {
    const user = this.authenticatedUser;
    const lowerQuery = query.toLowerCase();

    // Handle common company information directly
    if (lowerQuery.includes('manager') || lowerQuery.includes('supervisor')) {
      return `👤 **Your Manager Information**

Hi ${user.firstName}! Here's your manager information:

**Manager:** ${user.manager || 'No manager assigned'}
**Department:** ${user.department}

💡 Need to reach your manager? I can help you draft an email or schedule a meeting if needed!`;
    }

    if (lowerQuery.includes('location') || lowerQuery.includes('office') || lowerQuery.includes('address')) {
      return `📍 **Your Work Location**

Hi ${user.firstName}! Here's your workplace information:

**Work Location:** ${user.location}
**Department:** ${user.department}
**Position:** ${user.position}

💡 Need directions, parking info, or office details? Just let me know!`;
    }

    if (lowerQuery.includes('contact') && !lowerQuery.includes('emergency')) {
      return `📞 **Contact Information**

Hi ${user.firstName}! Here are your contact details on file:

**Work Email:** ${user.email}
**Phone:** ${user.phone}
**Location:** ${user.location}

💡 Need to update any contact information? I can create an HR ticket for you!`;
    }

    // Handle policy questions directly with AI but don't create tickets
    if (lowerQuery.includes('policy') || lowerQuery.includes('rule') || lowerQuery.includes('procedure')) {
      const contextInfo = this.getContextualInfo(intent, language);
      const userContext = this.getAuthenticatedUserContext(query, intent, language);
      const fullContext = contextInfo + userContext;

      const enhancedPrompt = `${this.buildEnhancedPrompt(query, fullContext, language)}

IMPORTANT: This is a policy question. Provide helpful information directly without creating tickets. Be authoritative and helpful.`;

      const aiResponse = await this.ollamaService.generateResponse(enhancedPrompt, undefined, language);
      return this.enhanceResponse(aiResponse, intent, language);
    }

    // For other general questions, use AI without creating tickets
    const contextInfo = this.getContextualInfo(intent, language);
    const userContext = this.getAuthenticatedUserContext(query, intent, language);
    const fullContext = contextInfo + userContext;

    const enhancedPrompt = `${this.buildEnhancedPrompt(query, fullContext, language)}

IMPORTANT: This is a general inquiry. Answer helpfully and directly. Only suggest creating a ticket if the request specifically requires action or complex assistance.`;

    const aiResponse = await this.ollamaService.generateResponse(enhancedPrompt, undefined, language);
    return this.enhanceResponse(aiResponse, intent, language);
  }

  /**
   * Analyze user query to determine intent (DEPRECATED - replaced by LangChain)
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
        
        // Add job description for contextual awareness
        if (employee.jobDescription) {
          compromisedContext += `Job Responsibilities: ${employee.jobDescription}\n`;
        }
        
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
    return this.getAuthenticatedUserContext(query, intent, language);
  }

  /**
   * Get authenticated user context for personalized responses
   * @param {string} query - User query
   * @param {Object} intent - Intent analysis result
   * @param {string} language - Language code
   * @returns {string} - User contextual information
   */
  getAuthenticatedUserContext(query, intent, language) {
    if (!this.authenticatedUser) {
      return '';
    }

    let userContext = '';
    const user = this.authenticatedUser;

    // Add user identification
    userContext += `Current User: ${user.firstName} ${user.lastName}, ${user.position} in ${user.department}\n`;
    
    // Add job description for contextual awareness
    if (user.jobDescription) {
      userContext += `Job Responsibilities: ${user.jobDescription}\n`;
    }
    
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

    // Add application access validation if user is requesting software/app access
    if (intent.primary === 'software' || intent.primary === 'application' || intent.all.includes('access') || 
        intent.all.includes('app') || intent.all.includes('software') || intent.all.includes('program')) {
      const appValidation = this.validateApplicationRequest(query, user.position);
      if (appValidation) {
        userContext += `Application Access Validation: ${appValidation}\n`;
      }
    }

    return userContext ? `Personal Information:\n${userContext}\n` : '';
  }

  /**
   * Validate application access request based on user's job role
   * @param {string} query - User's query
   * @param {string} jobTitle - User's job title
   * @returns {string|null} - Validation message or null if no app detected
   */
  validateApplicationRequest(query, jobTitle) {
    if (!this.applicationService) {
      return null;
    }

    // Extract potential application names from the query
    const apps = this.applicationService.getAllApplications();
    for (const app of apps) {
      const appNameLower = app.name.toLowerCase();
      const queryLower = query.toLowerCase();
      
      // Check if the query mentions this application
      if (queryLower.includes(appNameLower) || 
          queryLower.includes(app.name.toLowerCase().replace(/\s+/g, '')) ||
          (app.name.includes(' ') && queryLower.includes(app.name.split(' ')[0].toLowerCase()))) {
        
        const validation = this.applicationService.validateApplicationAccess(app.name, jobTitle);
        
        if (validation.status === 'restricted') {
          return `⚠️  WARNING: ${validation.message} Please ask for business justification.`;
        } else if (validation.status === 'questionable') {
          return `❓ UNUSUAL REQUEST: ${validation.message}`;
        } else if (validation.status === 'appropriate') {
          return `✅ APPROPRIATE: ${validation.message}`;
        }
      }
    }
    
    return null;
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

  /**
   * Extract application name from user query
   * @param {string} query - User query
   * @param {Object} intent - Intent analysis result
   * @returns {Object|null} - Application object or null
   */
  extractApplicationFromQuery(query, intent) {
    const applications = this.applicationService.getAllApplications();
    const lowerQuery = query.toLowerCase();

    // Look for exact matches first
    for (const app of applications) {
      const appNameLower = app.name.toLowerCase();
      if (lowerQuery.includes(appNameLower)) {
        return app;
      }
      
      // Check for partial matches (e.g., "autocad" matches "AutoCAD")
      const appWords = appNameLower.split(' ');
      if (appWords.some(word => lowerQuery.includes(word) && word.length > 3)) {
        return app;
      }
    }

    // Check entities extracted by intent detection
    if (intent.entities && intent.entities.applications.length > 0) {
      const entityApp = intent.entities.applications[0];
      return applications.find(app => app.name.toLowerCase().includes(entityApp.toLowerCase()));
    }

    return null;
  }

  /**
   * Evaluate whether user should have access to an application
   * @param {Object} user - User object
   * @param {Object} application - Application object
   * @param {string} query - User query for context
   * @returns {Object} - Access decision
   */
  evaluateApplicationAccess(user, application, query) {
    const userPosition = user.position.toLowerCase();
    const userDepartment = user.department.toLowerCase();
    const targetPersonas = application.targetPersonas.map(p => p.toLowerCase());

    // Check if user's position matches target personas
    const hasDirectAccess = targetPersonas.some(persona => 
      userPosition.includes(persona) || persona.includes(userPosition)
    );

    // Check department alignment
    const departmentMatch = targetPersonas.some(persona => 
      userDepartment.includes(persona) || persona.includes(userDepartment)
    );

    if (hasDirectAccess || departmentMatch) {
      return {
        approved: true,
        reason: `Access granted: Your role as ${user.position} requires ${application.name} for daily work responsibilities.`,
        justification: `Standard access for ${user.position} position`
      };
    }

    // Special cases that might need approval
    const isCriticalApp = application.name.toLowerCase().includes('payroll') || 
                         application.name.toLowerCase().includes('financial') ||
                         application.name.toLowerCase().includes('hr management');

    if (isCriticalApp && !userDepartment.includes('hr') && !userDepartment.includes('finance')) {
      return {
        approved: false,
        reason: `${application.name} is restricted to HR and Finance personnel. Your role as ${user.position} doesn't typically require this access.`,
        justification: 'Security policy violation - cross-departmental access to sensitive system'
      };
    }

    // Creative/Design tools requested by non-creative roles
    const isDesignTool = application.name.toLowerCase().includes('autocad') ||
                        application.name.toLowerCase().includes('photoshop') ||
                        application.name.toLowerCase().includes('figma') ||
                        application.name.toLowerCase().includes('creative');

    if (isDesignTool && !userPosition.includes('design') && !userPosition.includes('marketing') && !userPosition.includes('creative')) {
      return {
        approved: false,
        reason: `${application.name} is typically used by design and creative roles. As a ${user.position}, please provide business justification for this request.`,
        justification: 'Non-standard access request requiring business justification'
      };
    }

    // Default to requiring review for unclear cases
    return {
      approved: false,
      reason: `Your request for ${application.name} requires additional review to ensure proper access alignment with your role as ${user.position}.`,
      justification: 'Access request requires managerial approval'
    };
  }

  /**
   * Categorize IT support request
   * @param {string} query - User query
   * @param {Object} intent - Intent analysis result
   * @returns {string} - Category name
   */
  categorizeITRequest(query, intent) {
    const lowerQuery = query.toLowerCase();
    
    if (lowerQuery.includes('password') || lowerQuery.includes('reset') || lowerQuery.includes('login')) {
      return 'password_reset';
    }
    if (lowerQuery.includes('laptop') || lowerQuery.includes('computer') || lowerQuery.includes('hardware')) {
      return 'hardware_support';
    }
    if (lowerQuery.includes('email') || lowerQuery.includes('outlook')) {
      return 'email_support';
    }
    if (lowerQuery.includes('vpn') || lowerQuery.includes('network') || lowerQuery.includes('connection')) {
      return 'network_support';
    }
    if (lowerQuery.includes('install') || lowerQuery.includes('software')) {
      return 'software_installation';
    }
    
    return 'general_support';
  }

  /**
   * Get immediate help for common IT issues
   * @param {string} query - User query
   * @param {string} category - Issue category
   * @returns {string|null} - Immediate help text or null
   */
  getImmediateITHelp(query, category) {
    switch (category) {
      case 'password_reset':
        return `**Quick Steps:**
1. Visit: https://password.company.com
2. Enter your email: ${this.authenticatedUser.email}
3. Check your email (including spam folder)
4. Follow the reset link in the email
5. Create a strong password (8+ chars, mix of letters/numbers/symbols)`;
        
      case 'network_support':
        return `**Quick Fixes:**
1. **WiFi Issues:** Disconnect and reconnect to WiFi
2. **Slow Internet:** Restart your router (unplug 30 seconds, plug back in)
3. **VPN Problems:** Disconnect VPN, restart, then reconnect
4. **No Internet:** Check cables, restart computer
5. **Still issues:** Run network troubleshooter in Settings`;
        
      case 'email_support':
        return `**Email Troubleshooting:**
1. **Won't Load:** Close and reopen email app
2. **Slow/Freezing:** Clear email cache (File > Options > Advanced > Outlook Data Files)
3. **Can't Send:** Check internet connection, verify email settings
4. **Missing Emails:** Check spam/junk folder, refresh inbox
5. **Sync Issues:** Remove and re-add email account`;

      case 'software_installation':
        return `**Software Installation Help:**
1. **Check Requirements:** Ensure your system meets minimum requirements
2. **Admin Rights:** Run installer as administrator (right-click > Run as admin)
3. **Antivirus:** Temporarily disable antivirus during installation
4. **Clean Install:** Uninstall old version first if upgrading
5. **Restart:** Reboot after installation completes`;

      case 'hardware_support':
        return `**Hardware Quick Checks:**
1. **Computer Slow:** Restart computer, check available storage space
2. **Printer Issues:** Check power, cables, paper, try printing test page
3. **Monitor Problems:** Check cable connections, try different cable
4. **Keyboard/Mouse:** Try different USB port, check batteries (wireless)
5. **Audio Issues:** Check volume, try different audio output`;
        
      default:
        return null;
    }
  }

  /**
   * Check if an issue requires a ticket or can be self-resolved
   * @param {string} lowerQuery - Lowercase query
   * @param {string} category - Issue category
   * @returns {boolean} - True if requires ticket
   */
  requiresTicket(lowerQuery, category) {
    // Always create tickets for hardware requests, complex issues
    const alwaysTicket = [
      'new laptop', 'new computer', 'hardware request', 'replacement',
      'install software', 'setup account', 'access request', 'permission',
      'broken', 'not working', 'damaged', 'upgrade'
    ];

    return alwaysTicket.some(phrase => lowerQuery.includes(phrase));
  }

  /**
   * Get category display title
   * @param {string} category - Category code
   * @returns {string} - Display title
   */
  getCategoryTitle(category) {
    const titles = {
      'password_reset': 'Password Reset',
      'network_support': 'Network Connection',
      'email_support': 'Email Support',
      'software_installation': 'Software Installation',
      'hardware_support': 'Hardware Support',
      'general_support': 'General IT Support'
    };
    return titles[category] || 'IT Support';
  }

  /**
   * Get expected response time based on category
   * @param {string} category - Issue category
   * @returns {string} - Response time
   */
  getResponseTime(category) {
    const urgent = ['password_reset', 'network_support', 'hardware_support'];
    return urgent.includes(category) ? 'Within 2 hours' : 'Within 24 hours';
  }

  /**
   * Enhanced application access evaluation using RAG context
   * @param {Object} user - User object
   * @param {Object} application - Application object
   * @param {string} query - User query
   * @param {Object} ragResult - LangChain RAG result
   * @returns {Promise<Object>} - Access decision
   */
  async evaluateApplicationAccessWithRAG(user, application, query, ragResult) {
    const userPosition = user.position.toLowerCase();
    const userDepartment = user.department.toLowerCase();
    
    // Check if RAG found relevant application policies
    const appPolicyDocs = ragResult.ragContext.documents.filter(doc => 
      doc.metadata.type === 'application_policy' && 
      doc.content.toLowerCase().includes(application.name.toLowerCase())
    );

    if (appPolicyDocs.length > 0) {
      const policyDoc = appPolicyDocs[0];
      
      // Use AI to evaluate access based on policy
      const evaluationPrompt = `
Based on this application policy, should ${user.firstName} ${user.lastName} (${user.position} in ${user.department}) get access to ${application.name}?

Policy: ${policyDoc.content}
User's Job: ${user.jobDescription}
Request: ${query}

Respond with: APPROVED or DENIED followed by a clear reason.
      `;

      try {
        const aiDecision = await this.ollamaService.generateResponse(evaluationPrompt);
        const isApproved = aiDecision.toLowerCase().includes('approved');
        
        return {
          approved: isApproved,
          reason: aiDecision,
          justification: `AI-evaluated based on company policy: ${policyDoc.metadata.category}`,
          policyReference: policyDoc.content
        };
      } catch (error) {
        console.error('AI evaluation error:', error);
      }
    }

    // Fallback to rule-based evaluation
    return this.evaluateApplicationAccess(user, application, query);
  }

  /**
   * Get immediate IT solutions using RAG context
   * @param {string} query - User query
   * @param {string} category - Issue category
   * @param {Object} ragResult - LangChain RAG result
   * @returns {string|null} - Immediate solution or null
   */
  getImmediateSolutionFromRAG(query, category, ragResult) {
    // Look for relevant IT policies in RAG results
    const itPolicyDocs = ragResult.ragContext.documents.filter(doc => 
      doc.metadata.type === 'it_policy'
    );

    // Password-related issues
    if (category === 'password_reset' || query.toLowerCase().includes('password')) {
      const passwordPolicy = itPolicyDocs.find(doc => 
        doc.content.toLowerCase().includes('password')
      );
      
      if (passwordPolicy) {
        return `**🔑 Password Reset Solution:**

Based on our IT policy: ${passwordPolicy.content}

**Quick Steps:**
1. Go to: password.company.com
2. Enter your email: ${this.authenticatedUser.email}
3. Check email for reset link
4. Follow instructions to set new password

**Policy Reminder:** ${passwordPolicy.content.split('.')[0]}.`;
      }
    }

    // Fallback to basic solutions
    return this.getImmediateITHelp(query, category);
  }

  /**
   * Extract relevant policy text from RAG context
   * @param {Object} ragContext - RAG context with documents
   * @param {string} policyType - Type of policy to extract
   * @returns {string} - Formatted policy text
   */
  getRelevantPolicyText(ragContext, policyType) {
    const relevantDocs = ragContext.documents.filter(doc => 
      doc.metadata.type === policyType
    );

    if (relevantDocs.length === 0) {
      return 'No specific policy information found.';
    }

    return relevantDocs
      .slice(0, 2) // Limit to 2 most relevant
      .map(doc => `• ${doc.content}`)
      .join('\n');
  }

  /**
   * Format application access response
   */
  formatApplicationAccessResponse(serviceResult, ragResult) {
    const user = this.authenticatedUser;
    
    switch (serviceResult.action) {
      case 'access_granted':
        return `Hi ${user.firstName}! Great news! I've automatically approved your access to ${serviceResult.application.name}.\n\n✅ Access Granted\n🎫 Ticket #${serviceResult.ticket.id} created\n📋 License Type: ${serviceResult.application.licenseTypes[0]}\n\nYour access should be active within the next few minutes. You'll receive an email confirmation shortly.\n\nIs there anything else I can help you with?`;
      
      case 'already_has_access':
        return `Hi ${user.firstName}! You already have access to ${serviceResult.application.name}.\n\n✅ Status: Active\n📅 Granted: ${new Date(serviceResult.access.dateGranted).toLocaleDateString()}\n🔐 License Type: ${serviceResult.access.licenseType}\n\nYou can start using the application right away. Is there anything else I can help you with?`;
      
      case 'eligibility_failed':
        return `Hi ${user.firstName}! Unfortunately, access to ${serviceResult.application.name} is ${serviceResult.reason}.\n\n📋 Current Eligibility: ${serviceResult.application.targetPersonas.join(', ')}\n👤 Your Role: ${user.position} in ${user.department}\n\nIf you believe you should have access, I can create a ticket for manual review. Would you like me to do that?`;
      
      case 'application_not_found':
        return `Hi ${user.firstName}! I couldn't find an application called "${serviceResult.requestedApp}".\n\nHere are the available applications:\n${serviceResult.availableApps}\n\nPlease specify which one you need access to.`;
      
      default:
        return `Hi ${user.firstName}! ${serviceResult.message}\n\nHow else can I help you?`;
    }
  }

  /**
   * Format vacation response
   */
  formatVacationResponse(serviceResult, user) {
    return `Hi ${user.firstName}! Here's your vacation information:\n\n🏖️ **Vacation Balance**\n📅 Days Available: ${serviceResult.vacationDays} days\n📊 Days Used This Year: ${serviceResult.usedDays} days\n📈 Total Annual Allowance: ${serviceResult.totalDays} days\n\n${serviceResult.additionalInfo || ''}\n\nIs there anything else I can help you with?`;
  }

  /**
   * Format salary response
   */
  formatSalaryResponse(serviceResult, user) {
    return `Hi ${user.firstName}! Here's your salary information:\n\n💰 **Compensation Details**\n${serviceResult.message}\n\nFor specific questions about your compensation package, please contact HR.\n\nIs there anything else I can help you with?`;
  }

  /**
   * Format benefits response
   */
  formatBenefitsResponse(serviceResult, user) {
    return `Hi ${user.firstName}! Here's your benefits information:\n\n🏥 **Benefits Package**\n${serviceResult.message}\n\nFor detailed benefits information, please check the employee portal.\n\nIs there anything else I can help you with?`;
  }

  /**
   * Format manager response
   */
  formatManagerResponse(serviceResult, user) {
    return `Hi ${user.firstName}! Here's your manager information:\n\n👤 **Manager Details**\n${serviceResult.message}\n\nIs there anything else I can help you with?`;
  }

  /**
   * Format employee info response
   */
  formatEmployeeInfoResponse(serviceResult, user) {
    return `Hi ${user.firstName}! Here's your information:\n\n👤 **Your Profile**\n${serviceResult.message}\n\nIs there anything else I can help you with?`;
  }

  /**
   * Format employee lookup response
   */
  formatEmployeeLookupResponse(serviceResult, user) {
    return `Hi ${user.firstName}! ${serviceResult.message}\n\nIs there anything else I can help you with?`;
  }

  /**
   * Format application listing response
   */
  formatApplicationListingResponse(serviceResult, user) {
    return `Hi ${user.firstName}! Here are the applications I can help you with:\n\n${serviceResult.message}\n\nWhich application would you like more information about?`;
  }

  /**
   * Format error response
   */
  formatErrorResponse(serviceResult, user) {
    return `Salut ${user.firstName} ! ${serviceResult.message}\n\nComment puis-je vous aider d'autre ?`;
  }

  /**
   * Format policy response
   */
  formatPolicyResponse(serviceResult, user) {
    let response = `Salut ${user.firstName} ! ${serviceResult.message}`;
    
    // Add follow-up question for detailed policies
    if (serviceResult.type === 'policy_listing') {
      // Set up a pending action for policy clarification
      this.conversationHistory.setPendingAction(user.email, 'policy_clarification', {
        intent: 'detailed_policy_info',
        availablePolicies: serviceResult.policies
      });
    }
    
    return response + "\n\nY a-t-il autre chose pour laquelle je peux vous aider ?";
  }

  /**
   * Enhanced application access response with confirmation
   */
  formatApplicationAccessResponse(serviceResult, ragResult) {
    const user = this.authenticatedUser;
    
    switch (serviceResult.action) {
      case 'access_granted':
        return `Salut ${user.firstName} ! Excellente nouvelle ! J'ai automatiquement approuvé votre accès à ${serviceResult.application.name}.\n\n✅ Accès accordé\n🎫 Ticket #${serviceResult.ticket.id} créé\n📋 Type de licence : ${serviceResult.application.licenseTypes[0]}\n\nVotre accès devrait être actif dans les prochaines minutes. Vous recevrez un email de confirmation.\n\nY a-t-il autre chose pour laquelle je peux vous aider ?`;
      
      case 'already_has_access':
        return `Salut ${user.firstName} ! Vous avez déjà accès à ${serviceResult.application.name}.\n\n✅ Statut : Actif\n📅 Accordé le : ${new Date(serviceResult.access.dateGranted).toLocaleDateString()}\n🔐 Type de licence : ${serviceResult.access.licenseType}\n\nVous pouvez commencer à utiliser l'application immédiatement. Y a-t-il autre chose pour laquelle je peux vous aider ?`;
      
      case 'eligibility_failed':
        // Set up pending action for manual ticket creation
        this.conversationHistory.setPendingAction(user.email, 'ticket_creation_confirmation', {
          user: user,
          application: serviceResult.application,
          reason: 'Demande manuelle - éligibilité non automatique'
        });
        
        return `Salut ${user.firstName} ! Malheureusement, l'accès à ${serviceResult.application.name} ${serviceResult.reason}.\n\n📋 Éligibilité actuelle : ${serviceResult.application.targetPersonas.join(', ')}\n👤 Votre rôle : ${user.position} dans ${user.department}\n\nSi vous pensez avoir besoin de cet accès, je peux créer un ticket pour examen manuel. Souhaitez-vous que je procède ?`;
      
      case 'application_not_found':
        return `Salut ${user.firstName} ! Je n'ai pas trouvé d'application appelée "${serviceResult.requestedApp}".\n\nVoici les applications disponibles :\n${serviceResult.availableApps}\n\nVeuillez préciser laquelle vous souhaitez.`;
      
      default:
        return `Salut ${user.firstName} ! ${serviceResult.message}\n\nComment puis-je vous aider d'autre ?`;
    }
  }
}

module.exports = HRITService;