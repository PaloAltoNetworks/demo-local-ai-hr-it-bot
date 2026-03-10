import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class HRService {
  constructor() {
    this.employees = null;
    this.rawCsvData = null;
  }

  _normalize(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  async init() {
    const csvPath = path.join(__dirname, 'employees.csv');
    this.rawCsvData = await fs.readFile(csvPath, 'utf8');
    this.employees = this._parseCSV(this.rawCsvData);
  }

  getAllEmployees() {
    return this.employees;
  }

  getEmployeeByEmail(email) {
    return this.employees.find(emp => emp.email.toLowerCase() === email.toLowerCase());
  }

  getEmployeeByName(name) {
    const normalized = this._normalize(name);
    return this.employees.find(emp => this._normalize(emp.name) === normalized);
  }

  searchEmployees(query) {
    const normalized = this._normalize(query);
    return this.employees.filter(emp =>
      this._normalize(emp.name).includes(normalized) ||
      emp.email.toLowerCase().includes(normalized) ||
      this._normalize(emp.role).includes(normalized) ||
      this._normalize(emp.department).includes(normalized)
    );
  }

  getEmployeesByDepartment(department) {
    const normalized = this._normalize(department);
    return this.employees.filter(emp =>
      this._normalize(emp.department) === normalized
    );
  }

  getEmployeesByManager(managerName) {
    const normalized = this._normalize(managerName);
    return this.employees.filter(emp =>
      this._normalize(emp.manager) === normalized
    );
  }

  getDepartments() {
    const depts = {};
    for (const emp of this.employees) {
      if (!depts[emp.department]) {
        depts[emp.department] = 0;
      }
      depts[emp.department]++;
    }
    return Object.entries(depts).map(([department, count]) => ({ department, count }));
  }

  getStatistics() {
    const departments = this.getDepartments();
    const managers = {};
    for (const emp of this.employees) {
      if (emp.manager) {
        if (!managers[emp.manager]) managers[emp.manager] = 0;
        managers[emp.manager]++;
      }
    }
    const byManager = Object.entries(managers)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return {
      total: this.employees.length,
      byDepartment: departments.sort((a, b) => b.count - a.count),
      byManager
    };
  }

  _parseCSV(data) {
    const lines = data.split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

    return lines.slice(1)
      .filter(line => line.trim())
      .map(line => {
        const values = this._parseCSVLine(line);
        const emp = {};
        headers.forEach((h, i) => {
          emp[h] = values[i]?.trim() || '';
        });
        return emp;
      });
  }

  _parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current);
    return result;
  }
}
