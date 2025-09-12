const EmployeeService = require('../services/employeeService');

describe('EmployeeService', () => {
  let employeeService;

  beforeEach(() => {
    employeeService = new EmployeeService();
  });

  describe('getAllEmployees', () => {
    test('should return array of employees', () => {
      const employees = employeeService.getAllEmployees();
      expect(Array.isArray(employees)).toBe(true);
      expect(employees.length).toBeGreaterThan(0);
    });

    test('should return employees with required properties', () => {
      const employees = employeeService.getAllEmployees();
      const employee = employees[0];
      
      expect(employee).toHaveProperty('id');
      expect(employee).toHaveProperty('firstName');
      expect(employee).toHaveProperty('lastName');
      expect(employee).toHaveProperty('email');
      expect(employee).toHaveProperty('department');
      expect(employee).toHaveProperty('position');
    });
  });

  describe('getEmployeeByEmail', () => {
    test('should find employee by email', () => {
      const employees = employeeService.getAllEmployees();
      const testEmail = employees[0].email;
      
      const result = employeeService.getEmployeeByEmail(testEmail);
      expect(result).toBeTruthy();
      expect(result.email).toBe(testEmail);
    });

    test('should return null for non-existent email', () => {
      const result = employeeService.getEmployeeByEmail('nonexistent@company.com');
      expect(result).toBeNull();
    });
  });

  describe('searchEmployees', () => {
    test('should find employees by first name', () => {
      const employees = employeeService.getAllEmployees();
      const firstName = employees[0].firstName;
      
      const results = employeeService.searchEmployees(firstName);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].firstName.toLowerCase()).toContain(firstName.toLowerCase());
    });

    test('should find employees by department', () => {
      const results = employeeService.searchEmployees('informatique');
      expect(results.length).toBeGreaterThan(0);
      results.forEach(emp => {
        expect(emp.department.toLowerCase()).toContain('informatique');
      });
    });

    test('should return empty array for no matches', () => {
      const results = employeeService.searchEmployees('nonexistentdepartment');
      expect(results).toEqual([]);
    });
  });

  describe('getVacationBalance', () => {
    test('should return vacation balance for valid employee', () => {
      const employees = employeeService.getAllEmployees();
      const employeeId = employees[0].id;
      
      const balance = employeeService.getVacationBalance(employeeId);
      expect(balance).toBeTruthy();
      expect(balance).toHaveProperty('total');
      expect(balance).toHaveProperty('used');
      expect(balance).toHaveProperty('remaining');
    });

    test('should return null for invalid employee ID', () => {
      const balance = employeeService.getVacationBalance('invalid-id');
      expect(balance).toBeNull();
    });
  });

  describe('getOrganizationStats', () => {
    test('should return organization statistics', () => {
      const stats = employeeService.getOrganizationStats();
      
      expect(stats).toHaveProperty('totalEmployees');
      expect(stats).toHaveProperty('activeEmployees');
      expect(stats).toHaveProperty('departments');
      expect(stats).toHaveProperty('positions');
      expect(stats).toHaveProperty('averageTenure');
      
      expect(typeof stats.totalEmployees).toBe('number');
      expect(typeof stats.activeEmployees).toBe('number');
      expect(typeof stats.departments).toBe('object');
      expect(typeof stats.averageTenure).toBe('number');
    });

    test('should have consistent employee counts', () => {
      const stats = employeeService.getOrganizationStats();
      expect(stats.activeEmployees).toBeLessThanOrEqual(stats.totalEmployees);
    });
  });

  describe('addEmployee', () => {
    test('should add new employee successfully', () => {
      const newEmployee = {
        firstName: 'Test',
        lastName: 'User',
        email: 'test.user@company.com',
        department: 'Test Department',
        position: 'Test Position'
      };
      
      const result = employeeService.addEmployee(newEmployee);
      
      expect(result).toHaveProperty('id');
      expect(result.firstName).toBe(newEmployee.firstName);
      expect(result.email).toBe(newEmployee.email);
      expect(result.status).toBe('active');
    });

    test('should generate unique IDs for new employees', () => {
      const employee1 = employeeService.addEmployee({
        firstName: 'Test1',
        lastName: 'User1',
        email: 'test1@company.com',
        department: 'Test',
        position: 'Test'
      });
      
      const employee2 = employeeService.addEmployee({
        firstName: 'Test2',
        lastName: 'User2',
        email: 'test2@company.com',
        department: 'Test',
        position: 'Test'
      });
      
      expect(employee1.id).not.toBe(employee2.id);
    });
  });
});