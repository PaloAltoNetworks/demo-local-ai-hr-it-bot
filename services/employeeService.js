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

  // ========================================
  // LANGCHAIN INTEGRATION METHODS
  // ========================================

  /**
   * Get intent patterns that this service can handle
   * @returns {Array} Array of intent patterns with examples
   */
  getIntentPatterns() {
    return [
      {
        intent: 'hr_inquiry',
        examples: [
          'How many vacation days do I have',
          'What is my salary information',
          'Show me my benefits',
          'What are my emergency contacts',
          'When was I hired',
          'Who is my manager'
        ],
        confidence: 1.0,
        serviceHandler: 'handleHRInquiryIntent'
      },
      {
        intent: 'employee_lookup',
        examples: [
          'Who is John Smith',
          'Find employee in marketing',
          'Show me HR team members',
          'What is Emma Thompson\'s role',
          'List all employees in IT'
        ],
        confidence: 0.9,
        serviceHandler: 'handleEmployeeLookupIntent'
      }
    ];
  }

  /**
   * Generate LangChain documents from employee data
   * @returns {Array} Array of document objects for LangChain
   */
  getLangChainDocuments() {
    const documents = [];
    const employees = this.getAllEmployees();

    employees.forEach(employee => {
      // Employee profile document
      documents.push({
        pageContent: `Employee: ${employee.firstName} ${employee.lastName}, Position: ${employee.position}, Department: ${employee.department}, Location: ${employee.location}, Hire Date: ${employee.hireDate}, Job Description: ${employee.jobDescription || 'Not specified'}`,
        metadata: {
          type: 'employee_profile',
          employeeId: employee.id,
          department: employee.department,
          position: employee.position,
          serviceSource: 'EmployeeService'
        }
      });

      // Benefits information document
      if (employee.benefits) {
        documents.push({
          pageContent: `${employee.firstName} ${employee.lastName} Benefits: Vacation days - Total: ${employee.benefits.vacation?.total}, Used: ${employee.benefits.vacation?.used}, Remaining: ${employee.benefits.vacation?.remaining}. Sick leave - Total: ${employee.benefits.sickLeave?.total}, Used: ${employee.benefits.sickLeave?.used}, Remaining: ${employee.benefits.sickLeave?.remaining}`,
          metadata: {
            type: 'employee_benefits',
            employeeId: employee.id,
            category: 'benefits',
            serviceSource: 'EmployeeService'
          }
        });
      }

      // Job role and responsibilities document
      if (employee.jobDescription) {
        documents.push({
          pageContent: `Job Role Information: ${employee.firstName} ${employee.lastName} (${employee.position}): ${employee.jobDescription}. This role is in the ${employee.department} department.`,
          metadata: {
            type: 'job_role',
            employeeId: employee.id,
            position: employee.position,
            department: employee.department,
            serviceSource: 'EmployeeService'
          }
        });
      }
    });

    return documents;
  }

  /**
   * Handle HR inquiry intent from LangChain
   * @param {string} query - User query
   * @param {Object} context - Additional context including current user
   * @returns {Object} Intent handling result
   */
  async handleHRInquiryIntent(query, context = {}) {
    const currentUser = context.user;
    if (!currentUser) {
      return {
        type: 'authentication_required',
        message: 'I need to know who you are to provide personal HR information.',
        suggestedActions: ['Login', 'Provide employee ID']
      };
    }

    const employee = this.getEmployeeByEmail(currentUser.email);
    if (!employee) {
      return {
        type: 'employee_not_found',
        message: 'I couldn\'t find your employee record.',
        suggestedActions: ['Contact HR', 'Verify email address']
      };
    }

    // Determine what specific information is being requested
    const lowerQuery = query.toLowerCase();
    
    if (lowerQuery.includes('vacation') || lowerQuery.includes('pto')) {
      return {
        type: 'vacation_info',
        data: employee.benefits?.vacation,
        employee: {
          name: `${employee.firstName} ${employee.lastName}`,
          position: employee.position
        },
        message: 'Here is your vacation day information:',
        suggestedActions: ['Request time off', 'View calendar']
      };
    }

    if (lowerQuery.includes('salary') || lowerQuery.includes('pay')) {
      return {
        type: 'salary_info',
        data: employee.financial?.salary,
        employee: {
          name: `${employee.firstName} ${employee.lastName}`,
          position: employee.position
        },
        message: 'Here is your salary information:',
        suggestedActions: ['View pay stubs', 'Discuss raise']
      };
    }

    if (lowerQuery.includes('benefits')) {
      return {
        type: 'benefits_info',
        data: employee.benefits,
        employee: {
          name: `${employee.firstName} ${employee.lastName}`,
          position: employee.position
        },
        message: 'Here is your benefits information:',
        suggestedActions: ['Enroll in benefits', 'Change selections']
      };
    }

    if (lowerQuery.includes('manager')) {
      const manager = this.getEmployeeByEmail(employee.manager);
      return {
        type: 'manager_info',
        data: manager ? {
          name: `${manager.firstName} ${manager.lastName}`,
          email: manager.email,
          position: manager.position
        } : null,
        message: manager ? 'Here is your manager information:' : 'Manager information not found.',
        suggestedActions: ['Contact manager', 'Schedule meeting']
      };
    }

    // General employee information
    return {
      type: 'general_employee_info',
      data: {
        name: `${employee.firstName} ${employee.lastName}`,
        position: employee.position,
        department: employee.department,
        hireDate: employee.hireDate,
        location: employee.location
      },
      message: 'Here is your general employment information:',
      suggestedActions: ['View full profile', 'Update information']
    };
  }

  /**
   * Handle employee lookup intent from LangChain
   * @param {string} query - User query
   * @param {Object} context - Additional context
   * @returns {Object} Intent handling result
   */
  async handleEmployeeLookupIntent(query, context = {}) {
    const currentUser = context.user;
    
    // Security check - only HR and managers should do broad employee lookups
    if (!currentUser || (!currentUser.position.toLowerCase().includes('hr') && 
                        !currentUser.position.toLowerCase().includes('manager'))) {
      return {
        type: 'access_denied',
        message: 'Employee lookup is restricted to HR personnel and managers.',
        suggestedActions: ['Contact HR for directory access']
      };
    }

    const lowerQuery = query.toLowerCase();
    
    // Look for department mentions
    const departments = ['hr', 'it', 'marketing', 'finance', 'engineering', 'sales'];
    const mentionedDept = departments.find(dept => lowerQuery.includes(dept));
    
    if (mentionedDept) {
      const deptEmployees = this.getEmployeesByDepartment(mentionedDept);
      return {
        type: 'department_lookup',
        department: mentionedDept,
        employees: deptEmployees.map(emp => ({
          name: `${emp.firstName} ${emp.lastName}`,
          position: emp.position,
          email: emp.email
        })),
        message: `Here are employees in the ${mentionedDept} department:`,
        suggestedActions: ['Contact employee', 'View full profile']
      };
    }

    // Look for specific employee names
    const employees = this.getAllEmployees();
    const nameMatches = employees.filter(emp => {
      const fullName = `${emp.firstName} ${emp.lastName}`.toLowerCase();
      return fullName.includes(lowerQuery.replace(/who is |find |show me /g, '').trim());
    });

    if (nameMatches.length > 0) {
      return {
        type: 'employee_search',
        employees: nameMatches.map(emp => ({
          name: `${emp.firstName} ${emp.lastName}`,
          position: emp.position,
          department: emp.department,
          email: emp.email,
          location: emp.location
        })),
        message: 'Here are the matching employees:',
        suggestedActions: ['Contact employee', 'View department']
      };
    }

    return {
      type: 'no_matches',
      message: 'I couldn\'t find any employees matching your search.',
      suggestedActions: ['Try different keywords', 'Browse by department']
    };
  }

  /**
   * Get service metadata for LangChain registration
   * @returns {Object} Service metadata
   */
  getServiceMetadata() {
    return {
      serviceName: 'EmployeeService',
      description: 'Manages employee information, HR data, and organizational structure',
      capabilities: [
        'employee_profile_lookup',
        'benefits_information',
        'organizational_directory',
        'personal_hr_data'
      ],
      intents: this.getIntentPatterns().map(pattern => pattern.intent),
      dataTypes: ['employee_profile', 'employee_benefits', 'job_role'],
      documentCount: this.getLangChainDocuments().length,
      securityLevel: 'high' // Contains sensitive HR data
    };
  }
}

module.exports = EmployeeService;