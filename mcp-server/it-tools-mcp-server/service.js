import { initializeDatabase } from './database-manager.js';
import { initializeTicketService } from './ticket-db.js';

export class ITService {
  constructor() {
    this.ticketService = null;
  }

  async init() {
    try {
      await initializeDatabase();
      this.ticketService = await initializeTicketService();
    } catch (error) {
      throw new Error(`Failed to initialize IT service: ${error.message}`);
    }
  }

  // --- Tickets ---

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
    return this.ticketService?.getTicketsByEmployeeEmail(employeeEmail) || [];
  }

  getTicketsByCategory(category) {
    return this.ticketService?.getTicketsByCategory(category) || [];
  }

  getTicketDiscussions(ticketId) {
    return this.ticketService?.getTicketDiscussions(ticketId) || [];
  }

  getStatistics() {
    return this.ticketService?.getStatistics() || { total: 0, byStatus: [], byPriority: [], byAssignee: [] };
  }

  searchTickets(query) {
    return this.ticketService?.searchTickets(query) || [];
  }

  // --- Ticket mutations ---

  createTicket(data) {
    const ticketId = this.ticketService.getNextTicketId();
    const today = new Date().toISOString().split('T')[0];
    const success = this.ticketService.createTicket({
      ticket_id: ticketId,
      employee_email: data.employee_email,
      employee_name: data.employee_name,
      date: today,
      status: data.status || 'Open',
      description: data.description,
      priority: data.priority || 'Medium',
      category: data.category,
      assigned_to_email: data.assigned_to_email || 'diego.martinez@company.com',
      assigned_to: data.assigned_to || 'Diego Martinez',
      tags: data.tags || data.category.toLowerCase(),
      internal_notes: data.internal_notes || null,
    });
    if (success) {
      return { ticket_id: ticketId, status: data.status || 'Open' };
    }
    return null;
  }

  updateTicketStatus(ticketId, status, approverEmail, approverName) {
    const ticket = this.getTicketById(ticketId);
    if (!ticket) return null;

    const success = this.ticketService.updateTicketStatus(ticketId, status);
    if (success && approverEmail) {
      this.ticketService.addDiscussion({
        ticket_id: ticketId,
        author_email: approverEmail,
        author_name: approverName || approverEmail,
        comment_type: 'approval',
        content: `Ticket ${status.toLowerCase()} by ${approverName || approverEmail}`,
        is_internal: false,
      });
    }
    return success ? { ticket_id: ticketId, status } : null;
  }

  // --- Assets ---

  getAssetsByEmployee(email) {
    return this.ticketService?.getAssetsByEmployee(email) || [];
  }

  getAssetById(assetId) {
    return this.ticketService?.getAssetById(assetId);
  }

  // --- IT Processes ---

  getAllProcesses() {
    const processes = this.ticketService?.getAllProcesses() || [];
    return processes.map(p => ({ ...p, steps: JSON.parse(p.steps), required_info: JSON.parse(p.required_info) }));
  }

  getProcessById(processId) {
    const p = this.ticketService?.getProcessById(processId);
    if (!p) return null;
    return { ...p, steps: JSON.parse(p.steps), required_info: JSON.parse(p.required_info) };
  }

  searchProcesses(query) {
    const processes = this.ticketService?.searchProcesses(query) || [];
    return processes.map(p => ({ ...p, steps: JSON.parse(p.steps), required_info: JSON.parse(p.required_info) }));
  }
}
