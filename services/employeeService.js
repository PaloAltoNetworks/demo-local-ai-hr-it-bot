const { v4: uuidv4 } = require('uuid');
const express = require('express');
const fs = require('fs');
const path = require('path');

class EmployeeService {
  constructor() {
    // In-memory storage for demo purposes
    // In production, this would connect to your enterprise database
    this.employees = new Map();
    this.initializeDemoData();
  }
  
  /**
   * Initialize employee data from JSON file
   */
  initializeDemoData() {
    try {
      const dataPath = path.join(__dirname, '../data/employees.json');
      const employeeData = fs.readFileSync(dataPath, 'utf8');
      const demoEmployees = JSON.parse(employeeData);
      
      demoEmployees.forEach(employee => {
        this.employees.set(employee.id, employee);
      });
      
      console.log(`Loaded ${demoEmployees.length} employees from ${dataPath}`);
    } catch (error) {
      console.error('Error loading employee data:', error);
      console.log('Using empty employee dataset');
    }
  }
  
  /**
   * Get all employees
   * @returns {Array} - Array of all employees
   */
  getAllEmployees() {
    return Array.from(this.employees.values());
  }
  
  /**
   * Get employee by ID
   * @param {string} id - Employee ID
   * @returns {Object|null} - Employee object or null if not found
   */
  getEmployeeById(id) {
    return this.employees.get(id) || null;
  }
  
  /**
   * Get employee by email
   * @param {string} email - Employee email
   * @returns {Object|null} - Employee object or null if not found
   */
  getEmployeeByEmail(email) {
    for (const employee of this.employees.values()) {
      if (employee.email === email) {
        return employee;
      }
    }
    return null;
  }
  
  /**
   * Search employees by name or email
   * @param {string} query - Search query
   * @returns {Array} - Array of matching employees
   */
  searchEmployees(query) {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.employees.values()).filter(employee => 
      employee.firstName.toLowerCase().includes(lowerQuery) ||
      employee.lastName.toLowerCase().includes(lowerQuery) ||
      employee.email.toLowerCase().includes(lowerQuery) ||
      employee.department.toLowerCase().includes(lowerQuery)
    );
  }
  
  /**
   * Get employees by department
   * @param {string} department - Department name
   * @returns {Array} - Array of employees in the department
   */
  getEmployeesByDepartment(department) {
    return Array.from(this.employees.values()).filter(
      employee => employee.department.toLowerCase() === department.toLowerCase()
    );
  }
  
  /**
   * Update employee information
   * @param {string} id - Employee ID
   * @param {Object} updates - Updates to apply
   * @returns {Object|null} - Updated employee or null if not found
   */
  updateEmployee(id, updates) {
    const employee = this.employees.get(id);
    if (!employee) {
      return null;
    }
    
    const updatedEmployee = { ...employee, ...updates };
    this.employees.set(id, updatedEmployee);
    return updatedEmployee;
  }
  
  /**
   * Add new employee
   * @param {Object} employeeData - Employee data
   * @returns {Object} - Created employee
   */
  addEmployee(employeeData) {
    const employee = {
      id: uuidv4(),
      ...employeeData,
      hireDate: employeeData.hireDate || new Date().toISOString().split('T')[0],
      status: employeeData.status || 'active'
    };
    
    this.employees.set(employee.id, employee);
    return employee;
  }
  
  /**
   * Get employee vacation balance
   * @param {string} employeeId - Employee ID
   * @returns {Object|null} - Vacation balance or null if not found
   */
  getVacationBalance(employeeId) {
    const employee = this.employees.get(employeeId);
    if (!employee) {
      return null;
    }
    
    return employee.benefits?.vacation || null;
  }
  
  /**
   * Update vacation balance
   * @param {string} employeeId - Employee ID
   * @param {number} daysUsed - Days used
   * @returns {Object|null} - Updated vacation balance or null if not found
   */
  updateVacationBalance(employeeId, daysUsed) {
    const employee = this.employees.get(employeeId);
    if (!employee || !employee.benefits?.vacation) {
      return null;
    }
    
    employee.benefits.vacation.used += daysUsed;
    employee.benefits.vacation.remaining = employee.benefits.vacation.total - employee.benefits.vacation.used;
    
    return employee.benefits.vacation;
  }
  
  /**
   * Get organization statistics
   * @returns {Object} - Organization statistics
   */
  getOrganizationStats() {
    const employees = Array.from(this.employees.values());
    const departments = {};
    const positions = {};
    
    employees.forEach(employee => {
      // Count by department
      departments[employee.department] = (departments[employee.department] || 0) + 1;
      
      // Count by position
      positions[employee.position] = (positions[employee.position] || 0) + 1;
    });
    
    return {
      totalEmployees: employees.length,
      activeEmployees: employees.filter(e => e.status === 'active').length,
      departments,
      positions,
      averageTenure: this.calculateAverageTenure(employees)
    };
  }
  
  /**
   * Calculate average employee tenure
   * @param {Array} employees - Array of employees
   * @returns {number} - Average tenure in years
   */
  calculateAverageTenure(employees) {
    if (employees.length === 0) return 0;
    
    const currentDate = new Date();
    const totalYears = employees.reduce((sum, employee) => {
      const hireDate = new Date(employee.hireDate);
      const years = (currentDate - hireDate) / (1000 * 60 * 60 * 24 * 365);
      return sum + years;
    }, 0);
    
    return Math.round((totalYears / employees.length) * 10) / 10; // Round to 1 decimal
  }

  /**
   * Get employee salary information
   * @param {string} employeeId - Employee ID
   * @returns {Object|null} - Salary information or null if not found
   */
  getEmployeeSalary(employeeId) {
    const employee = this.employees.get(employeeId);
    if (!employee || !employee.financial?.salary) {
      return null;
    }
    return employee.financial.salary;
  }

  /**
   * Get employee bank details
   * @param {string} employeeId - Employee ID
   * @returns {Object|null} - Bank details or null if not found
   */
  getEmployeeBankDetails(employeeId) {
    const employee = this.employees.get(employeeId);
    if (!employee || !employee.financial?.bankDetails) {
      return null;
    }
    return employee.financial.bankDetails;
  }

  /**
   * Get complete financial information for an employee
   * @param {string} employeeId - Employee ID
   * @returns {Object|null} - Financial information or null if not found
   */
  getEmployeeFinancialInfo(employeeId) {
    const employee = this.employees.get(employeeId);
    if (!employee || !employee.financial) {
      return null;
    }
    return employee.financial;
  }

  /**
   * Get financial information by email (for authenticated user)
   * @param {string} email - Employee email
   * @returns {Object|null} - Financial information or null if not found
   */
  getFinancialInfoByEmail(email) {
    const employee = this.getEmployeeByEmail(email);
    if (!employee || !employee.financial) {
      return null;
    }
    return employee.financial;
  }

  /**
   * Save employee data to JSON file
   */
  saveEmployeeData() {
    try {
      const dataPath = path.join(__dirname, '../data/employees.json');
      const employeeData = Array.from(this.employees.values());
      fs.writeFileSync(dataPath, JSON.stringify(employeeData, null, 2), 'utf8');
      console.log(`Saved ${employeeData.length} employees to ${dataPath}`);
    } catch (error) {
      console.error('Error saving employee data:', error);
    }
  }

  /**
   * Get Express router with all employee-related routes
   * @param {LanguageService} languageService - Language service instance for error messages
   * @returns {express.Router} - Express router instance
   */
  getRoutes(languageService) {
    const router = express.Router();
    const serverLanguage = process.env.SERVER_LANGUAGE || languageService.getDefaultLanguage();

    // Get all employees
    router.get('/', (req, res) => {
      const employees = this.getAllEmployees();
      res.json(employees);
    });
    
    // Get employee by ID
    router.get('/:id', (req, res) => {
      const employee = this.getEmployeeById(req.params.id);
      if (!employee) {
        return res.status(404).json({ 
          error: languageService.getText('errors.employeeNotFound', serverLanguage) 
        });
      }
      res.json(employee);
    });

    return router;
  }
}

module.exports = EmployeeService;