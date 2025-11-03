const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

// Import i18n module
const { changeLanguage, t, getAvailableLanguages, getCurrentLanguage, loadFrontendTranslations } = require('./i18n');

// Import MCP components
const { MCPClient } = require('./mcp-client');
const { SessionManager } = require('./session-manager');

const app = express();
const PORT = process.env.CHATBOT_HOST_PORT || 3002;

// Configuration
const COORDINATOR_URL = process.env.COORDINATOR_URL || 'http://mcp-gateway:3001';
console.log('🔗 [ChatbotHost] Coordinator URL:', COORDINATOR_URL);

// Static user identity for this demo
const STATIC_USER_IDENTITY = {
    name: 'Aurélien Delamarre',
    email: 'aurelien.delamarre@company.com',
    role: 'Pre-Sales Engineer',
    department: 'Sales Department',
    employeeId: 'EMP-2025-001'
};

// Initialize Session Manager
const sessionManager = new SessionManager();

// Initialize MCP Client
const mcpClient = new MCPClient(COORDINATOR_URL, {
    timeout: 120000, // 2 minutes timeout
    maxReconnectAttempts: 3
});

// Middleware
app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:3002'],
    credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Initialize MCP client on startup
(async () => {
    try {
        console.log('�� [ChatbotHost] Starting server...');
        await mcpClient.initialize();
        console.log('✅ [ChatbotHost] MCP Client initialized successfully');
        
        // Log available capabilities
        const capabilities = mcpClient.getClientCapabilities();
        
        console.log('📚 [ChatbotHost] Available tools: ' + capabilities.availableTools.length);
        console.log('📁 [ChatbotHost] Available resources: ' + capabilities.availableResources.length);
        console.log('💡 [ChatbotHost] Available prompts: ' + capabilities.availablePrompts.length);
        
    } catch (error) {
        console.error('❌ [ChatbotHost] Failed to initialize MCP Client:', error);
    }
})();

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
    const mcpStatus = mcpClient.isInitialized ? 'connected' : 'disconnected';
    const overallStatus = mcpClient.isInitialized ? 'ok' : 'degraded';
    
    // Use language from header or default to English
    const requestLanguage = req.headers['x-language'] || 'en';
    changeLanguage(requestLanguage);
    
    res.json({ 
        status: overallStatus, 
        service: 'chatbot-host',
        timestamp: new Date().toISOString(),
        mcpStatus: mcpStatus,
        serviceAvailable: mcpClient.isInitialized,
        message: mcpClient.isInitialized ? t('status.allServicesOperational') : t('status.mcpServicesUnavailable')
    });
});

// Translations endpoint
app.get('/api/translations/:language', (req, res) => {
    const { language } = req.params;
    
    try {
        const translations = loadFrontendTranslations(language);
        res.json(translations);
    } catch (error) {
        console.error('❌ [ChatbotHost] Error loading translations for', language, ':', error);
        res.status(404).json({ 
            error: 'Translation not found',
            language: language,
            message: error.message
        });
    }
});

// Available languages endpoint
app.get('/api/languages', (req, res) => {
    try {
        const availableLanguages = getAvailableLanguages();
        
        // Create a more detailed response with language metadata
        const languages = availableLanguages.map(lang => {
            const translations = loadFrontendTranslations(lang);
            return {
                code: lang,
                name: translations.language?.name || lang.toUpperCase(),
                nativeName: translations.language?.nativeName || lang.toUpperCase()
            };
        });
        
        res.json({
            languages: languages,
            defaultLanguage: 'en',
            totalLanguages: languages.length
        });
    } catch (error) {
        console.error('❌ [ChatbotHost] Error loading available languages:', error);
        res.status(500).json({ 
            error: 'Failed to load available languages',
            message: error.message
        });
    }
});

// Language change notification endpoint
app.post('/api/language', (req, res) => {
    const { language } = req.body;
    
    if (!language) {
        return res.status(400).json({ 
            error: 'Language is required',
            message: 'Please provide a language code in the request body'
        });
    }
    
    try {
        // Validate that the language is available
        const availableLanguages = getAvailableLanguages();
        if (!availableLanguages.includes(language)) {
            return res.status(400).json({ 
                error: 'Invalid language',
                language: language,
                availableLanguages: availableLanguages
            });
        }
        
        // Change the backend language
        changeLanguage(language);
        
        console.log(`🌍 [ChatbotHost] Language changed to: ${language}`);
        
        res.json({ 
            success: true,
            language: language,
            message: `Language successfully changed to ${language}`
        });
    } catch (error) {
        console.error('❌ [ChatbotHost] Error changing language:', error);
        res.status(500).json({ 
            error: 'Failed to change language',
            message: error.message
        });
    }
});

// Server-Sent Events endpoint for streaming (Chrome-compatible)
app.post('/api/process-prompt', async (req, res) => {
    const { messages, language = 'en', phase } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'Messages are required and must be a non-empty array.' });
    }

    const userId = req.headers['x-user-id'] || 'anonymous-user';

    try {
        // Ensure MCP Client is initialized
        if (!mcpClient.isInitialized) {
            console.log('🔌 [ChatbotHost] MCP Client not initialized, attempting initialization...');
            await mcpClient.initialize();
        }

        // Get or create session for the user
        const session = sessionManager.getOrCreateSession(userId, {
            userAgent: req.headers['user-agent'],
            language: language
        });

        // Add messages to session history
        messages.forEach(msg => sessionManager.addMessageToHistory(session.sessionId, msg));

        // Get the latest user message
        const userMessage = messages[messages.length - 1];
        
        // Set SSE headers - these force Chrome to NOT buffer
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.setHeader('Transfer-Encoding', 'chunked');

        // Send initial thinking message
        res.write('data: ' + JSON.stringify({ type: 'thinking', message: '🔍 Analyzing your request...' }) + '\n\n');
        
        const COORDINATOR_URL = process.env.COORDINATOR_URL || 'http://mcp-gateway:3001';

        try {
            res.write('data: ' + JSON.stringify({ type: 'thinking', message: '📡 Connecting to Coordinator...' }) + '\n\n');
            
            // Create a queue for thinking messages
            const messageQueue = [];
            let isProcessing = false;
            
            const processQueue = async () => {
                if (isProcessing || messageQueue.length === 0) return;
                
                isProcessing = true;
                while (messageQueue.length > 0) {
                    const message = messageQueue.shift();
                    const eventData = JSON.stringify({ type: 'thinking', message: message });
                    res.write('data: ' + eventData + '\n\n');
                    
                    // Small delay to ensure browser processes the chunk
                    await new Promise(resolve => setTimeout(resolve, 5));
                }
                isProcessing = false;
            };

            const response = await axios.post(`${COORDINATOR_URL}/api/query`, {
                query: userMessage.content,
                language: language || 'en',
                phase: phase || 'phase1',
                userContext: {
                    email: STATIC_USER_IDENTITY.email,
                    history: session.messageHistory,
                    sessionId: session.sessionId
                },
                streamThinking: true
            }, {
                timeout: 1200000,
                headers: { 'Content-Type': 'application/json' },
                responseType: 'stream'
            });

            let mcpResponse = null;
            let tokenMetadata = null;

            // Process streamed response
            await new Promise((resolve, reject) => {
                response.data.on('data', async (chunk) => {
                    const lines = chunk.toString().split('\n');
                    lines.forEach(line => {
                        if (line.trim() && line.trim() !== '[DONE]') {
                            try {
                                const data = JSON.parse(line);
                                if (data.type === 'thinking') {
                                    messageQueue.push(data.message);
                                } else if (data.type === 'response') {
                                    if (data.success) {
                                        messageQueue.push('✅ Response received from MCP Gateway');
                                        mcpResponse = {
                                            role: 'assistant',
                                            content: data.response
                                        };
                                        // Capture token metadata if available
                                        if (data.metadata) {
                                            tokenMetadata = data.metadata;
                                        }
                                    } else if (data.success === false) {
                                        // Handle error response from coordinator
                                        messageQueue.push('❌ Error from MCP Gateway');
                                        mcpResponse = {
                                            role: 'assistant',
                                            content: data.message || 'An error occurred while processing your request.'
                                        };
                                    }
                                }
                            } catch (e) {
                                console.warn('⚠️ [ChatbotHost] Error parsing streamed response:', e);
                            }
                        }
                    });
                    
                    await processQueue();
                });

                response.data.on('end', () => {
                    resolve();
                });

                response.data.on('error', (err) => {
                    reject(err);
                });
            });

            // Process any remaining queued messages
            await processQueue();

            // Send final response
            if (mcpResponse) {
                sessionManager.addMessageToHistory(session.sessionId, mcpResponse);
                const finalResponse = {
                    type: 'response',
                    messages: session.messageHistory,
                    sessionId: session.sessionId,
                    source: 'mcp-gateway'
                };
                
                // Include token metadata if available
                if (tokenMetadata) {
                    finalResponse.metadata = tokenMetadata;
                }
                
                res.write('data: ' + JSON.stringify(finalResponse) + '\n\n');
            }

        } catch (error) {
            console.error('❌ [ChatbotHost] Error processing query:', error.message);
            res.write('data: ' + JSON.stringify({
                type: 'error',
                error: 'Failed to process query',
                message: error.message
            }) + '\n\n');
        }

        res.write('data: [DONE]\n\n');
        res.end();

        } catch (error) {
        console.error('❌ [ChatbotHost] Error in SSE endpoint:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    }
});

// Start server
app.listen(PORT, () => {
    console.log('🚀 [ChatbotHost] Server running on http://localhost:' + PORT);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('📴 [ChatbotHost] Received SIGTERM, shutting down gracefully...');
    sessionManager.cleanup();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('📴 [ChatbotHost] Received SIGINT, shutting down gracefully...');
    sessionManager.cleanup();
    process.exit(0);
});
