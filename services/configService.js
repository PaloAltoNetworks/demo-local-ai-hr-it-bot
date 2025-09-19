const express = require('express');

/**
 * Configuration Service
 * Handles system configuration, health checks, and available languages
 */
class ConfigService {
  constructor(languageService) {
    this.languageService = languageService;
    this.serverLanguage = process.env.SERVER_LANGUAGE || languageService.getDefaultLanguage();
  }

  /**
   * Get Express router with all config-related routes
   * @returns {express.Router} - Express router instance
   */
  getRoutes() {
    const router = express.Router();

    // Configuration endpoint for frontend
    router.get('/', (req, res) => {
      res.json({
        defaultLanguage: this.languageService.getDefaultLanguage(),
        serverLanguage: this.serverLanguage
      });
    });

    return router;
  }

  /**
   * Get health check route (independent)
   * @returns {express.Router} - Express router instance for health check
   */
  getHealthRoutes() {
    const router = express.Router();

    // Health check
    router.get('/health', (req, res) => {
      try {
        const healthCheck = this.languageService.getText('server.healthCheck', this.serverLanguage);
        
        if (healthCheck && typeof healthCheck === 'object') {
          res.json({
            status: healthCheck.status,
            timestamp: new Date().toISOString(),
            service: healthCheck.service,
            version: healthCheck.version
          });
        } else {
          // Fallback if getText doesn't return expected object
          res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            service: 'HR/IT Assistant',
            version: '1.0.0'
          });
        }
      } catch (error) {
        console.error('Health check error:', error);
        res.json({
          status: 'ok',
          timestamp: new Date().toISOString(),
          service: 'HR/IT Assistant',
          version: '1.0.0'
        });
      }
    });

    return router;
  }
}

module.exports = ConfigService;