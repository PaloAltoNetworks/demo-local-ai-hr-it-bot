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
    this.rawCsvData = null; // Store raw CSV separately for database lookups
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
   * Extract user context from query and enhance it with database info
   * Query format: "original question [User context: user: Name, role: Role, ...]"
   */
  _extractUserContext(query) {
    const contextMatch = query.match(/\[User context: ([^\]]+)\]/s);
    if (!contextMatch) {
      return { userContext: null, userDetails: null, cleanQuery: query };
    }

    const contextStr = contextMatch[1];
    const userContext = {};
    
    // Parse user context fields
    const patterns = {
      user: /user:\s*([^,\]]+)/is,
      email: /email:\s*([^,\]]+)/is,
      role: /role:\s*([^,\]]+)/is,
      department: /department:\s*([^,\]]+)/is,
      employeeId: /employee ID:\s*([^,\]]+)/is
    };
    
    for (const [key, pattern] of Object.entries(patterns)) {
      const match = contextStr.match(pattern);
      if (match) {
        userContext[key] = match[1].trim();
      }
    }
    
    // Remove context from query to get clean question
    const cleanQuery = query.replace(/\s*\[User context:[^\]]+\]/, '').trim();
    
    this.logger.debug(`Extracted user context:`, userContext);
    
    // Try to find the user in the database for complete details
    let userDetails = null;
    // Prioritize email as it's a unique identifier
    if (userContext.email) {
      userDetails = this._findUserInDatabaseByEmail(userContext.email);
    } else if (userContext.user) {
      // Fallback to name search if email not available
      userDetails = this._findUserInDatabaseByName(userContext.user);
    }
    
    if (userDetails) {
      this.logger.debug(`Found user in database:`, {
        name: userDetails.name,
        email: userDetails.email,
        role: userDetails.role,
        department: userDetails.department,
        manager: userDetails.manager,
        manager_comments: userDetails.manager_comments ? userDetails.manager_comments.substring(0, 50) : 'N/A'
      });
    }
    
    return { userContext, userDetails, cleanQuery };
  }

  /**
   * Find user in database by email (unique identifier)
   */
  _findUserInDatabaseByEmail(userEmail) {
    try {
      // Use raw CSV data for lookups (not the formatted version with prefix)
      const rawCsvData = this.rawCsvData || '';
      if (!rawCsvData) {
        console.log(`❌ [HR Agent] Raw CSV data not loaded for email lookup`);
        this.logger.warn('Raw CSV data not loaded for email lookup');
        return null;
      }
      
      console.log(`🔍 [HR Agent] Searching for email: ${userEmail}`);
      console.log(`🔍 [HR Agent] Raw CSV data length: ${rawCsvData.length} chars`);
      
      const lines = rawCsvData.split('\n');
      console.log(`🔍 [HR Agent] Total lines: ${lines.length}`);
      
      if (lines.length < 2) {
        console.log(`❌ [HR Agent] Not enough lines in CSV data`);
        return null;
      }
      
      const header = lines[0].split(',');
      const emailIndex = header.findIndex(h => h.toLowerCase().includes('email'));
      console.log(`🔍 [HR Agent] Email column index: ${emailIndex}, first header: ${header[0]}`);
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Parse CSV line
        const fields = this._parseCSVLine(line);
        if (fields[emailIndex]) {
          const emailInDB = fields[emailIndex].replace(/"/g, '');
          if (emailInDB.toLowerCase() === userEmail.toLowerCase()) {
            console.log(`✅ [HR Agent] Found matching email at line ${i}: ${emailInDB}`);
            // Build user details object from all fields
            const userDetails = {};
            header.forEach((h, idx) => {
              const cleanHeader = h.trim().toLowerCase().replace(/"/g, '');
              const cleanValue = fields[idx] ? fields[idx].replace(/"/g, '') : '';
              userDetails[cleanHeader] = cleanValue;
            });
            this.logger.debug(`✅ Found user by email: ${emailInDB}`);
            return userDetails;
          }
        }
      }
      console.log(`❌ [HR Agent] No matching email found for: ${userEmail}`);
    } catch (error) {
      console.log(`❌ [HR Agent] Error in email lookup:`, error);
      this.logger.error('Error finding user by email in database:', error);
    }
    return null;
  }

  /**
   * Find user in database by name (fallback)
   */
  _findUserInDatabaseByName(userName) {
    try {
      // Use raw CSV data for lookups
      const rawCsvData = this.rawCsvData || '';
      if (!rawCsvData) {
        this.logger.warn('Raw CSV data not loaded for name lookup');
        return null;
      }
      
      const lines = rawCsvData.split('\n');
      
      if (lines.length < 2) return null;
      
      const header = lines[0].split(',');
      const nameIndex = header.findIndex(h => h.toLowerCase().includes('name'));
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Parse CSV line
        const fields = this._parseCSVLine(line);
        if (fields[nameIndex]) {
          const nameInDB = fields[nameIndex].replace(/"/g, '');
          if (nameInDB.toLowerCase() === userName.toLowerCase()) {
            // Build user details object from all fields
            const userDetails = {};
            header.forEach((h, idx) => {
              const cleanHeader = h.trim().toLowerCase().replace(/"/g, '');
              const cleanValue = fields[idx] ? fields[idx].replace(/"/g, '') : '';
              userDetails[cleanHeader] = cleanValue;
            });
            this.logger.debug(`✅ Found user by name: ${nameInDB}`);
            return userDetails;
          }
        }
      }
    } catch (error) {
      this.logger.error('Error finding user by name in database:', error);
    }
    return null;
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
      entities: [],
      userContext: null,
      userDetails: null
    };

    // Extract user context and details from database
    const { userContext, userDetails, cleanQuery } = this._extractUserContext(query);
    analysis.userContext = userContext;
    analysis.userDetails = userDetails;
    
    // Analyze clean query
    const cleanQueryLower = cleanQuery.toLowerCase();

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
      if (pattern.test(cleanQueryLower)) {
        analysis.type = type;
        analysis.confidence = 85;
        break;
      }
    }

    analysis.keywords = this._getKeywords().filter((keyword) =>
      cleanQueryLower.includes(keyword.toLowerCase())
    );

    const namePatterns = /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g;
    analysis.entities = cleanQuery.match(namePatterns) || [];

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

    // If we have user details from database, inject complete user information
    if (analysis.userDetails) {
      prompt = `## CURRENT USER COMPLETE PROFILE:\n`;
      prompt += `Name: ${analysis.userDetails.name}\n`;
      prompt += `Email: ${analysis.userDetails.email}\n`;
      prompt += `Role: ${analysis.userDetails.role}\n`;
      prompt += `Department: ${analysis.userDetails.department}\n`;
      prompt += `Phone: ${analysis.userDetails.phone}\n`;
      prompt += `Salary: ${analysis.userDetails.salary}\n`;
      prompt += `Manager: ${analysis.userDetails.manager || 'N/A'}\n`;
      prompt += `Manager Comments: ${analysis.userDetails.manager_comments || 'N/A'}\n`;
      prompt += `Remaining Leave: ${analysis.userDetails.remaining_leave} days\n`;
      prompt += `Total Leave: ${analysis.userDetails.total_leave} days\n`;
      prompt += `Leave Taken: ${analysis.userDetails.leave_taken} days\n`;
      prompt += `Bank Account: ${analysis.userDetails.bank_account}\n`;
      
      prompt += `\n## FULL EMPLOYEE DATABASE (${processedData.employeeCount} employees):\n${processedData.rawData}`;
    }

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
- bank_account: Bank account details
- salary: Annual compensation
- remaining_leave: Vacation days remaining
- total_leave: Total annual allocation
- leave_taken: Days used this year
- manager: Direct reporting manager
- manager_comments: Performance feedback and manager assessments (positive and negative feedback)

## CORE CAPABILITIES:
✅ Employee Directory & Contact Information
✅ Organizational Structure & Reporting Lines
✅ Leave Management & PTO Tracking
✅ Salary & Compensation Analysis
✅ Department Structure & Team Composition
✅ Manager Performance Feedback & Assessments

## CRITICAL RULES:
🔒 NEVER invent or assume any employee information
🔒 Only use data explicitly present in the employee database
🔒 All names, emails, phone numbers must match database exactly
🔒 Handle salary information with appropriate discretion
🔒 Manager comments should be shared appropriately in context (don't publicly shame)
🔒 If query is outside HR domain, respond with "OUTSIDE_SCOPE"

## USER CONTEXT USAGE:
⚠️ IMPORTANT: If "CURRENT USER COMPLETE PROFILE" section is provided above, use it to resolve queries containing "my", "me", "I":
  - "Who is my manager?" → Return the manager name and manager comments from CURRENT USER's profile
  - "What's my salary?" → Return the salary of the CURRENT USER from database
  - "What department am I in?" → Use the CURRENT USER's department from database
  - "What feedback have I received?" → Share the manager_comments from the CURRENT USER's profile
  - "What's my leave status?" → Report the CURRENT USER's remaining/total/taken leave
  - Always validate that the CURRENT USER exists in the database and use the complete profile data provided

## RESPONSE GUIDELINES:
- Precise Data: Only use information from the database
- Manager Comments: Include manager feedback when relevant to the query (e.g., performance, achievements)
- Clear Formatting: Use tables, lists, and organized data
- Complete Context: Include relevant details like contact info, managers, and performance feedback
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

      // Cache raw CSV data for database lookups
      this.rawCsvData = csvData;
      
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
      // Ensure employee data is loaded FIRST
      if (!this.employeeData) {
        await this._fetchEmployeeData();
      }
      
      const queryAnalysis = this._analyzeQuery(query);
      
      // Extract clean query and user details from database
      const { userContext, userDetails, cleanQuery } = this._extractUserContext(query);
      
      // Log debugging information
      console.log(`🔍 [HR Agent] Query: "${query.substring(0, 100)}..."`);
      console.log(`🔍 [HR Agent] UserContext found:`, userContext);
      console.log(`🔍 [HR Agent] UserDetails found:`, userDetails ? {
        name: userDetails.name,
        email: userDetails.email,
        manager: userDetails.manager
      } : null);
      console.log(`🔍 [HR Agent] Query type: ${queryAnalysis.type}`);
      
      this.sendThinkingMessage(
        `Query type: ${queryAnalysis.type} (confidence: ${queryAnalysis.confidence}%)`
      );
      
      if (userDetails) {
        this.sendThinkingMessage(`📋 Found user in database: ${userDetails.name} (${userDetails.role})`);
      } else if (userContext) {
        this.sendThinkingMessage(`📋 Using user context: ${userContext.user || 'Unknown'}`);
      }

      const rawEmployeeData = await this._fetchEmployeeData();
      const processedData = this._preprocessEmployeeData(rawEmployeeData, queryAnalysis);
      this.sendThinkingMessage(
        `Accessing employee database (${processedData.employeeCount} records)...`
      );

      const contextualPrompt = this._buildContextualPrompt(queryAnalysis, processedData);

      const systemPrompt = this._getSystemPrompt();
      
      // Build full prompt with clean query
      const fullPrompt = `${systemPrompt}\n\n## QUERY ANALYSIS:\nType: ${queryAnalysis.type}\nKeywords: ${queryAnalysis.keywords.join(', ')}\n\n## EMPLOYEE DATABASE CONTEXT:\n${contextualPrompt}`;

      this.sendThinkingMessage('Preparing HR analysis...');

      // Use clean query without context markers
      const response = await this.queryProcessor.processWithModel(fullPrompt, cleanQuery);

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
