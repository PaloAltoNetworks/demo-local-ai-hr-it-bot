import { initializeDatabase } from './database-manager.js';
import { initializeTicketService } from './ticket-db.js';

export class ITService {
  constructor() {
    this.ticketService = null;
    this.db = null;
  }

  async init() {
    try {
      await initializeDatabase();
      this.ticketService = await initializeTicketService();
    } catch (error) {
      throw new Error(`Failed to initialize IT service: ${error.message}`);
    }
  }

  getAllTickets() {
    return this.ticketService?.getAllTickets() || [];
  }

  getTicketById(ticketId) {
    return this.ticketService?.getTicketById(ticketId);
  }

  getTicketsByStatus(status) {
    return this.ticketService?.getTicketsByStatus(status) || [];
  }

  getTicketsByPriority(priority) {
    return this.ticketService?.getTicketsByPriority(priority) || [];
  }

  getTicketsByEmployee(employeeEmail) {
    return this.ticketService?.getTicketsByEmployee(employeeEmail) || [];
  }

  getTicketsByCategory(category) {
    return this.ticketService?.getTicketsByCategory(category) || [];
  }

  getTicketDiscussions(ticketId) {
    return this.ticketService?.getTicketDiscussions(ticketId) || [];
  }

  getStatistics() {
    return this.ticketService?.getStatistics() || {
      total: 0,
      byStatus: [],
      byPriority: [],
      byAssignee: []
    };
  }

  searchTickets(query) {
    const tickets = this.getAllTickets();
    const queryLower = query.toLowerCase();
    
    return tickets.filter(ticket =>
      ticket.ticket_id.toLowerCase().includes(queryLower) ||
      ticket.employee_name.toLowerCase().includes(queryLower) ||
      ticket.employee_email.toLowerCase().includes(queryLower) ||
      ticket.description.toLowerCase().includes(queryLower) ||
      ticket.category.toLowerCase().includes(queryLower)
    );
  }
}
