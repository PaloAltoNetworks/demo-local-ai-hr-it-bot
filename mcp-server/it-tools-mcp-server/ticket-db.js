/**
 * Ticket Database Service
 * Handles all database operations for IT tickets, assets, and processes
 */
import { getDatabase } from './database-manager.js';

class TicketService {
  constructor() {
    this.db = null;
  }

  async init() {
    const dbManager = getDatabase();
    this.db = dbManager;
  }

  // --- Tickets ---

  getAllTickets(filters = {}) {
    const query = this._buildQuery(filters);
    return this.db.all(query.sql, query.params);
  }

  getTicketById(ticketId) {
    return this.db.get('SELECT * FROM tickets WHERE ticket_id = ?', [ticketId]);
  }

  getTicketsByStatus(status) {
    return this.db.all('SELECT * FROM tickets WHERE status = ? ORDER BY priority DESC, date DESC', [status]);
  }

  getTicketsByPriority(priority) {
    return this.db.all('SELECT * FROM tickets WHERE priority = ? ORDER BY date DESC', [priority]);
  }

  getTicketsByEmployeeEmail(email) {
    return this.db.all('SELECT * FROM tickets WHERE employee_email = ? ORDER BY date DESC', [email]);
  }

  getTicketsByEmployeeId(employeeId) {
    return this.db.all('SELECT * FROM tickets WHERE employee_id = ? ORDER BY date DESC', [employeeId]);
  }

  getTicketsByCategory(category) {
    return this.db.all('SELECT * FROM tickets WHERE category = ? ORDER BY priority DESC, date DESC', [category]);
  }

  getTicketDiscussions(ticketId) {
    return this.db.all(
      'SELECT * FROM ticket_discussions WHERE ticket_id = ? ORDER BY created_at ASC',
      [ticketId]
    );
  }

  getStatistics() {
    const total = this.db.get('SELECT COUNT(*) as total FROM tickets')?.total || 0;
    const byStatus = this.db.all('SELECT status, COUNT(*) as count FROM tickets GROUP BY status ORDER BY status');
    const byPriority = this.db.all(`
      SELECT priority, COUNT(*) as count FROM tickets GROUP BY priority
      ORDER BY CASE priority WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END
    `);
    const byCategory = this.db.all('SELECT category, COUNT(*) as count FROM tickets GROUP BY category ORDER BY count DESC');
    const byAssignee = this.db.all('SELECT assigned_to_email as email, assigned_to as name, COUNT(*) as count FROM tickets GROUP BY assigned_to_email ORDER BY count DESC');
    return { total, byStatus, byPriority, byCategory, byAssignee };
  }

  searchTickets(searchTerm) {
    const term = `%${searchTerm}%`;
    return this.db.all(`
      SELECT * FROM tickets
      WHERE ticket_id LIKE ? OR employee_id LIKE ? OR description LIKE ? OR tags LIKE ? OR category LIKE ? OR employee_name LIKE ?
      ORDER BY priority DESC, date DESC
    `, [term, term, term, term, term, term]);
  }

  createTicket(data) {
    const result = this.db.run(`
      INSERT INTO tickets (
        ticket_id, employee_id, employee_email, employee_name, date, status, description,
        priority, category, assigned_to_id, assigned_to_email, assigned_to, resolution_time, tags, internal_notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      data.ticket_id,
      data.employee_id,
      data.employee_email,
      data.employee_name,
      data.date,
      data.status,
      data.description,
      data.priority,
      data.category,
      data.assigned_to_id || null,
      data.assigned_to_email,
      data.assigned_to,
      data.resolution_time || null,
      data.tags || null,
      data.internal_notes || null
    ]);
    return result.changes > 0;
  }

  updateTicketStatus(ticketId, status) {
    const result = this.db.run(
      'UPDATE tickets SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE ticket_id = ?',
      [status, ticketId]
    );
    return result.changes > 0;
  }

  getNextTicketId() {
    const row = this.db.get("SELECT MAX(CAST(SUBSTR(ticket_id, 10) AS INTEGER)) as max_num FROM tickets");
    const num = row?.max_num || 0;
    return `INC-2025-${String(num + 1).padStart(4, '0')}`;
  }

  addDiscussion(data) {
    const result = this.db.run(`
      INSERT INTO ticket_discussions (ticket_id, author_email, author_name, comment_type, content, is_internal)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [data.ticket_id, data.author_email, data.author_name, data.comment_type || 'comment', data.content, data.is_internal ? 1 : 0]);
    return result.changes > 0;
  }

  // --- Assets ---

  getAssetsByEmployee(email) {
    return this.db.all('SELECT * FROM assets WHERE employee_email = ? ORDER BY assigned_date DESC', [email]);
  }

  getAssetsByEmployeeId(employeeId) {
    return this.db.all('SELECT * FROM assets WHERE employee_id = ? ORDER BY assigned_date DESC', [employeeId]);
  }

  getAssetById(assetId) {
    return this.db.get('SELECT * FROM assets WHERE asset_id = ?', [assetId]);
  }

  // --- IT Processes ---

  getAllProcesses() {
    return this.db.all('SELECT * FROM it_processes ORDER BY name');
  }

  getProcessById(processId) {
    return this.db.get('SELECT * FROM it_processes WHERE id = ?', [processId]);
  }

  searchProcesses(query) {
    const term = `%${query}%`;
    return this.db.all(
      'SELECT * FROM it_processes WHERE name LIKE ? OR description LIKE ? OR category LIKE ? OR keywords LIKE ? ORDER BY name',
      [term, term, term, term]
    );
  }

  // --- Private ---

  _buildQuery(filters = {}) {
    let sql = 'SELECT * FROM tickets WHERE 1=1';
    const params = [];

    if (filters.status) { sql += ' AND status = ?'; params.push(filters.status); }
    if (filters.priority) { sql += ' AND priority = ?'; params.push(filters.priority); }
    if (filters.category) { sql += ' AND category = ?'; params.push(filters.category); }
    if (filters.employee_email) { sql += ' AND employee_email = ?'; params.push(filters.employee_email); }
    if (filters.employee_id) { sql += ' AND employee_id = ?'; params.push(filters.employee_id); }

    sql += ' ORDER BY priority DESC, date DESC';
    if (filters.limit) { sql += ' LIMIT ?'; params.push(filters.limit); }

    return { sql, params };
  }
}

let instance = null;

export async function initializeTicketService() {
  if (!instance) {
    instance = new TicketService();
    await instance.init();
  }
  return instance;
}

export function getTicketService() {
  return instance;
}
