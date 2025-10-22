/**
 * Resource management utilities for agents
 */
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Logger } from './logger.js';

class ResourceManager {
  constructor(agentName, mcpServer) {
    this.agentName = agentName;
    this.mcpServer = mcpServer;
    this.logger = new Logger(agentName);
    this.resources = [];
  }

  /**
   * Register a static resource
   */
  registerStaticResource(name, uri, metadata, handler) {
    this.logger.debug(`Registering static resource: ${name}`);

    this.mcpServer.registerResource(name, uri, metadata, handler);

    this.resources.push({
      uri,
      name,
      description: metadata.description,
      mimeType: metadata.mimeType
    });
  }

  /**
   * Register a dynamic resource with template
   */
  registerTemplateResource(name, template, metadata, handler) {
    this.logger.debug(`Registering template resource: ${name}`);

    const resourceTemplate = new ResourceTemplate(template.uri, template.params || {});
    this.mcpServer.registerResource(name, resourceTemplate, metadata, handler);

    this.resources.push({
      uri: template.uri,
      name,
      description: metadata.description,
      mimeType: metadata.mimeType,
      template: true
    });
  }

  /**
   * Get list of registered resources
   */
  getResourcesList() {
    this.logger.debug(`Returning ${this.resources.length} resources`);
    return this.resources;
  }

  /**
   * Log resource registration summary
   */
  logResourceSummary() {
    this.logger.info(`${this.resources.length} resources registered:`);
    this.resources.forEach((resource) => {
      this.logger.debug(`  - ${resource.uri} (${resource.name})`);
    });
  }
}

export { ResourceManager };
