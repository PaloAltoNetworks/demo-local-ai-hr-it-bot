/**
 * HR employee data over employees.db, built from employees.sql by seed.js (node:sqlite), read-only.
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DB_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'employees.db');

const SELECT_WITH_MANAGER = `
  SELECT e.*,
    m.name as manager_name,
    m.email as manager_email
  FROM employees e
  LEFT JOIN employees m ON e.manager_id = m.employee_id
`;

/** Lowercases and strips diacritics, matching the `name_normalized` column. */
const normalize = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export class HRService {
  constructor() {
    if (!fs.existsSync(DB_PATH)) throw new Error(`Database file not found at ${DB_PATH}. Run npm run seed-db first.`);
    this.db = new DatabaseSync(DB_PATH, { readOnly: true });
  }

  getEmployeeById(employeeId) {
    return this.db.prepare(`${SELECT_WITH_MANAGER} WHERE e.employee_id = ?`).get(employeeId);
  }

  getEmployeeByEmail(email) {
    return this.db.prepare(`${SELECT_WITH_MANAGER} WHERE e.email = ? COLLATE NOCASE`).get(email);
  }

  getEmployeeByName(name) {
    return this.db.prepare(
      `${SELECT_WITH_MANAGER} WHERE e.name = ? COLLATE NOCASE OR e.name_normalized = ? COLLATE NOCASE`
    ).get(name, normalize(name));
  }

  searchEmployees(query) {
    const term = `%${query}%`;
    return this.db.prepare(`
      ${SELECT_WITH_MANAGER}
      WHERE e.employee_id LIKE ? COLLATE NOCASE
        OR e.name LIKE ? COLLATE NOCASE
        OR e.name_normalized LIKE ? COLLATE NOCASE
        OR e.email LIKE ? COLLATE NOCASE
        OR e.role LIKE ? COLLATE NOCASE
        OR e.department LIKE ? COLLATE NOCASE
      ORDER BY e.name
    `).all(term, term, `%${normalize(query)}%`, term, term, term);
  }

  getEmployeesByManager(managerId) {
    return this.db.prepare(`${SELECT_WITH_MANAGER} WHERE e.manager_id = ? ORDER BY e.name`).all(managerId);
  }
}
