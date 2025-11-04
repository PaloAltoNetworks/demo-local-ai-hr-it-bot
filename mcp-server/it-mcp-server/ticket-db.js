/**
 * Ticket Database Service
 * Handles all database operations for IT tickets
 */
import { getDatabase } from './database-manager.js';

class TicketService {
  constructor() {
    this.db = null;
  }

  /**
   * Initialize service
   */
  async init() {
    const dbManager = getDatabase();
    this.db = dbManager;
  }

  /**
   * Get all tickets
   */
  getAllTickets(filters = {}) {
    const query = this._buildQuery(filters);
    return this.db.all(query.sql, query.params);
  }

  /**
   * Get ticket by ID
   */
  getTicketById(ticketId) {
    return this.db.get('SELECT * FROM tickets WHERE ticket_id = ?', [ticketId]);
  }

  /**
   * Get tickets by status
   */
  getTicketsByStatus(status) {
    return this.db.all('SELECT * FROM tickets WHERE status = ? ORDER BY priority DESC, date DESC', [status]);
  }

  /**
   * Get tickets by priority
   */
  getTicketsByPriority(priority) {
    return this.db.all('SELECT * FROM tickets WHERE priority = ? ORDER BY date DESC', [priority]);
  }

  /**
   * Get tickets assigned to a technician
   */
  getTicketsByAssigneeEmail(email) {
    return this.db.all('SELECT * FROM tickets WHERE assigned_to_email = ? ORDER BY priority DESC, date DESC', [email]);
  }

  /**
   * Get tickets by employee
   */
  getTicketsByEmployeeEmail(email) {
    return this.db.all('SELECT * FROM tickets WHERE employee_email = ? ORDER BY date DESC', [email]);
  }

  /**
   * Get tickets by category
   */
  getTicketsByCategory(category) {
    return this.db.all('SELECT * FROM tickets WHERE category = ? ORDER BY priority DESC, date DESC', [category]);
  }

  /**
   * Search tickets by description
   */
  searchTickets(searchTerm) {
    const term = `%${searchTerm}%`;
    return this.db.all(`
      SELECT * FROM tickets 
      WHERE 
        ticket_id LIKE ? OR 
        description LIKE ? OR 
        tags LIKE ? OR 
        category LIKE ? OR
        employee_name LIKE ?
      ORDER BY priority DESC, date DESC
    `, [term, term, term, term, term]);
  }

  /**
   * Get ticket statistics
   */
  getStatistics() {
    const total = this.db.get('SELECT COUNT(*) as total FROM tickets')?.total || 0;

    const byStatus = this.db.all(`
      SELECT status, COUNT(*) as count FROM tickets GROUP BY status ORDER BY status
    `);

    const byPriority = this.db.all(`
      SELECT priority, COUNT(*) as count FROM tickets GROUP BY priority 
      ORDER BY CASE priority WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END
    `);

    const byCategory = this.db.all(`
      SELECT category, COUNT(*) as count FROM tickets GROUP BY category ORDER BY count DESC
    `);

    const byAssignee = this.db.all(`
      SELECT assigned_to_email as email, assigned_to as name, COUNT(*) as count FROM tickets GROUP BY assigned_to_email ORDER BY count DESC
    `);

    return {
      total,
      byStatus,
      byPriority,
      byCategory,
      byAssignee
    };
  }

  /**
   * Create new ticket
   */
  createTicket(data) {
    const result = this.db.run(`
      INSERT INTO tickets (
        ticket_id, employee_email, employee_name, date, status, description, 
        priority, category, assigned_to_email, assigned_to, resolution_time, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      data.ticket_id,
      data.employee_email || data.employee_name.toLowerCase().replace(/\s+/g, '.') + '@company.com',
      data.employee_name,
      data.date,
      data.status,
      data.description,
      data.priority,
      data.category,
      data.assigned_to_email || data.assigned_to.toLowerCase().replace(/\s+/g, '.') + '@company.com',
      data.assigned_to,
      data.resolution_time || null,
      data.tags || null
    ]);

    return result.changes > 0;
  }

  /**
   * Update ticket
   */
  updateTicket(ticketId, updates) {
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (key !== 'id' && key !== 'ticket_id' && key !== 'created_at') {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(ticketId);

    const sql = `UPDATE tickets SET ${fields.join(', ')} WHERE ticket_id = ?`;
    const result = this.db.run(sql, values);

    return result.changes > 0;
  }

  /**
   * Update ticket status
   */
  updateStatus(ticketId, status) {
    return this.updateTicket(ticketId, { status });
  }

  /**
   * Assign ticket to technician
   */
  assignTicket(ticketId, technician) {
    return this.updateTicket(ticketId, { assigned_to: technician });
  }

  /**
   * Delete ticket
   */
  deleteTicket(ticketId) {
    const result = this.db.run('DELETE FROM tickets WHERE ticket_id = ?', [ticketId]);
    return result.changes > 0;
  }

  /**
   * Get all distinct values for a field
   */
  getDistinctValues(field) {
    const rows = this.db.all(`SELECT DISTINCT ${field} FROM tickets ORDER BY ${field}`);
    return rows.map(row => row[field]);
  }

  /**
   * Add a discussion comment to a ticket
   */
  addDiscussion(ticketId, authorEmail, authorName, content, commentType = 'comment', isInternal = false) {
    const result = this.db.run(`
      INSERT INTO ticket_discussions (ticket_id, author_email, author_name, comment_type, content, is_internal)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [ticketId, authorEmail, authorName, commentType, content, isInternal ? 1 : 0]);

    return result.changes > 0;
  }

  /**
   * Get all discussions for a ticket
   */
  getTicketDiscussions(ticketId) {
    return this.db.all(`
      SELECT * FROM ticket_discussions 
      WHERE ticket_id = ? 
      ORDER BY created_at ASC
    `, [ticketId]);
  }

  /**
   * Get internal notes for a ticket (only internal discussions)
   */
  getTicketInternalNotes(ticketId) {
    return this.db.all(`
      SELECT * FROM ticket_discussions 
      WHERE ticket_id = ? AND is_internal = 1
      ORDER BY created_at ASC
    `, [ticketId]);
  }

  /**
   * Get discussion count for a ticket
   */
  getDiscussionCount(ticketId) {
    const result = this.db.get(`
      SELECT COUNT(*) as count FROM ticket_discussions WHERE ticket_id = ?
    `, [ticketId]);
    return result?.count || 0;
  }

  /**
   * Update a discussion comment
   */
  updateDiscussion(discussionId, content) {
    const result = this.db.run(`
      UPDATE ticket_discussions 
      SET content = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [content, discussionId]);

    return result.changes > 0;
  }

  /**
   * Delete a discussion comment
   */
  deleteDiscussion(discussionId) {
    const result = this.db.run(`
      DELETE FROM ticket_discussions WHERE id = ?
    `, [discussionId]);

    return result.changes > 0;
  }

  /**
   * Get all discussions as formatted text (for AI context)
   */
  getDiscussionsAsText(ticketId) {
    const discussions = this.getTicketDiscussions(ticketId);
    
    if (discussions.length === 0) {
      return 'No discussions yet';
    }

    const lines = [
      `=== TICKET DISCUSSIONS (${discussions.length} comments) ===\n`,
      ...discussions.map(d => {
        const internalLabel = d.is_internal ? '[INTERNAL]' : '[CUSTOMER]';
        return `${internalLabel} ${d.author_name} (${d.author_email}) - ${d.created_at}
Type: ${d.comment_type}
${d.content}
`;
      })
    ];

    return lines.join('\n');
  }

  /**
   * Build dynamic query based on filters
   */
  _buildQuery(filters = {}) {
    let sql = 'SELECT * FROM tickets WHERE 1=1';
    const params = [];

    if (filters.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }

    if (filters.priority) {
      sql += ' AND priority = ?';
      params.push(filters.priority);
    }

    if (filters.assigned_to) {
      sql += ' AND assigned_to = ?';
      params.push(filters.assigned_to);
    }

    if (filters.category) {
      sql += ' AND category = ?';
      params.push(filters.category);
    }

    if (filters.employee_name) {
      sql += ' AND employee_name = ?';
      params.push(filters.employee_name);
    }

    if (filters.search) {
      sql += ' AND (description LIKE ? OR tags LIKE ?)';
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm);
    }

    // Default ordering
    sql += ' ORDER BY priority DESC, date DESC';

    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }

    return { sql, params };
  }
}

// Export singleton
let instance = null;

export function getTicketService() {
  if (!instance) {
    instance = new TicketService();
    // Don't call init() here - let the caller do it via async function
  }
  return instance;
}

export async function initializeTicketService() {
  const service = getTicketService();
  await service.init();
  return service;
}

export { TicketService };
