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
 * IT Agent MCP Server
 * Specialized agent for IT support and technical issues
 */
class ITAgent extends MCPAgentBase {
  constructor() {
    super('it', 'Specialized agent for IT support tickets, technical issues, and troubleshooting');
    
    this.dataTypes = ['tickets', 'systems', 'hardware', 'software'];
    this.preferredModel = process.env.AGENT_MODEL || 'llama3.2:3b';
    this.ollama = new Ollama({ host: process.env.OLLAMA_URL || 'http://host.docker.internal:11434' });
  }

  /**
   * Set up MCP resources for IT data
   */
  setupResources() {
    // IT tickets database resource
    this.server.registerResource(
      "tickets",
      "it://tickets",
      {
        title: "IT Tickets Database",
        description: "Complete IT support tickets database with ticket IDs, statuses, priorities, assigned technicians, and resolution details",
        mimeType: "text/csv"
      },
      async (uri) => {
        const ticketData = await this.fetchITData();
        return {
          contents: [{
            uri: uri.href,
            text: ticketData
          }]
        };
      }
    );

    // Dynamic ticket resource
    this.server.registerResource(
      "ticket",
      new ResourceTemplate("it://tickets/{ticketId}", { list: undefined }),
      {
        title: "IT Ticket Details",
        description: "Individual IT ticket information and status",
        mimeType: 'text/plain'
      },
      async (uri, { ticketId }) => {
        const ticketData = await this.fetchITData();
        // Filter for specific ticket
        const lines = ticketData.split('\n');
        const header = lines[0];
        const ticketRow = lines.find(line => 
          line.toLowerCase().includes(ticketId.toLowerCase()) ||
          line.startsWith(ticketId)
        );
        
        const result = ticketRow ? `${header}\n${ticketRow}` : `Ticket ${ticketId} not found`;
        return {
          contents: [{
            uri: uri.href,
            text: result
          }]
        };
      }
    );

    // Query resource for processing IT queries with user context
    this.server.registerResource(
      "query",
      new ResourceTemplate('it://query{?q*}'),
      {
        title: 'IT Query with User Context',
        description: 'Handle IT queries with user context information',
        mimeType: 'text/plain'
      },
      async (uri, params) => {
        try {
          console.log(`🔍 [${this.agentName}] Query resource handler called with URI: ${uri.href}`);
          console.log(`🔍 [${this.agentName}] Resource params:`, params);
          
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

    console.log(`🎫 [${this.agentName}] IT resources registered`);
  }

  /**
   * Get available resources for resources/list
   */
  getAvailableResources() {
    return [
      {
        uri: "it://tickets",
        name: "tickets",
        description: "Complete IT support tickets database with ticket IDs, statuses, priorities, assigned technicians, and resolution details",
        mimeType: "text/csv"
      },
      {
        uri: "it://tickets/{ticketId}",
        name: "ticket",
        description: "Individual IT ticket information and status",
        mimeType: "text/plain"
      },
      {
        uri: "it://query{?q*}",
        name: "query",
        description: "Handle IT queries with user context information",
        mimeType: "text/plain"
      }
    ];
  }

  /**
   * Get agent capabilities
   */
  getCapabilities() {
    return [
      'IT ticket status and tracking',
      'Technical troubleshooting support',
      'System access and login assistance',
      'Software and hardware support',
      'IT policy and security guidance',
      'System status and maintenance updates',
      'Network and connectivity issues',
      'Password reset and account management'
    ];
  }

  /**
   * Get agent metadata
   */
  getMetadata() {
    return {
      name: 'it',
      displayName: 'IT Support Agent',
      description: 'Specialized agent for IT support and technical issues including ticket management and troubleshooting',
      version: '1.0.0',
      category: 'Information Technology',
      author: 'System',
      tags: ['it', 'support', 'technical', 'tickets', 'troubleshooting', 'systems'],
      preferredModel: this.preferredModel
    };
  }

  /**
   * Get keywords for query matching
   */
  getKeywords() {
    return [
      'ticket', 'support', 'issue', 'problem', 'bug', 'error',
      'computer', 'laptop', 'desktop', 'hardware', 'software',
      'network', 'wifi', 'internet', 'connection', 'login', 'password',
      'email', 'outlook', 'access', 'permission', 'account',
      'system', 'server', 'database', 'backup', 'security',
      'antivirus', 'firewall', 'vpn', 'remote', 'printer',
      'install', 'update', 'upgrade', 'configure', 'troubleshoot',
      'it', 'technical', 'tech', 'help desk', 'support desk'
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
        score += 15; // Higher score for IT keywords
      }
    });
    
    return Math.min(score, 100);
  }

  /**
   * Get system prompt for IT agent
   */
  getSystemPrompt() {
    return `You are an expert IT support specialist with access to the company's IT systems and ticket database. You must ONLY provide information that exists in the provided IT data.

CORE RESPONSIBILITIES:
- IT ticket status, tracking, and resolution
- Technical troubleshooting and support guidance
- System access and login assistance
- Software and hardware support
- IT policy and security guidance
- System status and maintenance information

RESPONSE STYLE:
- Be technical but accessible
- Provide step-by-step troubleshooting when appropriate
- Include specific ticket numbers, system names, or error codes when available
- Offer escalation paths for complex issues
- Use clear, actionable language

CRITICAL RULES:
1. You must ONLY use information that is actually provided in the IT data context
2. DO NOT make up ticket numbers, system statuses, or technical details
3. If IT data shows specific tickets or issues, reference those EXACT details
4. When providing troubleshooting steps, base them on actual company systems and policies
5. Never invent system names, software versions, or technical specifications

DATA HANDLING:
- If the context shows "No IT data found" or similar, respond: "I don't have access to current IT information. Please contact the IT help desk directly."
- If you cannot find specific ticket or system information, say: "I don't have that information in our IT database."
- If the query is completely outside IT scope, respond with "OUTSIDE_SCOPE"
- For urgent issues, always suggest contacting IT support directly

SECURITY:
- Never provide sensitive system information like passwords or security keys
- Always recommend proper security protocols
- Escalate security-related issues appropriately

NEVER invent ticket numbers, system statuses, or technical details. Always be truthful about data limitations.`;
  }

  /**
   * Process IT query
   */
  async processQuery(query) {
    this.sendThinkingMessage("Analyzing IT support request...");
    
    try {
      // Fetch IT ticket data - this will throw if no data available
      let itData;
      try {
        itData = await this.fetchITData();
      } catch (dataError) {
        this.sendThinkingMessage("❌ IT ticket database is not available");
        console.error(`❌ [${this.agentName}] Database unavailable:`, dataError.message);
        return "I'm sorry, but the IT ticket database is currently unavailable. Please contact IT support to restore the ticket data file. I cannot provide IT support information without access to the ticket database.";
      }
      
      this.sendThinkingMessage("Checking IT systems and ticket database...");
      
      // Create IT-specific prompt (query now contains user context naturally)
      const itPrompt = `${this.getSystemPrompt()}

IT DATA CONTEXT:
${itData}

USER QUERY: ${query}

IT SPECIALIST RESPONSE:`;

      // Log the full prompt being sent to Ollama
      console.log(`📤 [${this.agentName}] SENDING TO OLLAMA:`);
      console.log(`📤 [${this.agentName}] Model: ${this.preferredModel}`);
      console.log(`📤 [${this.agentName}] Prompt length: ${itPrompt.length} characters`);
      console.log(`📤 [${this.agentName}] Prompt preview (first 500 chars):`);
      console.log(`📤 [${this.agentName}] ${itPrompt.substring(0, 500)}...`);

      const result = await this.ollama.generate({
        model: this.preferredModel,
        prompt: itPrompt,
        options: {
          temperature: 0.2 // Low temperature for accurate technical information
        }
      });

      console.log(`📥 [${this.agentName}] RECEIVED FROM OLLAMA:`);
      console.log(`📥 [${this.agentName}] Response length: ${result.response.length} characters`);
      console.log(`📥 [${this.agentName}] Response preview (first 300 chars):`);
      console.log(`📥 [${this.agentName}] ${result.response.substring(0, 300)}...`);

      this.sendThinkingMessage("Finalizing IT support response...");
      
      return result.response;
      
    } catch (error) {
      console.error('❌ IT Agent processing error:', error);
      return "I encountered an error while accessing IT information. Please contact the IT help desk directly for immediate assistance.";
    }
  }

  /**
   * Fetch IT data (reads from local data file)
   */
  async fetchITData(context = {}) {
    try {
      // Read from the local tickets.csv file in the agent directory
      const csvPath = path.join(__dirname, 'tickets.csv');
      
      try {
        const csvData = await fs.readFile(csvPath, 'utf8');
        return `IT Ticket Database:\n${csvData}`;
      } catch (fileError) {
        console.error('❌ No tickets.csv found in IT agent directory:', fileError.message);
        throw new Error('IT ticket database is not available. Please contact IT support to restore the ticket data file.');
      }
      
    } catch (error) {
      console.error('❌ Error fetching IT data:', error);
      throw error; // Propagate the error instead of returning fallback message
    }
  }



  /**
   * Health check with IT-specific information
   */
  async healthCheck() {
    const baseHealth = await super.healthCheck();
    
    // Add IT-specific health checks
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
  const agent = new ITAgent();
  agent.start().catch(error => {
    console.error('❌ Failed to start IT Agent MCP server:', error);
    process.exit(1);
  });
}

export { ITAgent };