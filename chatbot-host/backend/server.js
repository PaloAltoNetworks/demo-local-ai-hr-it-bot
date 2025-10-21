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
const MCP_GATEWAY_URL = process.env.MCP_GATEWAY_URL || 'http://mcp-gateway:3001';
console.log('🔗 [ChatbotHost] MCP Gateway URL:', MCP_GATEWAY_URL);

// Initialize Session Manager
const sessionManager = new SessionManager();

// Initialize MCP Client
const mcpClient = new MCPClient(MCP_GATEWAY_URL, {
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

// Chat endpoint with MCP integration
app.post('/api/process-prompt', async (req, res) => {
    const { messages, language = 'en', streamThinking = false, phase } = req.body;

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

        console.log('💬 [ChatbotHost] Processing messages via MCP Client (Session: ' + session.sessionId + ', Streaming: ' + streamThinking + ')');

        // Add messages to session history
        messages.forEach(msg => sessionManager.addMessageToHistory(session.sessionId, msg));

        // Get the latest user message
        const userMessage = messages[messages.length - 1];
        
        // Helper function to send streaming updates
        const sendThinkingUpdate = (message) => {
            if (streamThinking) {
                res.write(JSON.stringify({ type: 'thinking', message: message }) + '\n');
            }
        };

        const sendThinkingComplete = () => {
            if (streamThinking) {
                res.write(JSON.stringify({ type: 'thinking', complete: true }) + '\n');
            }
        };

        const sendFinalResponse = (content, messages) => {
            const responseData = {
                type: 'response',
                messages: messages,
                sessionId: session.sessionId,
                source: 'mcp-gateway'
            };
            
            if (streamThinking) {
                res.write(JSON.stringify(responseData) + '\n');
                res.end();
            } else {
                res.json({
                    response: content,
                    sessionId: session.sessionId,
                    source: 'mcp-gateway'
                });
            }
        };

        // Set streaming headers if needed
        if (streamThinking) {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
        }

        // Send initial thinking message
        sendThinkingUpdate('🔍 Analyzing your request...');
        
        // Try to process the query using MCP Gateway's /api/query endpoint
        let mcpResponse = null;
        let mcpUnavailable = false;
        
        try {
            sendThinkingUpdate('📡 Connecting to MCP Gateway...');
            
            // Use the /api/query endpoint to process the user message
            // This uses the Intelligent Coordinator, not MCP tools
            const queryEndpoint = `${MCP_GATEWAY_URL}/api/query`;
            
            // If streaming is enabled, use streaming response handling
            if (streamThinking) {
                try {
                    const response = await axios.post(queryEndpoint, {
                        query: userMessage.content,
                        language: language || 'en',
                        phase: phase || 'phase1', // Pass security phase from frontend
                        userContext: {
                            history: session.messageHistory.slice(-5),
                            sessionId: session.sessionId
                        },
                        streamThinking: true // Request streaming from coordinator
                    }, {
                        timeout: 1200000,
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        responseType: 'stream'
                    });

                    // Process streamed response
                    await new Promise((resolve, reject) => {
                        response.data.on('data', (chunk) => {
                            const lines = chunk.toString().split('\n');
                            lines.forEach(line => {
                                if (line.trim()) {
                                    try {
                                        const data = JSON.parse(line);
                                        if (data.type === 'thinking') {
                                            // Forward thinking messages to client
                                            sendThinkingUpdate(data.message);
                                        } else if (data.type === 'response' && data.success) {
                                            // Extract final response
                                            sendThinkingUpdate('✅ Response received from MCP Gateway');
                                            mcpResponse = {
                                                role: 'assistant',
                                                content: data.response
                                            };
                                        }
                                    } catch (e) {
                                        console.warn('⚠️ [ChatbotHost] Error parsing streamed response:', e);
                                    }
                                }
                            });
                        });

                        response.data.on('error', reject);
                        response.data.on('end', resolve);
                    });
                } catch (streamError) {
                    console.warn('⚠️ [ChatbotHost] Streaming error, falling back to non-streaming mode:', streamError.message);
                    // Fall back to non-streaming mode
                    const analysisResult = await axios.post(queryEndpoint, {
                        query: userMessage.content,
                        language: language || 'en',
                        phase: phase || 'phase1',
                        userContext: {
                            history: session.messageHistory.slice(-5),
                            sessionId: session.sessionId
                        },
                        streamThinking: false
                    }, {
                        timeout: 1200000,
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });

                    if (analysisResult.data && analysisResult.data.success && analysisResult.data.response) {
                        sendThinkingUpdate('✅ Response received from MCP Gateway');
                        mcpResponse = {
                            role: 'assistant',
                            content: analysisResult.data.response
                        };
                    }
                }
            } else {
                // Non-streaming mode (original behavior)
                const analysisResult = await axios.post(queryEndpoint, {
                    query: userMessage.content,
                    language: language || 'en',
                    phase: phase || 'phase2', // Pass security phase from frontend
                    userContext: {
                        history: session.messageHistory.slice(-5),
                        sessionId: session.sessionId
                    },
                    streamThinking: false
                }, {
                    timeout: 1200000,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                
                if (analysisResult.data && analysisResult.data.success && analysisResult.data.response) {
                    sendThinkingUpdate('✅ Response received from MCP Gateway');
                    mcpResponse = {
                        role: 'assistant',
                        content: analysisResult.data.response
                    };
                }
            }
        } catch (mcpError) {
            console.warn('⚠️ [ChatbotHost] MCP Gateway query failed:', mcpError.message);
            mcpUnavailable = true;
            sendThinkingUpdate('⚠️ MCP services unavailable...');
        }

        // Handle MCP response or unavailability
        if (mcpResponse) {
            // Success: Use the MCP response
            sessionManager.addMessageToHistory(session.sessionId, mcpResponse);
            sendThinkingComplete();
            
            const updatedMessages = [...messages, mcpResponse];
            sendFinalResponse(mcpResponse.content, updatedMessages);
            return;
        } else if (mcpUnavailable || !mcpClient.isInitialized) {
            // Failure: MCP is unavailable, inform the user
            console.log('🚫 [ChatbotHost] MCP services unavailable - stopping processing');
            
            // Change backend language to match user's language
            changeLanguage(language);
            
            sendThinkingUpdate('❌ ' + t('status.mcpServicesUnavailable'));
            
            // Provide clear message when MCP is down - no fallback connection
            const unavailableMessage = {
                role: 'assistant',
                content: t('mcp.unavailableMessage')
            };

            sessionManager.addMessageToHistory(session.sessionId, unavailableMessage);
            sendThinkingComplete();

            const updatedMessages = [...messages, unavailableMessage];
            sendFinalResponse(unavailableMessage.content, updatedMessages);
            return;
        }

    } catch (error) {
        console.error('❌ [ChatbotHost] Error processing prompt:', error);
        
        if (streamThinking) {
            res.write(JSON.stringify({ 
                type: 'error', 
                error: 'Failed to process prompt',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            }) + '\n');
            res.end();
        } else {
            res.status(500).json({ 
                error: 'Failed to process prompt',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
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
