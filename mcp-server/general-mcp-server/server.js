import { MCPAgentBase } from './shared/mcp-agent-base.js';
import { QueryProcessor } from './shared/utils/query-processor.js';
import { GeneralService } from './service.js';
import { config } from './config.js';

class GeneralAgent extends MCPAgentBase {
  constructor() {
    super(config.name, config.description);
    this.queryProcessor = new QueryProcessor(this.agentName);
  }

  async createService() {
    const service = new GeneralService();
    await service.init();
    return service;
  }

  async setupResources() {
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
        contents: [{
          uri: uri.href,
          text: this.service.getPolicies()
        }]
      })
    );

    // Query resource
    this.resourceManager.registerTemplateResource(
      'query',
      { uri: 'general://query{?q*}', params: {} },
      {
        title: 'General Query with User Context',
        description: 'Handle general queries with user context information',
        mimeType: 'text/plain'
      },
      async (uri) => {
        try {
          const urlObj = new URL(uri.href);
          const query = urlObj.searchParams.get('q');

          this.logger.debug(`Processing general query: "${query}"`);

          if (!query) {
            throw new Error('No query parameter provided');
          }

          const response = await this.processQuery(query);

          return {
            contents: [{
              uri: uri.href,
              text: response
            }]
          };
        } catch (error) {
          this.logger.error('Query processing error', error);
          return {
            contents: [{
              uri: uri.href,
              text: `Error processing query: ${error.message}`
            }]
          };
        }
      }
    );

    this.resourceManager.logResourceSummary();
  }

  getCapabilities() {
    return config.capabilities;
  }

  canHandle(query) {
    const keywords = config.keywords;
    const queryLower = query.toLowerCase();

    let score = 10; // Base score as fallback agent
    keywords.forEach((keyword) => {
      if (queryLower.includes(keyword.toLowerCase())) {
        score += 8;
      }
    });

    return Math.min(score, 60); // Cap at 60 for fallback priority
  }

  async processQuery(query) {
    this.sendThinkingMessage('Analyzing general workplace request...');

    try {
      const policies = this.service.getPolicies();
      const fullPrompt = `${config.prompt}\n\nWORKPLACE POLICIES:\n${policies}\n\nQuestion: ${query}`;

      this.sendThinkingMessage('Providing general guidance and information...');

      return await this.queryProcessor.processWithModel(fullPrompt, query);
    } catch (error) {
      this.logger.error('General Agent processing error', error);
      return 'I encountered an error while processing your request. Please try again.';
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const agent = new GeneralAgent();
  agent.start().catch(error => {
    console.error('❌ Failed to start General Agent:', error);
    process.exit(1);
  });
}

export { GeneralAgent };
