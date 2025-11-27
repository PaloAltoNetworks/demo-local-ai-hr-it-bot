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

  async init() {
    const csvPath = path.join(__dirname, 'employees.csv');
    this.rawCsvData = await fs.readFile(csvPath, 'utf8');
    this.employees = this._parseCSV(this.rawCsvData);
  }

  searchEmployees(query) {
    const queryLower = query.toLowerCase();
    return this.employees.filter(emp =>
      emp.name.toLowerCase().includes(queryLower) ||
      emp.email.toLowerCase().includes(queryLower) ||
      emp.role.toLowerCase().includes(queryLower) ||
      emp.department.toLowerCase().includes(queryLower)
    );
  }

  getEmployeeByEmail(email) {
    return this.employees.find(emp => emp.email.toLowerCase() === email.toLowerCase());
  }

  getEmployeeByName(name) {
    return this.employees.find(emp => emp.name.toLowerCase() === name.toLowerCase());
  }

  getAllEmployees() {
    return this.employees;
  }

  getRawCsvData() {
    return this.rawCsvData;
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
