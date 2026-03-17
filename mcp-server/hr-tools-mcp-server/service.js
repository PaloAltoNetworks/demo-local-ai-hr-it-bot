import { initializeDatabase } from './database-manager.js';
import { initializeEmployeeService } from './employee-db.js';

export class HRService {
  constructor() {
    this.employeeService = null;
  }

  async init() {
    try {
      await initializeDatabase();
      this.employeeService = await initializeEmployeeService();
    } catch (error) {
      throw new Error(`Failed to initialize HR service: ${error.message}`);
    }
  }

  getAllEmployees() {
    return this.employeeService?.getAllEmployees() || [];
  }

  getEmployeeById(employeeId) {
    return this.employeeService?.getEmployeeById(employeeId);
  }

  getEmployeeByEmail(email) {
    return this.employeeService?.getEmployeeByEmail(email);
  }

  getEmployeeByName(name) {
    return this.employeeService?.getEmployeeByName(name);
  }

  searchEmployees(query) {
    return this.employeeService?.searchEmployees(query) || [];
  }

  getEmployeesByDepartment(department) {
    return this.employeeService?.getEmployeesByDepartment(department) || [];
  }

  getEmployeesByManager(managerId) {
    return this.employeeService?.getEmployeesByManager(managerId) || [];
  }

  getDepartments() {
    return this.employeeService?.getDepartments() || [];
  }

  getStatistics() {
    return this.employeeService?.getStatistics() || { total: 0, byDepartment: [], byManager: [] };
  }
}
