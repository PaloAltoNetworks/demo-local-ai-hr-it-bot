/**
 * HR Agent MCP Server (Refactored)
 * Specialized agent for HR-related queries
 */
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import { MCPAgentBase } from './shared/mcp-agent-base.js';
import { ResourceManager } from './shared/utils/resource-manager.js';
import { QueryProcessor } from './shared/utils/query-processor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class HRAgent extends MCPAgentBase {
  constructor() {
    super(
      'hr',
      'Specialized agent for HR-related queries including employee information, team structure, leave, salary, and benefits'
    );

    this.dataTypes = ['employees', 'leave', 'salary', 'benefits'];
    this.queryProcessor = new QueryProcessor(this.agentName);
    this.resourceManager = null;
    this.employeeData = null;
  }

  /**
   * Setup MCP resources for HR data
   */
  setupResources() {
    this.resourceManager = new ResourceManager(this.agentName, this.server);

    // Employee database resource
    this.resourceManager.registerStaticResource(
      'employees',
      'hr://employees',
      {
        title: 'Employee Database',
        description: 'Complete employee database with personal information',
        mimeType: 'text/csv'
      },
      async (uri) => ({
        contents: [
          {
            uri: uri.href,
            text: await this._fetchEmployeeData()
          }
        ]
      })
    );

    // Dynamic employee profile resource
    this.resourceManager.registerTemplateResource(
      'employee-profile',
      {
        uri: 'hr://employees/{employeeId}/profile',
        params: {}
      },
      {
        title: 'Employee Profile',
        description: 'Individual employee profile information',
        mimeType: 'text/plain'
      },
      async (uri, { employeeId }) => {
        try {
          const employeeData = await this._fetchEmployeeData();
          const lines = employeeData.split('\n');
          const header = lines[0];
          const employeeRow = lines.find(
            (line) =>
              line.toLowerCase().includes(employeeId.toLowerCase()) ||
              line.toLowerCase().includes(employeeId.replace(/[._]/g, ' ').toLowerCase())
          );

          const result = employeeRow
            ? `${header}\n${employeeRow}`
            : `Employee ${employeeId} not found`;

          return {
            contents: [
              {
                uri: uri.href,
                text: result
              }
            ]
          };
        } catch (error) {
          this.logger.error('Failed to fetch employee profile', error);
          return {
            contents: [
              {
                uri: uri.href,
                text: `Error fetching profile: ${error.message}`
              }
            ]
          };
        }
      }
    );

    // Query resource for processing HR queries
    this.resourceManager.registerTemplateResource(
      'query',
      {
        uri: 'hr://query{?q*}',
        params: {}
      },
      {
        title: 'HR Query with User Context',
        description: 'Handle HR queries with user context information',
        mimeType: 'text/plain'
      },
      async (uri) => {
        try {
          const urlObj = new URL(uri.href);
          const query = urlObj.searchParams.get('q');

          this.logger.debug(`Processing HR query: "${query}"`);

          if (!query) {
            throw new Error('No query parameter provided');
          }

          const response = await this.processQuery(query);

          return {
            contents: [
              {
                uri: uri.href,
                text: response
              }
            ]
          };
        } catch (error) {
          this.logger.error('Query processing error', error);
          return {
            contents: [
              {
                uri: uri.href,
                text: `Error processing query: ${error.message}`
              }
            ]
          };
        }
      }
    );

    this.resourceManager.logResourceSummary();
  }

  /**
   * Get available resources
   */
  getAvailableResources() {
    return this.resourceManager?.getResourcesList() || [];
  }

  /**
   * Get agent capabilities
   */
  getCapabilities() {
    return [
      'Query employee information and contact details',
      'Find managers and reporting relationships',
      'Retrieve team structure and organizational hierarchy',
      'Check leave balances and PTO status',
      'Access salary and compensation information',
      'Provide benefits information',
      'Answer HR policy questions',
      'Handle employee directory searches'
    ];
  }

  /**
   * Get keywords for query matching
   */
  _getKeywords() {
    return [
      'employee', 'staff', 'team', 'colleague', 'manager', 'supervisor', 'boss',
      'leave', 'pto', 'vacation', 'sick', 'time off', 'absence',
      'salary', 'pay', 'compensation', 'wage', 'bonus', 'raise',
      'benefits', 'insurance', 'health', 'dental', 'vision', '401k',
      'hr', 'human resources', 'policy', 'handbook', 'directory',
      'contact', 'email', 'phone', 'extension', 'department',
      'structure', 'hierarchy', 'organization', 'org chart', 'reporting'
    ];
  }

  /**
   * Check if agent can handle query
   */
  canHandle(query, context = {}) {
    const keywords = this._getKeywords();
    const queryLower = query.toLowerCase();

    let score = 0;
    keywords.forEach((keyword) => {
      if (queryLower.includes(keyword.toLowerCase())) {
        score += 15;
      }
    });

    return Math.min(score, 100);
  }

  /**
   * Analyze query to understand intent
   */
  _analyzeQuery(query) {
    const queryLower = query.toLowerCase();
    const analysis = {
      type: 'general',
      confidence: 0,
      keywords: [],
      entities: []
    };

    const patterns = {
      employee_lookup: /who is|find|lookup|search|contact|info.*about|tell me about/i,
      team_structure: /team|reports to|manager|direct reports|under|works for|reports|hierarchy/i,
      leave_management: /leave|vacation|pto|time off|holiday|absence|days off|remaining|taken/i,
      salary_inquiry: /salary|pay|compensation|wage|earn|income|money/i,
      department_info: /department|team|group|division|who works in/i,
      contact_info: /phone|email|contact|reach|call|extension/i,
      organizational: /org chart|structure|hierarchy|company|organization/i
    };

    for (const [type, pattern] of Object.entries(patterns)) {
      if (pattern.test(queryLower)) {
        analysis.type = type;
        analysis.confidence = 85;
        break;
      }
    }

    analysis.keywords = this._getKeywords().filter((keyword) =>
      queryLower.includes(keyword.toLowerCase())
    );

    const namePatterns = /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g;
    analysis.entities = query.match(namePatterns) || [];

    return analysis;
  }

  /**
   * Preprocess employee data
   */
  _preprocessEmployeeData(rawData, queryAnalysis) {
    const lines = rawData.split('\n');
    const header = lines[0];
    const employees = lines.slice(1).filter((line) => line.trim());

    const processedData = {
      header,
      employees,
      employeeCount: employees.length,
      departments: new Set(),
      managers: new Set(),
      rawData
    };

    employees.forEach((employee) => {
      const fields = this._parseCSVLine(employee);
      if (fields.length >= 3) {
        processedData.departments.add(fields[2]);
        if (fields[11]) processedData.managers.add(fields[11]);
      }
    });

    return processedData;
  }

  /**
   * Parse CSV line
   */
  _parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result;
  }

  /**
   * Build contextual prompt for query
   */
  _buildContextualPrompt(analysis, processedData) {
    let prompt = `Full Employee Database (${processedData.employeeCount} employees):\n${processedData.rawData}`;

    if (
      analysis.type.includes('department') ||
      analysis.type.includes('organizational')
    ) {
      prompt += `\n\nDEPARTMENT SUMMARY:\n`;
      prompt += `Available Departments: ${Array.from(processedData.departments).join(', ')}\n`;
    }

    if (
      analysis.type.includes('team') ||
      analysis.type.includes('manager')
    ) {
      prompt += `\n\nMANAGEMENT STRUCTURE:\n`;
      prompt += `Managers: ${Array.from(processedData.managers).join(', ')}\n`;
    }

    return prompt;
  }

  /**
   * Get system prompt
   */
  _getSystemPrompt() {
    return `You are an advanced HR AI assistant with comprehensive access to the company's employee database.

## DATABASE STRUCTURE:
- name: Employee name
- role: Job title
- department: Department
- email: Work email
- phone: Phone number
- salary: Annual compensation
- remaining_leave: Vacation days remaining
- total_leave: Total annual allocation
- leave_taken: Days used this year
- manager: Direct reporting manager

## CORE CAPABILITIES:
✅ Employee Directory & Contact Information
✅ Organizational Structure & Reporting Lines
✅ Leave Management & PTO Tracking
✅ Salary & Compensation Analysis
✅ Department Structure & Team Composition

## CRITICAL RULES:
🔒 NEVER invent or assume any employee information
🔒 Only use data explicitly present in the employee database
🔒 All names, emails, phone numbers must match database exactly
🔒 Handle salary information with appropriate discretion
🔒 If query is outside HR domain, respond with "OUTSIDE_SCOPE"

## RESPONSE GUIDELINES:
- Precise Data: Only use information from the database
- Clear Formatting: Use tables, lists, and organized data
- Complete Context: Include relevant details like contact info and managers
- Professional Tone: Maintain confidentiality while being helpful
- Error Handling: Clearly state when information is not available`;
  }

  /**
   * Fetch employee data from CSV
   */
  async _fetchEmployeeData() {
    if (this.employeeData) {
      return this.employeeData;
    }

    try {
      const csvPath = path.join(__dirname, 'employees.csv');
      const csvData = await fs.readFile(csvPath, 'utf8');

      const lines = csvData.split('\n').filter((line) => line.trim());
      const employeeCount = Math.max(0, lines.length - 1);

      this.logger.debug(`Loaded employee database: ${employeeCount} employees`);

      this.employeeData = `EMPLOYEE DATABASE (${employeeCount} employees):
${csvData}

DATABASE FIELDS:
- name: Employee full name
- role: Job title/position
- department: Department name
- email: Work email address
- phone: Direct phone number
- salary: Annual compensation
- remaining_leave: Vacation days remaining
- total_leave: Total annual leave allocation
- leave_taken: Vacation days used
- manager: Direct reporting manager`;

      return this.employeeData;
    } catch (error) {
      this.logger.error('Failed to fetch employee data', error);
      throw new Error('Employee database is not available. Please contact IT support.');
    }
  }

  /**
   * Process HR query
   */
  async processQuery(query) {
    this.sendThinkingMessage('Analyzing HR request...');

    try {
      const queryAnalysis = this._analyzeQuery(query);
      this.sendThinkingMessage(
        `Query type: ${queryAnalysis.type} (confidence: ${queryAnalysis.confidence}%)`
      );

      const rawEmployeeData = await this._fetchEmployeeData();
      const processedData = this._preprocessEmployeeData(rawEmployeeData, queryAnalysis);
      this.sendThinkingMessage(
        `Accessing employee database (${processedData.employeeCount} records)...`
      );

      const contextualPrompt = this._buildContextualPrompt(queryAnalysis, processedData);

      const systemPrompt = this._getSystemPrompt();
      const fullPrompt = `${systemPrompt}\n\n## QUERY ANALYSIS:\nType: ${queryAnalysis.type}\nKeywords: ${queryAnalysis.keywords.join(', ')}\n\n## EMPLOYEE DATABASE CONTEXT:\n${contextualPrompt}`;

      this.sendThinkingMessage('Preparing HR analysis...');

      const response = await this.queryProcessor.processWithModel(fullPrompt, query);

      this.sendThinkingMessage('Finalizing HR response...');

      return response;
    } catch (error) {
      this.logger.error('HR Agent processing error', error);
      return 'I encountered an error while accessing HR information. Please try again or contact HR directly.';
    }
  }

  /**
   * Health check with HR-specific information
   */
  async healthCheck() {
    const baseHealth = await super.healthCheck();

    try {
      const models = await this.queryProcessor.getAvailableModels();
      return {
        ...baseHealth,
        ollama: {
          status: 'healthy',
          models
        },
        dataTypes: this.dataTypes,
        resources: this.getAvailableResources().length
      };
    } catch (error) {
      return {
        ...baseHealth,
        ollama: {
          status: 'unhealthy',
          error: error.message
        },
        dataTypes: this.dataTypes
      };
    }
  }
}

// Start the MCP server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const agent = new HRAgent();
  agent.start().catch((error) => {
    console.error('❌ Failed to start HR Agent MCP server:', error);
    process.exit(1);
  });
}

export { HRAgent };
