import { MCPAgentBase } from './shared/mcp-agent-base.js';
import { QueryProcessor } from './shared/utils/query-processor.js';
import { HRService } from './service.js';
import { config } from './config.js';

class HRAgent extends MCPAgentBase {
  constructor() {
    super(config.name, config.description);
    this.queryProcessor = new QueryProcessor(this.agentName);
  }

  async createService() {
    const service = new HRService();
    await service.init();
    return service;
  }

  async setupResources() {
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
        contents: [{
          uri: uri.href,
          text: this.service.getRawCsvData()
        }]
      })
    );

    // Employee profile resource
    this.resourceManager.registerTemplateResource(
      'employee-profile',
      { uri: 'hr://employees/{employeeId}/profile', params: {} },
      {
        title: 'Employee Profile',
        description: 'Individual employee profile information',
        mimeType: 'text/plain'
      },
      async (uri, { employeeId }) => {
        try {
          const employee = this.service.getEmployeeByEmail(employeeId) || this.service.getEmployeeByName(employeeId);
          
          if (!employee) {
            return {
              contents: [{
                uri: uri.href,
                text: `Employee ${employeeId} not found`
              }]
            };
          }

          const profile = Object.entries(employee)
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n');

          return {
            contents: [{
              uri: uri.href,
              text: profile
            }]
          };
        } catch (error) {
          this.logger.error('Failed to fetch employee profile', error);
          return {
            contents: [{
              uri: uri.href,
              text: `Error fetching profile: ${error.message}`
            }]
          };
        }
      }
    );

    // Query resource
    this.resourceManager.registerTemplateResource(
      'query',
      { uri: 'hr://query{?q*}', params: {} },
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
    let score = 0;
    keywords.forEach((keyword) => {
      if (queryLower.includes(keyword.toLowerCase())) {
        score += 15;
      }
    });
    return Math.min(score, 100);
  }

  async processQuery(query) {
    this.sendThinkingMessage('Analyzing HR request...');

    try {
      const employees = this.service.getAllEmployees();
      const context = `Employee Database (${employees.length} employees):\n${this.service.getRawCsvData()}`;

      const fullPrompt = `${config.prompt}\n\n${context}\n\nQuestion: ${query}`;

      this.sendThinkingMessage('Processing with HR knowledge...');

      return await this.queryProcessor.processWithModel(fullPrompt, query);
    } catch (error) {
      this.logger.error('HR Agent processing error', error);
      return 'I encountered an error while accessing HR information. Please try again or contact HR directly.';
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const agent = new HRAgent();
  agent.start().catch(error => {
    console.error('❌ Failed to start HR Agent:', error);
    process.exit(1);
  });
}

export { HRAgent };
