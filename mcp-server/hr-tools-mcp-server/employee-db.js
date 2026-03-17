/**
 * Employee Database Service
 * Handles all database operations for HR employee data
 */
import { getDatabase } from './database-manager.js';

const SELECT_WITH_MANAGER = `
  SELECT e.*,
    m.name as manager_name,
    m.email as manager_email
  FROM employees e
  LEFT JOIN employees m ON e.manager_id = m.employee_id
`;

class EmployeeService {
  constructor() {
    this.db = null;
  }

  async init() {
    this.db = getDatabase();
  }

  getAllEmployees() {
    return this.db.all(`${SELECT_WITH_MANAGER} ORDER BY e.name`);
  }

  getEmployeeById(employeeId) {
    return this.db.get(`${SELECT_WITH_MANAGER} WHERE e.employee_id = ?`, [employeeId]);
  }

  getEmployeeByEmail(email) {
    return this.db.get(`${SELECT_WITH_MANAGER} WHERE e.email = ? COLLATE NOCASE`, [email]);
  }

  getEmployeeByName(name) {
    const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return this.db.get(
      `${SELECT_WITH_MANAGER} WHERE e.name = ? COLLATE NOCASE OR e.name_normalized = ? COLLATE NOCASE`,
      [name, normalized]
    );
  }

  searchEmployees(query) {
    const term = `%${query}%`;
    const normalizedTerm = `%${query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()}%`;
    return this.db.all(`
      ${SELECT_WITH_MANAGER}
      WHERE e.employee_id LIKE ? COLLATE NOCASE
        OR e.name LIKE ? COLLATE NOCASE
        OR e.name_normalized LIKE ? COLLATE NOCASE
        OR e.email LIKE ? COLLATE NOCASE
        OR e.role LIKE ? COLLATE NOCASE
        OR e.department LIKE ? COLLATE NOCASE
      ORDER BY e.name
    `, [term, term, normalizedTerm, term, term, term]);
  }

  getEmployeesByDepartment(department) {
    return this.db.all(
      `${SELECT_WITH_MANAGER} WHERE e.department = ? COLLATE NOCASE ORDER BY e.name`,
      [department]
    );
  }

  getEmployeesByManager(managerId) {
    return this.db.all(
      `${SELECT_WITH_MANAGER} WHERE e.manager_id = ? ORDER BY e.name`,
      [managerId]
    );
  }

  getDepartments() {
    return this.db.all(
      'SELECT department, COUNT(*) as count FROM employees GROUP BY department ORDER BY count DESC'
    );
  }

  getStatistics() {
    const total = this.db.get('SELECT COUNT(*) as total FROM employees')?.total || 0;
    const byDepartment = this.db.all(
      'SELECT department, COUNT(*) as count FROM employees GROUP BY department ORDER BY count DESC'
    );
    const byManager = this.db.all(`
      SELECT m.employee_id, m.name, COUNT(*) as count
      FROM employees e
      JOIN employees m ON e.manager_id = m.employee_id
      GROUP BY m.employee_id
      ORDER BY count DESC
    `);
    return { total, byDepartment, byManager };
  }
}

let instance = null;

export async function initializeEmployeeService() {
  if (!instance) {
    instance = new EmployeeService();
    await instance.init();
  }
  return instance;
}

export function getEmployeeService() {
  return instance;
}
