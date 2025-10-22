/**
 * General Agent MCP Server (Refactored)
 * Fallback agent for general workplace questions
 */
import { MCPAgentBase } from './shared/mcp-agent-base.js';
import { ResourceManager } from './shared/utils/resource-manager.js';
import { QueryProcessor } from './shared/utils/query-processor.js';

class GeneralAgent extends MCPAgentBase {
  constructor() {
    super(
      'general',
      'General workplace assistant for policies, navigation, and common questions'
    );

    this.dataTypes = ['policies', 'procedures', 'general'];
    this.queryProcessor = new QueryProcessor(this.agentName);
    this.resourceManager = null;
  }

  /**
   * Setup MCP resources for general data
   */
  setupResources() {
    this.resourceManager = new ResourceManager(this.agentName, this.server);

    // Workplace policies resource
    this.resourceManager.registerStaticResource(
      'workplace-policies',
      'general://policies',
      {
        title: 'Workplace Policies',
        description: 'General workplace policies, procedures, and guidelines',
        mimeType: 'text/plain'
      },
      async (uri) => ({
        contents: [
          {
            uri: uri.href,
            text: this._getWorkplacePolicies()
          }
        ]
      })
    );

    // Query resource for processing general queries
    this.resourceManager.registerTemplateResource(
      'query',
      {
        uri: 'general://query{?q*}',
        params: {}
      },
      {
        title: 'General Query with User Context',
        description: 'Handle general queries with user context information',
        mimeType: 'text/plain'
      },
      async (uri) => {
        try {
          const urlObj = new URL(uri.href);
          const query = urlObj.searchParams.get('q');

          this.logger.debug(`Processing query: "${query}"`);

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
   * Get keywords for query matching
   */
  _getKeywords() {
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
   * Check if agent can handle query
   */
  canHandle(query, context = {}) {
    const keywords = this._getKeywords();
    const queryLower = query.toLowerCase();

    let score = 10; // Base score as fallback agent
    keywords.forEach((keyword) => {
      if (queryLower.includes(keyword.toLowerCase())) {
        score += 8;
      }
    });

    return Math.min(score, 60); // Cap at 60 for fallback priority
  }

  /**
   * Get system prompt
   */
  _getSystemPrompt() {
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
- Suggest appropriate contacts when specific expertise is needed
- Use conversational, supportive language
- Keep responses concise but complete

CRITICAL RULES:
1. Do not make up specific data about employees, systems, or tickets
2. Provide general guidance based on common workplace practices
3. When you don't have specific information, direct users to the appropriate specialist
4. Be honest about limitations
5. For sensitive topics, recommend speaking with the appropriate department

If a query requires specialized knowledge (HR, IT, legal, etc.), acknowledge the question but recommend contacting the appropriate specialist for accurate information.`;
  }

  /**
   * Get workplace policies
   */
  _getWorkplacePolicies() {
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
   * Process general query
   */
  async processQuery(query) {
    this.sendThinkingMessage('Analyzing general workplace request...');

    try {
      this.sendThinkingMessage('Providing general guidance and information...');

      const prompt = this._getSystemPrompt();
      const response = await this.queryProcessor.processWithModel(prompt, query);

      this.sendThinkingMessage('Finalizing general response...');

      return response;
    } catch (error) {
      this.logger.error('General Agent processing error', error);
      return 'I encountered an error while processing your request. Please try rephrasing your question or contact the appropriate department for assistance.';
    }
  }

  /**
   * Health check with agent-specific information
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
  const agent = new GeneralAgent();
  agent.start().catch((error) => {
    console.error('❌ Failed to start General Agent MCP server:', error);
    process.exit(1);
  });
}

export { GeneralAgent };
