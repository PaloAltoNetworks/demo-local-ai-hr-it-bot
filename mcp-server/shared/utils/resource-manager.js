/**
 * Resource management utilities for agents
 */
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getLogger } from '../../utils/index.js';

class ResourceManager {
  constructor(agentName, mcpServer) {
    this.agentName = agentName;
    this.mcpServer = mcpServer;
    this.logger = getLogger();
    this.resources = [];
    this.handlers = new Map(); // Store handlers for later access
  }

  /**
   * Register a static resource
   */
  registerStaticResource(name, uri, metadata, handler) {
    this.logger.debug(`Registering static resource: ${name}`);

    this.mcpServer.registerResource(name, uri, metadata, handler);
    this.handlers.set(uri, handler); // Store handler

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
    this.handlers.set(template.uri, handler); // Store handler with template URI

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
   * Get handler for a resource URI
   */
  getHandler(uri) {
    // Try exact match first
    if (this.handlers.has(uri)) {
      return this.handlers.get(uri);
    }
    
    // Try template matching
    for (const [templateUri, handler] of this.handlers.entries()) {
      if (this._uriMatchesTemplate(templateUri, uri)) {
        return handler;
      }
    }
    
    return null;
  }

  /**
   * Check if URI matches a template pattern
   */
  _uriMatchesTemplate(template, uri) {
    if (template === uri) return true;
    
    // Simple template matching for patterns like "hr://employees/{employeeId}/profile"
    const regexPattern = template
      .replace(/\{[^}]+\}/g, '[^/]+');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(uri);
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
