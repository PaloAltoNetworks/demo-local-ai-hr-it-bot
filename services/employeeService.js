const { v4: uuidv4 } = require('uuid');
const express = require('express');

class EmployeeService {
  constructor() {
    // In-memory storage for demo purposes
    // In production, this would connect to your enterprise database
    this.employees = new Map();
    this.initializeDemoData();
  }
  
  /**
   * Initialize demo employee data
   */
  initializeDemoData() {
    const demoEmployees = [
      {
        id: uuidv4(),
        firstName: 'Marie',
        lastName: 'Dubois',
        email: 'marie.dubois@company.com',
        department: 'Ressources Humaines',
        position: 'Responsable RH',
        manager: null,
        hireDate: '2020-01-15',
        status: 'active',
        location: 'Paris',
        phone: '+33 1 23 45 67 89',
        emergencyContact: {
          name: 'Pierre Dubois',
          phone: '+33 6 12 34 56 78',
          relationship: 'Époux'
        },
        benefits: {
          vacation: {
            total: 30,
            used: 12,
            remaining: 18
          },
          sickLeave: {
            total: 10,
            used: 2,
            remaining: 8
          }
        }
      },
      {
        id: uuidv4(),
        firstName: 'Jean',
        lastName: 'Martin',
        email: 'jean.martin@company.com',
        department: 'Informatique',
        position: 'Développeur Senior',
        manager: 'marie.dubois@company.com',
        hireDate: '2019-03-10',
        status: 'active',
        location: 'Lyon',
        phone: '+33 4 23 45 67 89',
        emergencyContact: {
          name: 'Sophie Martin',
          phone: '+33 6 87 65 43 21',
          relationship: 'Épouse'
        },
        benefits: {
          vacation: {
            total: 30,
            used: 8,
            remaining: 22
          },
          sickLeave: {
            total: 10,
            used: 0,
            remaining: 10
          }
        }
      },
      {
        id: uuidv4(),
        firstName: 'Sarah',
        lastName: 'Johnson',
        email: 'sarah.johnson@company.com',
        department: 'IT Support',
        position: 'System Administrator',
        manager: 'jean.martin@company.com',
        hireDate: '2021-06-01',
        status: 'active',
        location: 'Remote',
        phone: '+1 555 123 4567',
        emergencyContact: {
          name: 'Michael Johnson',
          phone: '+1 555 987 6543',
          relationship: 'Husband'
        },
        benefits: {
          vacation: {
            total: 25,
            used: 10,
            remaining: 15
          },
          sickLeave: {
            total: 10,
            used: 3,
            remaining: 7
          }
        }
      }
    ];
    
    demoEmployees.forEach(employee => {
      this.employees.set(employee.id, employee);
    });
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