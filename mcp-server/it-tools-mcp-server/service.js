/**
 * IT ticket and asset data over tickets.db, built from tickets.sql by seed.js (node:sqlite). Writes go straight to the file.
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DB_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'tickets.db');

export class ITService {
  constructor() {
    if (!fs.existsSync(DB_PATH)) throw new Error(`Database file not found at ${DB_PATH}. Run npm run seed-db first.`);
    this.db = new DatabaseSync(DB_PATH);
  }

  getTicketById(ticketId) {
    return this.db.prepare('SELECT * FROM tickets WHERE ticket_id = ?').get(ticketId);
  }

  getTicketsByEmployee(email) {
    return this.db.prepare('SELECT * FROM tickets WHERE employee_email = ? ORDER BY date DESC').all(email);
  }

  getTicketsByEmployeeId(employeeId) {
    return this.db.prepare('SELECT * FROM tickets WHERE employee_id = ? ORDER BY date DESC').all(employeeId);
  }

  getTicketDiscussions(ticketId) {
    return this.db.prepare('SELECT * FROM ticket_discussions WHERE ticket_id = ? ORDER BY created_at ASC').all(ticketId);
  }

  /**
   * Opens a ticket dated today with the next INC-2025-NNNN id, assigned to the default IT agent unless given.
   * @returns {{ ticket_id: string, status: string } | null}
   */
  createTicket(data) {
    const { max_num: maxNum } = this.db.prepare('SELECT MAX(CAST(SUBSTR(ticket_id, 10) AS INTEGER)) AS max_num FROM tickets').get();
    const ticketId = `INC-2025-${String((maxNum || 0) + 1).padStart(4, '0')}`;
    const status = data.status || 'Open';
    const { changes } = this.db.prepare(`
      INSERT INTO tickets (ticket_id, employee_id, employee_email, employee_name, date, status, description,
        priority, category, assigned_to_email, assigned_to, tags, internal_notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ticketId,
      data.employee_id || null,
      data.employee_email,
      data.employee_name,
      new Date().toISOString().split('T')[0],
      status,
      data.description,
      data.priority || 'Medium',
      data.category,
      data.assigned_to_email || 'diego.martinez@company.com',
      data.assigned_to || 'Diego Martinez',
      data.tags || data.category.toLowerCase(),
      data.internal_notes || null,
    );
    return changes > 0 ? { ticket_id: ticketId, status } : null;
  }

  /**
   * Sets a ticket's status and, when an approver is given, records an approval comment on it.
   * @returns {{ ticket_id: string, status: string } | null} null when the ticket does not exist
   */
  updateTicketStatus(ticketId, status, approverEmail, approverName) {
    const { changes } = this.db.prepare('UPDATE tickets SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE ticket_id = ?').run(status, ticketId);
    if (changes === 0) return null;
    if (approverEmail) {
      const author = approverName || approverEmail;
      this.db.prepare(`
        INSERT INTO ticket_discussions (ticket_id, author_email, author_name, comment_type, content, is_internal)
        VALUES (?, ?, ?, 'approval', ?, 0)
      `).run(ticketId, approverEmail, author, `Ticket ${status.toLowerCase()} by ${author}`);
    }
    return { ticket_id: ticketId, status };
  }

  getAssetsByEmployee(email) {
    return this.db.prepare('SELECT * FROM assets WHERE employee_email = ? ORDER BY assigned_date DESC').all(email);
  }

  getAssetsByEmployeeId(employeeId) {
    return this.db.prepare('SELECT * FROM assets WHERE employee_id = ? ORDER BY assigned_date DESC').all(employeeId);
  }
}
