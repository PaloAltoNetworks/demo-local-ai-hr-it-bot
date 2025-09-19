const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const helmet = require('helmet');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const path = require('path');
require('dotenv').config();

const LanguageService = require('./services/languageService');
const OllamaService = require('./services/ollamaService');
const EmployeeService = require('./services/employeeService');
const ApplicationService = require('./services/applicationService');
const HRITService = require('./services/hrItService');
const ConfigService = require('./services/configService');

/**
 * Enterprise HR/IT Assistant Server
 * Main server application for the HR/IT chatbot with service-oriented architecture
 */
class HRITServer {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocket.Server({ server: this.server });
    this.port = process.env.PORT || 3000;
    
    // Initialize services (note the dependency injection order)
    this.languageService = new LanguageService();
    this.ollamaService = new OllamaService(this.languageService);
    this.employeeService = new EmployeeService();
    this.applicationService = new ApplicationService();
    this.hrItService = new HRITService(this.employeeService, this.ollamaService, this.languageService, this.applicationService);
    this.configService = new ConfigService(this.languageService);
    
    // Get server language from environment (for server messages and logs)
    this.serverLanguage = process.env.SERVER_LANGUAGE || this.languageService.getDefaultLanguage();
    
    // Rate limiter
    this.rateLimiter = new RateLimiterMemory({
      keyGen: (req) => req.ip,
      points: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
      duration: parseInt(process.env.RATE_LIMIT_WINDOW_MS) / 1000 || 900,
    });
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }
  
  setupMiddleware() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "ws:", "wss:"],
        },
      },
    }));
    
    // CORS
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      credentials: true,
    }));
    
    // Rate limiting middleware
    this.app.use(async (req, res, next) => {
      try {
        await this.rateLimiter.consume(req.ip);
        next();
      } catch (rejRes) {
        res.status(429).json({
          error: this.languageService.getText('errors.tooManyRequests', this.serverLanguage),
          retryAfter: Math.round(rejRes.msBeforeNext) || 1,
        });
      }
    });
    
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, 'public')));
  }
  
  setupRoutes() {
    // Mount service routes with clean service-based paths
    this.app.use('/', this.configService.getHealthRoutes());                     // /health (independent)
    this.app.use('/api/config', this.configService.getRoutes());                 // /api/config (includes supportedLanguages)
    this.app.use('/api/language', this.languageService.getRoutes());             // /api/language/translations/:lang, /api/language/names, /api/language/detect
    this.app.use('/api/employees', this.employeeService.getRoutes(this.languageService)); // /api/employees, /api/employees/:id
    this.app.use('/api/hr', this.hrItService.getRoutes());                       // /api/hr/request
    
    // Serve main application (catch-all route must be last)
    this.app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });
  }
  
  setupWebSocket() {
    this.wss.on('connection', (ws, req) => {
      const connectionMsg = this.languageService.getText('server.newConnection', this.serverLanguage);
      console.log(connectionMsg);
      
      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message);
          await this.handleWebSocketMessage(ws, data);
        } catch (error) {
          console.error('WebSocket message error:', error);
          const errorMsg = this.languageService.getText('errors.messageProcessingError', this.serverLanguage);
          ws.send(JSON.stringify({
            type: 'error',
            content: errorMsg,
            timestamp: new Date().toISOString()
          }));
        }
      });
      
      ws.on('close', () => {
        const closeMsg = this.languageService.getText('server.connectionClosed', this.serverLanguage);
        console.log(closeMsg);
      });
    });
  }
  
  async handleWebSocketMessage(ws, data) {
    const { type, content, language } = data;
    
    if (type === 'chat') {
      // Detect language if not provided
      const detectedLang = language || this.languageService.detectLanguage(content);
      
      // Process the HR/IT request
      const response = await this.hrItService.processHRRequest(content, detectedLang);
      
      // Send response back
      ws.send(JSON.stringify({
        type: 'assistant',
        content: response,
        timestamp: new Date().toISOString(),
        language: detectedLang
      }));
    }
  }
  
  start() {
    this.server.listen(this.port, () => {
      const startedMsg = this.languageService.getText('server.started', this.serverLanguage);
      const webInterface = this.languageService.getText('server.webInterface', this.serverLanguage);
      
      console.log(`🦦 ${startedMsg} ${this.port}`);
      console.log(`🌐 ${webInterface}: http://localhost:${this.port}`);
    });
  }
}

// Start the server
if (require.main === module) {
  const server = new HRITServer();
  server.start();
}

module.exports = HRITServer;