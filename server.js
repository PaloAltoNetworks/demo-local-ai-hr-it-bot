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
const HRITService = require('./services/hrItService');

class LaLoutreServer {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocket.Server({ server: this.server });
    this.port = process.env.PORT || 3000;
    
    // Initialize services
    this.languageService = new LanguageService();
    this.ollamaService = new OllamaService();
    this.employeeService = new EmployeeService();
    this.hrItService = new HRITService(this.employeeService, this.ollamaService);
    
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
          error: 'Trop de requêtes / Too many requests',
          retryAfter: Math.round(rejRes.msBeforeNext) || 1,
        });
      }
    });
    
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, 'public')));
  }
  
  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'La Loutre HR/IT Assistant',
        version: '1.0.0'
      });
    });
    
    // Language detection endpoint
    this.app.post('/api/detect-language', (req, res) => {
      const { text } = req.body;
      if (!text) {
        return res.status(400).json({ error: 'Texte requis / Text required' });
      }
      
      const detectedLanguage = this.languageService.detectLanguage(text);
      res.json({ language: detectedLanguage });
    });
    
    // Employee data endpoints
    this.app.get('/api/employees', (req, res) => {
      const employees = this.employeeService.getAllEmployees();
      res.json(employees);
    });
    
    this.app.get('/api/employees/:id', (req, res) => {
      const employee = this.employeeService.getEmployeeById(req.params.id);
      if (!employee) {
        return res.status(404).json({ error: 'Employé non trouvé / Employee not found' });
      }
      res.json(employee);
    });
    
    // HR/IT automation endpoints
    this.app.post('/api/hr-request', async (req, res) => {
      try {
        const { query, language } = req.body;
        if (!query) {
          return res.status(400).json({ error: 'Requête requise / Query required' });
        }
        
        const detectedLang = language || this.languageService.detectLanguage(query);
        const response = await this.hrItService.processHRRequest(query, detectedLang);
        
        res.json({
          response,
          language: detectedLang,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('HR request error:', error);
        res.status(500).json({ error: 'Erreur interne / Internal error' });
      }
    });
    
    // Serve main application
    this.app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });
  }
  
  setupWebSocket() {
    this.wss.on('connection', (ws, req) => {
      console.log('Nouvelle connexion WebSocket / New WebSocket connection');
      
      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message);
          await this.handleWebSocketMessage(ws, data);
        } catch (error) {
          console.error('WebSocket message error:', error);
          ws.send(JSON.stringify({
            type: 'error',
            content: 'Erreur de traitement du message / Message processing error',
            timestamp: new Date().toISOString()
          }));
        }
      });
      
      ws.on('close', () => {
        console.log('Connexion WebSocket fermée / WebSocket connection closed');
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
      console.log(`🦦 La Loutre HR/IT Assistant démarré sur le port ${this.port}`);
      console.log(`🦦 La Loutre HR/IT Assistant started on port ${this.port}`);
      console.log(`🌐 Interface web: http://localhost:${this.port}`);
      console.log(`🌐 Web interface: http://localhost:${this.port}`);
    });
  }
}

// Start the server
if (require.main === module) {
  const server = new LaLoutreServer();
  server.start();
}

module.exports = LaLoutreServer;