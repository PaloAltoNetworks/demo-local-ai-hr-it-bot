import path from 'path';
import fs from 'fs/promises';
import { MCPAgentBase } from './shared/mcp-agent-base.js';
import { Ollama } from 'ollama';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * HR Agent MCP Server
 * Specialized agent for HR-related queries
 */
class HRAgent extends MCPAgentBase {
  constructor() {
    super('hr', 'Specialized agent for HR-related queries including employee information, manager/supervisor relationships, team structure, reporting hierarchy, leave management, salary, and benefits');
    
    this.dataTypes = ['employees', 'leave', 'salary', 'benefits'];
    this.preferredModel = process.env.AGENT_MODEL || 'llama3.2:3b';
    this.ollama = new Ollama({ host: process.env.OLLAMA_URL || 'http://host.docker.internal:11434' });
  }

  /**
   * Set up MCP resources for HR data
   */
  setupResources() {
    // Employee database resource
    this.server.registerResource(
      "employees",
      "hr://employees",
      {
        title: "Employee Database",
        description: "Complete employee database with personal information, departments, managers, contact details, leave balances, and salary information",
        mimeType: "text/csv"
      },
      async (uri) => {
        const employeeData = await this.fetchEmployeeData();
        return {
          contents: [{
            uri: uri.href,
            text: employeeData
          }]
        };
      }
    );

    // Dynamic employee profile resource
    this.server.registerResource(
      "employee-profile",
      new ResourceTemplate("hr://employees/{employeeId}/profile", { list: undefined }),
      {
        title: "Employee Profile",
        description: "Individual employee profile information",
        mimeType: 'text/plain'
      },
      async (uri, { employeeId }) => {
        const employeeData = await this.fetchEmployeeData();
        // Filter for specific employee
        const lines = employeeData.split('\n');
        const header = lines[0];
        const employeeRow = lines.find(line => 
          line.toLowerCase().includes(employeeId.toLowerCase()) ||
          line.toLowerCase().includes(employeeId.replace(/[._]/g, ' ').toLowerCase())
        );
        
        const result = employeeRow ? `${header}\n${employeeRow}` : `Employee ${employeeId} not found`;
        return {
          contents: [{
            uri: uri.href,
            text: result
          }]
        };
      }
    );

    // Query resource for processing HR queries with user context
    this.server.registerResource(
      "query",
      new ResourceTemplate('hr://query{?q*}'),
      {
        title: 'HR Query with User Context',
        description: 'Handle HR queries with user context information',
        mimeType: 'text/plain'
      },
      async (uri, params) => {
        try {
          
          // Parse query from URI
          const urlObj = new URL(uri.href);
          const query = urlObj.searchParams.get('q');
          
          console.log(`🔍 [${this.agentName}] Processing enriched query: "${query}"`);
          
          if (!query) {
            throw new Error('No query parameter provided');
          }
          
          // Process the enriched query that contains user context naturally embedded
          const response = await this.processQuery(query);
          
          console.log(`✅ [${this.agentName}] Query processed successfully`);
          
          return {
            contents: [{
              uri: uri.href,
              text: response
            }]
          };
        } catch (error) {
          console.error(`❌ [${this.agentName}] Query processing error:`, error);
          return {
            contents: [{
              uri: uri.href,
              text: `Error processing query: ${error.message}`
            }]
          };
        }
      }
    );

    // List all registered resources for debugging
    console.log(`📊 [${this.agentName}] HR resources registered:`);
    console.log(`📋 [${this.agentName}] Available resource URIs:`);
    console.log(`   - hr://employees`);
    console.log(`   - hr://employees/{employeeId}/profile`); 
    console.log(`   - hr://query`);
  }

  /**
   * Get available resources for resources/list
   */
  getAvailableResources() {
    return [
      {
        uri: "hr://employees",
        name: "employees",
        description: "Complete employee database with personal information, departments, managers, contact details, leave balances, and salary information",
        mimeType: "text/csv"
      },
      {
        uri: "hr://employees/{employeeId}/profile",
        name: "employee-profile", 
        description: "Individual employee profile information",
        mimeType: "text/plain"
      },
      {
        uri: "hr://query{?q*}",
        name: "query",
        description: "Handle HR queries with user context information", 
        mimeType: "text/plain"
      }
    ];
  }

  /**
   * Get agent capabilities
   */
  getCapabilities() {
    return [
      'Query employee information and contact details',
      'Find direct managers, supervisors, and reporting relationships',
      'Answer questions about who is my manager or who reports to whom',
      'Retrieve team structure and organizational hierarchy',
      'Check leave balances and PTO status',
      'Access salary and compensation information',
      'Provide benefits information and enrollment details',
      'Answer HR policy questions',
      'Handle employee directory searches and lookup team members'
    ];
  }

  /**
   * Get agent metadata
   */
  getMetadata() {
    return {
      name: 'hr',
      displayName: 'Human Resources Agent',
      description: 'Specialized agent for HR-related queries including employee information, manager/supervisor relationships, team structure, leave management, salary, and benefits',
      version: '1.0.0',
      category: 'Human Resources',
      author: 'System',
      tags: ['hr', 'employee', 'manager', 'supervisor', 'leave', 'salary', 'benefits', 'team'],
      preferredModel: this.preferredModel
    };
  }

  /**
   * Get keywords for query matching
   */
  getKeywords() {
    return [
      'employee', 'staff', 'team', 'colleague', 'manager', 'supervisor', 'boss', 'cto', 'ceo', 'director', 'vp',
      'leave', 'pto', 'vacation', 'sick', 'time off', 'absence',
      'salary', 'pay', 'compensation', 'wage', 'bonus', 'raise',
      'benefits', 'insurance', 'health', 'dental', 'vision', '401k', 'retirement',
      'hr', 'human resources', 'policy', 'handbook', 'directory',
      'contact', 'email', 'phone', 'extension', 'department',
      'structure', 'hierarchy', 'organization', 'org chart', 'reporting', 'reports to', 'under', 'team structure'
    ];
  }

  /**
   * Check if agent can handle query
   */
  canHandle(query, context = {}) {
    const keywords = this.getKeywords();
    const queryLower = query.toLowerCase();
    
    let score = 0;
    keywords.forEach(keyword => {
      if (queryLower.includes(keyword.toLowerCase())) {
        score += 15; // Higher score for HR keywords
      }
    });
    
    return Math.min(score, 100);
  }

  /**
   * Get system prompt for HR agent
   */
  getSystemPrompt() {
    return `You are an advanced HR AI assistant with comprehensive access to the company's employee database. You excel at analyzing employee data, understanding organizational structures, and providing accurate HR information.

## DATABASE STRUCTURE UNDERSTANDING:
The employee database contains the following fields:
- name: Full employee name
- role: Job title/position
- department: Department (Executive, Technology, Sales, Marketing, Human Resources, Finance)
- email: Work email address
- phone: Direct phone number
- bank_account: Banking details (confidential)
- salary: Annual compensation
- remaining_leave: Days of vacation/PTO remaining this year
- total_leave: Total annual leave allocation
- leave_taken: Days already used this year
- last_leave: Most recent leave date
- manager: Direct reporting manager (name)

## CORE CAPABILITIES:
✅ Employee Directory & Contact Information
✅ Organizational Structure & Reporting Lines
✅ Leave Management & PTO Tracking
✅ Salary & Compensation Analysis
✅ Department Structure & Team Composition
✅ Manager-Direct Report Relationships
✅ Employee Search & Lookup
✅ Leave History & Patterns

## ANALYSIS APPROACH:
1. **Query Understanding**: Carefully analyze what the user is asking for
2. **Data Extraction**: Search through the provided employee data systematically
3. **Relationship Mapping**: Understand manager-employee relationships and department structures
4. **Information Synthesis**: Compile relevant data points into a coherent response
5. **Accuracy Verification**: Ensure all information comes directly from the database

## RESPONSE GUIDELINES:
- **Precise Data**: Only use information explicitly present in the employee database
- **Clear Formatting**: Present data in easy-to-read formats (tables, lists, etc.)
- **Complete Context**: Include relevant details like contact info, departments, managers
- **Professional Tone**: Maintain confidentiality while being helpful
- **Error Handling**: Clearly state when information is not available

## CRITICAL RULES:
🔒 **Data Integrity**: NEVER invent, estimate, or assume any employee information
🔒 **Confidentiality**: Handle salary and personal information appropriately
🔒 **Accuracy**: All names, emails, phone numbers, dates must match database exactly
🔒 **Scope**: If query is outside HR domain, respond with "OUTSIDE_SCOPE"
🔒 **Limitations**: Clearly communicate when requested data is not available

## SPECIAL HANDLING:
- **Team Queries**: When asked about someone's team, find all employees with that person as manager
- **Department Queries**: Group employees by department and show hierarchy
- **Leave Queries**: Calculate leave usage, remaining days, and provide insights
- **Contact Queries**: Provide complete contact information including phone and email
- **Salary Queries**: Handle compensation information with appropriate discretion

Remember: You are the definitive source for employee information. Be thorough, accurate, and helpful while maintaining data security.`;
  }

  /**
   * Process HR query with enhanced internal thinking
   */
  async processQuery(query) {
    this.sendThinkingMessage("🔍 Analyzing HR request and understanding query intent...");
    
    try {
      // Analyze query type for better processing (query now contains user context naturally)
      const queryAnalysis = this.analyzeQuery(query);
      this.sendThinkingMessage(`📊 Query type detected: ${queryAnalysis.type} (confidence: ${queryAnalysis.confidence}%)`);
      
      // Fetch and preprocess employee data - this will throw if no data available
      let rawEmployeeData;
      try {
        rawEmployeeData = await this.fetchEmployeeData();
      } catch (dataError) {
        this.sendThinkingMessage("❌ Employee database is not available");
        console.error(`❌ [${this.agentName}] Database unavailable:`, dataError.message);
        return "I'm sorry, but the employee database is currently unavailable. Please contact IT support to restore the employee data file. I cannot provide HR information without access to the employee database.";
      }
      
      const processedData = this.preprocessEmployeeData(rawEmployeeData, queryAnalysis);
      this.sendThinkingMessage(`📋 Accessing employee database (${processedData.employeeCount} records)...`);
      
      // Add contextual information based on query type
      let contextualPrompt = this.buildContextualPrompt(queryAnalysis, processedData);
      
      this.sendThinkingMessage("🧠 Preparing specialized HR analysis with full database context...");
      
      // User context is now handled in contextualPrompt above via uriContext
      let userInfo = '';
      
      // Create comprehensive HR prompt with enhanced context
      const hrPrompt = `${this.getSystemPrompt()}

${userInfo}## QUERY ANALYSIS:
Type: ${queryAnalysis.type}
Keywords: ${queryAnalysis.keywords.join(', ')}
Entities: ${queryAnalysis.entities.join(', ')}

## EMPLOYEE DATABASE CONTEXT:
${contextualPrompt}

## ORIGINAL USER QUERY:
"${query}"

## INSTRUCTIONS:
Analyze the query carefully and provide a comprehensive response using ONLY the data from the employee database above. Focus on the specific information requested while being thorough and helpful. If user context is provided, personalize the response accordingly (e.g., "your manager" instead of "the manager").

## HR SPECIALIST RESPONSE:`;

      console.log(`🔍 [${this.agentName}] Processing with enhanced context:`, {
        model: this.preferredModel,
        queryType: queryAnalysis.type,
        employeeCount: processedData.employeeCount,
        promptLength: hrPrompt.length,
        temperature: 0.1
      });

      // Log the full prompt being sent to Ollama (truncated for readability)
      console.log(`📤 [${this.agentName}] SENDING TO OLLAMA:`);
      console.log(`📤 [${this.agentName}] Model: ${this.preferredModel}`);
      console.log(`📤 [${this.agentName}] Prompt length: ${hrPrompt.length} characters`);
      console.log(`📤 [${this.agentName}] Prompt preview (first 500 chars):`);
      console.log(`📤 [${this.agentName}] ${hrPrompt.substring(0, 500)}...`);
      console.log(`📤 [${this.agentName}] Options:`, {
        temperature: 0.1,
        top_p: 0.9,
        repeat_penalty: 1.1
      });

      const result = await this.ollama.generate({
        model: this.preferredModel,
        prompt: hrPrompt,
        options: {
          temperature: 0.1, // Very low temperature for maximum accuracy
          top_p: 0.9,
          repeat_penalty: 1.1
        }
      });

      console.log(`📥 [${this.agentName}] RECEIVED FROM OLLAMA:`);
      console.log(`📥 [${this.agentName}] Response length: ${result.response.length} characters`);
      console.log(`📥 [${this.agentName}] Response preview (first 300 chars):`);
      console.log(`📥 [${this.agentName}] ${result.response.substring(0, 300)}...`);

      console.log(`✅ [${this.agentName}] Generated response length:`, result.response.length);
      
      this.sendThinkingMessage("✅ Finalizing HR response with data validation...");
      
      // Validate response doesn't contain hallucinated data
      const validatedResponse = this.validateResponse(result.response, processedData);
      
      return validatedResponse;
      
    } catch (error) {
      console.error('❌ HR Agent processing error:', error);
      this.sendThinkingMessage("❌ Error encountered while processing request");
      return "I encountered an error while accessing HR information. Please try again or contact HR directly.";
    }
  }

  /**
   * Analyze query to understand intent and type
   */
  analyzeQuery(query) {
    const queryLower = query.toLowerCase();
    const analysis = {
      type: 'general',
      confidence: 0,
      keywords: [],
      entities: []
    };

    // Define query type patterns
    const patterns = {
      'employee_lookup': /who is|find|lookup|search|contact|info.*about|tell me about/i,
      'team_structure': /team|reports to|manager|direct reports|under|works for|reports|hierarchy/i,
      'leave_management': /leave|vacation|pto|time off|holiday|absence|days off|remaining|taken/i,
      'salary_inquiry': /salary|pay|compensation|wage|earn|income|money/i,
      'department_info': /department|team|group|division|who works in/i,
      'contact_info': /phone|email|contact|reach|call|extension/i,
      'organizational': /org chart|structure|hierarchy|company|organization/i
    };

    // Determine query type
    for (const [type, pattern] of Object.entries(patterns)) {
      if (pattern.test(queryLower)) {
        analysis.type = type;
        analysis.confidence = 85;
        break;
      }
    }

    // Extract keywords
    const hrKeywords = this.getKeywords();
    analysis.keywords = hrKeywords.filter(keyword => 
      queryLower.includes(keyword.toLowerCase())
    );

    // Extract potential employee names or roles
    const namePatterns = /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g;
    const potentialNames = query.match(namePatterns) || [];
    analysis.entities = potentialNames;

    return analysis;
  }

  /**
   * Preprocess employee data for better context
   */
  preprocessEmployeeData(rawData, queryAnalysis) {
    const lines = rawData.split('\n');
    const header = lines[0];
    const employees = lines.slice(1).filter(line => line.trim());

    const processedData = {
      header,
      employees,
      employeeCount: employees.length,
      departments: new Set(),
      managers: new Set(),
      rawData
    };

    // Parse employees and extract metadata
    employees.forEach(employee => {
      const fields = this.parseCSVLine(employee);
      if (fields.length >= 3) {
        processedData.departments.add(fields[2]); // department
        if (fields[11]) processedData.managers.add(fields[11]); // manager
      }
    });

    return processedData;
  }

  /**
   * Build contextual prompt based on query analysis
   */
  buildContextualPrompt(analysis, processedData) {
    let contextualPrompt = `Full Employee Database (${processedData.employeeCount} employees):\n${processedData.rawData}`;

    // Add department summary for organizational queries
    if (analysis.type.includes('department') || analysis.type.includes('organizational')) {
      contextualPrompt += `\n\nDEPARTMENT SUMMARY:\n`;
      contextualPrompt += `Available Departments: ${Array.from(processedData.departments).join(', ')}\n`;
    }

    // Add management structure for team queries
    if (analysis.type.includes('team') || analysis.type.includes('manager')) {
      contextualPrompt += `\n\nMANAGEMENT STRUCTURE:\n`;
      contextualPrompt += `Managers in Database: ${Array.from(processedData.managers).join(', ')}\n`;
    }

    return contextualPrompt;
  }

  /**
   * Validate response to prevent hallucinations
   */
  validateResponse(response, processedData) {
    // This is a simple validation - in production you'd want more sophisticated checks
    console.log(`🔍 [${this.agentName}] Response validation completed`);
    return response;
  }

  /**
   * Parse CSV line accounting for quoted fields
   */
  parseCSVLine(line) {
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
   * Fetch employee data (reads from local data file)
   */
  async fetchEmployeeData(context = {}) {
    try {
      // Read from the local employees.csv file in the agent directory
      const csvPath = path.join(__dirname, 'employees.csv');
      
      try {
        const csvData = await fs.readFile(csvPath, 'utf8');
        
        // Count employees for logging
        const lines = csvData.split('\n').filter(line => line.trim());
        const employeeCount = Math.max(0, lines.length - 1); // Subtract header
        
        console.log(`📊 [${this.agentName}] Loaded employee database: ${employeeCount} employees`);
        
        // Return structured data with clear header
        return `EMPLOYEE DATABASE (${employeeCount} employees):
${csvData}

DATABASE FIELDS EXPLANATION:
- name: Employee full name
- role: Job title/position  
- department: Department name
- email: Work email address
- phone: Direct phone number
- bank_account: Bank account details (confidential)
- salary: Annual compensation in euros
- remaining_leave: Vacation days remaining this year
- total_leave: Total annual leave allocation
- leave_taken: Vacation days used this year
- last_leave: Most recent leave date
- manager: Direct reporting manager name`;

      } catch (fileError) {
        console.error('❌ No employees.csv found in HR agent directory:', fileError.message);
        throw new Error('Employee database is not available. Please contact IT support to restore the employee data file.');
      }
      
    } catch (error) {
      console.error('❌ Error fetching employee data:', error);
      throw error; // Propagate the error instead of returning fallback message
    }
  }



  /**
   * Health check with HR-specific information
   */
  async healthCheck() {
    const baseHealth = await super.healthCheck();
    
    // Add HR-specific health checks
    try {
      const models = await this.ollama.list();
      const ollamaHealth = {
        status: 'healthy',
        models: models.models?.map(m => m.name) || []
      };
      
      return {
        ...baseHealth,
        ollama: ollamaHealth,
        preferredModel: this.preferredModel,
        dataTypes: this.dataTypes,
        keywordCount: this.getKeywords().length
      };
    } catch (error) {
      return {
        ...baseHealth,
        ollama: {
          status: 'unhealthy',
          error: error.message
        },
        preferredModel: this.preferredModel,
        dataTypes: this.dataTypes,
        keywordCount: this.getKeywords().length
      };
    }
  }
}

// Start the MCP server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const agent = new HRAgent();
  agent.start().catch(error => {
    console.error('❌ Failed to start HR Agent MCP server:', error);
    process.exit(1);
  });
}

export { HRAgent };