import { MCPAgentBase } from './shared/mcp-agent-base.js';
import { Ollama } from 'ollama';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * General Agent MCP Server
 * Fallback agent for general workplace questions and queries outside specialized domains
 */
class GeneralAgent extends MCPAgentBase {
  constructor() {
    super('general', 'General workplace assistant for policies, navigation, and common questions');
    
    this.dataTypes = ['policies', 'procedures', 'general'];
    this.preferredModel = process.env.AGENT_MODEL || 'llama3.2:3b';
    this.ollama = new Ollama({ host: process.env.OLLAMA_URL || 'http://host.docker.internal:11434' });
  }

  /**
   * Set up MCP resources for general data
   */
  setupResources() {
    // General workplace knowledge resource
    this.server.registerResource(
      "workplace-policies",
      "general://policies",
      {
        title: "Workplace Policies",
        description: "General workplace policies, procedures, and guidelines",
        mimeType: "text/plain"
      },
      async (uri) => {
        const policies = this.getWorkplacePolicies();
        return {
          contents: [{
            uri: uri.href,
            text: policies
          }]
        };
      }
    );

    // Query resource for processing general queries with user context
    this.server.registerResource(
      "query",
      new ResourceTemplate('general://query{?q*}'),
      {
        title: 'General Query with User Context',
        description: 'Handle general queries with user context information',
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

    console.log(`📋 [${this.agentName}] General resources registered`);
  }

  /**
   * Get available resources for resources/list
   */
  getAvailableResources() {
    return [
      {
        uri: "general://policies",
        name: "workplace-policies",
        description: "General workplace policies, procedures, and guidelines",
        mimeType: "text/plain"
      },
      {
        uri: "general://query{?q*}",
        name: "query",
        description: "Handle general queries with user context information",
        mimeType: "text/plain"
      }
    ];
  }

  /**
   * Get workplace policies and general information
   */
  getWorkplacePolicies() {
    return `WORKPLACE POLICIES AND GENERAL INFORMATION

WORKING HOURS:
- Standard hours: 9:00 AM - 5:00 PM, Monday to Friday
- Flexible hours available with manager approval
- Remote work options available

LEAVE POLICIES:
- Annual leave: 20 days per year
- Sick leave: 10 days per year
- Personal days: 3 days per year
- Maternity/Paternity leave: As per local regulations

DRESS CODE:
- Business casual attire
- Casual Fridays
- Professional attire for client meetings

COMMUNICATION:
- Email for formal communications
- Slack for team communications
- Phone for urgent matters

OFFICE FACILITIES:
- Kitchen facilities available
- Parking available on-site
- Gym membership discount available

IT POLICIES:
- Password requirements: minimum 8 characters
- Software installation requires IT approval
- Personal device usage policy applies`;
  }

  /**
   * Get agent capabilities
   */
  getCapabilities() {
    return [
      'Answer general workplace questions',
      'Provide company policy information',
      'Offer general guidance and support',
      'Handle miscellaneous queries',
      'Route users to appropriate specialists',
      'Provide general navigation and orientation help',
      'Handle queries outside specialized domains'
    ];
  }

  /**
   * Get agent metadata
   */
  getMetadata() {
    return {
      name: 'general',
      displayName: 'General Support Agent',
      description: 'Fallback agent for general workplace questions and queries outside specialized domains',
      version: '1.0.0',
      category: 'General Support',
      author: 'System',
      tags: ['general', 'workplace', 'policies', 'guidance', 'fallback'],
      preferredModel: this.preferredModel
    };
  }

  /**
   * Get keywords for query matching (broad keywords for general queries)
   */
  getKeywords() {
    return [
      'help', 'question', 'policy', 'procedure', 'guideline',
      'company', 'workplace', 'office', 'general', 'information',
      'navigation', 'orientation', 'guidance', 'support',
      'who', 'what', 'where', 'when', 'how', 'why',
      'contact', 'department', 'location', 'building',
      'schedule', 'hours', 'time', 'calendar'
    ];
  }

  /**
   * Check if agent can handle query (lower confidence as fallback)
   */
  canHandle(query, context = {}) {
    const keywords = this.getKeywords();
    const queryLower = query.toLowerCase();
    
    let score = 10; // Base score as fallback agent
    
    keywords.forEach(keyword => {
      if (queryLower.includes(keyword.toLowerCase())) {
        score += 8; // Lower score increments for general keywords
      }
    });
    
    return Math.min(score, 60); // Cap at 60 to ensure specialized agents get priority
  }

  /**
   * Get system prompt for General agent
   */
  getSystemPrompt() {
    return `You are a helpful general workplace assistant. You provide guidance on general workplace questions, company policies, and help users navigate to the right resources.

CORE RESPONSIBILITIES:
- Answer general workplace questions
- Provide company policy information
- Offer guidance and orientation help
- Handle miscellaneous queries
- Route users to appropriate specialists when needed

RESPONSE STYLE:
- Be helpful and friendly
- Provide clear, actionable guidance
- Suggest appropriate contacts or departments when specific expertise is needed
- Use conversational, supportive language
- Keep responses concise but complete

ROUTING GUIDANCE:
- For employee information, leave, or salary questions: "For specific employee information, please contact HR"
- For technical issues, system problems, or IT tickets: "For technical support, please contact the IT help desk"
- For urgent matters: Always suggest appropriate escalation

CRITICAL RULES:
1. Do not make up specific data about employees, systems, or tickets
2. Provide general guidance based on common workplace practices
3. When you don't have specific information, direct users to the appropriate specialist
4. Be honest about limitations - don't pretend to have access to specific systems or data
5. For sensitive topics, always recommend speaking with the appropriate department directly

GENERAL WORKPLACE KNOWLEDGE:
- Standard business practices
- Common workplace policies
- General guidance on professional communication
- Basic orientation information
- Common workplace procedures

If a query requires specialized knowledge (HR, IT, legal, etc.), acknowledge the question but recommend contacting the appropriate specialist for accurate, up-to-date information.`;
  }

  /**
   * Process General query
   */
  async processQuery(query) {
    this.sendThinkingMessage("Analyzing general workplace request...");
    
    try {
      this.sendThinkingMessage("Providing general guidance and information...");
      
      // Create general-specific prompt (query now contains user context naturally)
      const generalPrompt = `${this.getSystemPrompt()}

USER QUERY: ${query}

GENERAL ASSISTANT RESPONSE:`;

      // Log the full prompt being sent to Ollama
      console.log(`📤 [${this.agentName}] SENDING TO OLLAMA:`);
      console.log(`📤 [${this.agentName}] Model: ${this.preferredModel}`);
      console.log(`📤 [${this.agentName}] Prompt length: ${generalPrompt.length} characters`);
      console.log(`📤 [${this.agentName}] Prompt preview (first 500 chars):`);
      console.log(`📤 [${this.agentName}] ${generalPrompt.substring(0, 500)}...`);

      const result = await this.ollama.generate({
        model: this.preferredModel,
        prompt: generalPrompt,
        options: {
          temperature: 0.3
        }
      });

      console.log(`📥 [${this.agentName}] RECEIVED FROM OLLAMA:`);
      console.log(`📥 [${this.agentName}] Response length: ${result.response.length} characters`);
      console.log(`📥 [${this.agentName}] Response preview (first 300 chars):`);
      console.log(`📥 [${this.agentName}] ${result.response.substring(0, 300)}...`);

      this.sendThinkingMessage("Finalizing general response...");
      
      return result.response;
      
    } catch (error) {
      console.error('❌ General Agent processing error:', error);
      return "I encountered an error while processing your request. Please try rephrasing your question or contact the appropriate department for assistance.";
    }
  }

  /**
   * Health check with General-specific information
   */
  async healthCheck() {
    const baseHealth = await super.healthCheck();
    
    // Add General-specific health checks
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
  const agent = new GeneralAgent();
  agent.start().catch(error => {
    console.error('❌ Failed to start General Agent MCP server:', error);
    process.exit(1);
  });
}

export { GeneralAgent };