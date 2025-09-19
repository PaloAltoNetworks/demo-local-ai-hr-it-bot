const { v4: uuidv4 } = require('uuid');

/**
 * Ticket Service - Handles IT/HR ticket creation and management
 * Replaces outdated email aliases and phone redirects
 */
class TicketService {
  constructor() {
    this.tickets = new Map();
    this.ticketCounter = 1000;
  }

  /**
   * Create a new IT/HR ticket
   * @param {Object} request - Ticket request details
   * @returns {Object} - Created ticket with ID and details
   */
  createTicket(request) {
    const ticketId = `LAHR-${this.ticketCounter++}`;
    const ticket = {
      id: ticketId,
      type: request.type || 'general',
      title: request.title,
      description: request.description,
      requester: request.requester,
      priority: request.priority || 'medium',
      status: 'open',
      category: request.category || 'general',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      assignedTo: 'La Loutre AI Assistant',
      metadata: request.metadata || {}
    };

    this.tickets.set(ticketId, ticket);
    console.log(`✅ Created ticket ${ticketId}: ${ticket.title}`);
    
    return ticket;
  }

  /**
   * Auto-approve or deny a ticket based on business rules
   * @param {string} ticketId - Ticket ID
   * @param {Object} decision - Approval decision with reason
   * @returns {Object} - Updated ticket
   */
  processTicketDecision(ticketId, decision) {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) {
      throw new Error(`Ticket ${ticketId} not found`);
    }

    ticket.status = decision.approved ? 'approved' : 'denied';
    ticket.resolution = decision.reason;
    ticket.resolvedAt = new Date().toISOString();
    ticket.updatedAt = new Date().toISOString();

    console.log(`🎯 Ticket ${ticketId} ${ticket.status}: ${decision.reason}`);
    
    return ticket;
  }

  /**
   * Create an application access request ticket
   * @param {Object} params - Request parameters
   * @returns {Object} - Created ticket
   */
  createApplicationAccessTicket(params) {
    const { user, application, justification } = params;
    
    return this.createTicket({
      type: 'application_access',
      title: `Application Access Request: ${application.name}`,
      description: `${user.firstName} ${user.lastName} (${user.position}) requests access to ${application.name}. Justification: ${justification || 'Not provided'}`,
      requester: {
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        position: user.position,
        department: user.department
      },
      category: 'access_request',
      priority: this.getAccessRequestPriority(application),
      metadata: {
        applicationId: application.id,
        applicationName: application.name,
        userPosition: user.position,
        userDepartment: user.department,
        justification: justification
      }
    });
  }

  /**
   * Create an IT support ticket
   * @param {Object} params - Request parameters
   * @returns {Object} - Created ticket
   */
  createITSupportTicket(params) {
    const { user, issue, category } = params;
    
    return this.createTicket({
      type: 'it_support',
      title: `IT Support: ${issue}`,
      description: `${user.firstName} ${user.lastName} (${user.position}) needs IT support: ${issue}`,
      requester: {
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        position: user.position,
        department: user.department
      },
      category: category || 'technical_support',
      priority: 'medium',
      metadata: {
        issueType: category,
        userPosition: user.position,
        userDepartment: user.department
      }
    });
  }

  /**
   * Create an HR request ticket
   * @param {Object} params - Request parameters
   * @returns {Object} - Created ticket
   */
  createHRTicket(params) {
    const { user, request, category } = params;
    
    return this.createTicket({
      type: 'hr_request',
      title: `HR Request: ${request}`,
      description: `${user.firstName} ${user.lastName} (${user.position}) has an HR request: ${request}`,
      requester: {
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        position: user.position,
        department: user.department
      },
      category: category || 'hr_general',
      priority: 'medium',
      metadata: {
        requestType: category,
        userPosition: user.position,
        userDepartment: user.department
      }
    });
  }

  /**
   * Get priority level for application access requests
   * @param {Object} application - Application details
   * @returns {string} - Priority level
   */
  getAccessRequestPriority(application) {
    const criticalApps = ['payroll', 'hr-management', 'financial-system'];
    if (criticalApps.some(app => application.name.toLowerCase().includes(app))) {
      return 'high';
    }
    return 'medium';
  }

  /**
   * Get all tickets for a user
   * @param {string} userEmail - User email
   * @returns {Array} - User's tickets
   */
  getUserTickets(userEmail) {
    return Array.from(this.tickets.values())
      .filter(ticket => ticket.requester.email === userEmail)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  /**
   * Get ticket by ID
   * @param {string} ticketId - Ticket ID
   * @returns {Object|null} - Ticket or null if not found
   */
  getTicket(ticketId) {
    return this.tickets.get(ticketId) || null;
  }

  /**
   * Get all open tickets
   * @returns {Array} - Open tickets
   */
  getOpenTickets() {
    return Array.from(this.tickets.values())
      .filter(ticket => ticket.status === 'open')
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
}

module.exports = TicketService;