const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

// Import logger
const { initializeLogger, getLogger } = require('./logger');

// Initialize logger
initializeLogger('chatbot-host');

// Import i18n module
const { changeLanguage, t, getAvailableLanguages, loadFrontendTranslations } = require('./i18n');

// Import MCP components
const { MCPClient } = require('./mcp-client');
const { SessionManager } = require('./session-manager');

const app = express();
const PORT = process.env.CHATBOT_HOST_PORT || 3002;

// Configuration
const COORDINATOR_URL = process.env.COORDINATOR_URL || 'http://mcp-gateway:3001';
getLogger().info('Coordinator URL: ' + COORDINATOR_URL);

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

// llm providers configuration and state
const LLM_PROVIDERS_CONFIG = [
    {
        id: 'aws',
        name: 'AWS',
        display_name: 'Amazon Web Services',
        logo: './images/amazonwebservices-original-wordmark.svg'
    },
    {
        id: 'gcp',
        name: 'Google Cloud Platform',
        display_name: 'Google Cloud Platform',
        logo: './images/googlecloud-original.svg'
    },
    {
        id: 'azure',
        name: 'Microsoft Azure',
        display_name: 'Microsoft Azure',
        logo: './images/azure-original.svg'
    },
    {
        id: 'ollama',
        name: 'Ollama',
        display_name: 'Ollama',
        logo: './images/ollama-icon.svg'
    }
];

let selectedAIProvider = 'aws'; // Default provider

// Middleware
app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:3002'],
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend')));

// Initialize MCP client on startup
(async () => {
    try {
        getLogger().info('Starting server...');
        await mcpClient.initialize();
        getLogger().info('MCP Client initialized successfully');

        // Log available capabilities
        const capabilities = mcpClient.getClientCapabilities();

        getLogger().info('Available tools: ' + capabilities.availableTools.length);
        getLogger().info('Available resources: ' + capabilities.availableResources.length);
        getLogger().info('Available prompts: ' + capabilities.availablePrompts.length);

    } catch (error) {
        getLogger().error('Failed to initialize MCP Client: ' + error.message);
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
        getLogger().error('Error loading translations for ' + language + ': ' + error.message);
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
        getLogger().error('Error loading available languages: ' + error.message);
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

        getLogger().info('Language changed to: ' + language);

        res.json({
            success: true,
            language: language,
            message: `Language successfully changed to ${language}`
        });
    } catch (error) {
        getLogger().error('Error changing language: ' + error.message);
        res.status(500).json({
            error: 'Failed to change language',
            message: error.message
        });
    }
});

// Server-Sent Events endpoint for streaming prompt processing
app.post('/api/process-prompt', async (req, res) => {
    const { messages, language = 'en', phase, llmProvider } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'Messages are required and must be a non-empty array.' });
    }

    const userId = req.headers['x-user-id'] || 'anonymous-user';

    try {
        // Ensure MCP Client is initialized
        if (!mcpClient.isInitialized) {
            getLogger().info('MCP Client not initialized, attempting initialization...');
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
        res.write('data: ' + JSON.stringify({ type: 'thinking', message: 'Analyzing your request...' }) + '\n\n');

        const COORDINATOR_URL = process.env.COORDINATOR_URL || 'http://mcp-gateway:3001';

        try {
            res.write('data: ' + JSON.stringify({ type: 'thinking', message: 'Connecting to Coordinator...' }) + '\n\n');

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
                llmProvider: llmProvider || 'aws',
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
                                    // Check if this is a checkpoint message with data marker
                                    if (data.message && data.message.startsWith('[CHECKPOINT_DATA]')) {
                                        try {
                                            const jsonStr = data.message.substring('[CHECKPOINT_DATA]'.length);
                                            const checkpointData = JSON.parse(jsonStr);
                                            // Send checkpoint data as separate event
                                            res.write('data: ' + JSON.stringify({
                                                type: 'checkpoint',
                                                ...checkpointData
                                            }) + '\n\n');
                                        } catch (parseErr) {
                                            getLogger().warn('Error parsing checkpoint data: ' + parseErr.message);
                                        }
                                    } else {
                                        // Regular thinking message
                                        messageQueue.push(data.message);
                                    }
                                } else if (data.type === 'response') {
                                    if (data.success) {
                                        messageQueue.push('Response received from MCP Gateway');
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
                                getLogger().warn('Error parsing streamed response: ' + e.message);
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

            // Send security checkpoints if phase3 and available
            if (phase === 'phase3' && tokenMetadata && tokenMetadata.securityCheckpoints) {
                res.write('data: ' + JSON.stringify({
                    type: 'security-checkpoints',
                    checkpoints: tokenMetadata.securityCheckpoints
                }) + '\n\n');
            }

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
                } else {
                    finalResponse.metadata = {};
                }

                // Add LLM provider to metadata
                const providerInfo = LLM_PROVIDERS_CONFIG.find(p => p.id === (llmProvider || 'aws'));
                finalResponse.metadata.llmProvider = {
                    id: llmProvider || 'aws',
                    name: providerInfo ? providerInfo.name : 'AWS',
                    logo: providerInfo ? providerInfo.logo : './images/amazonwebservices-original-wordmark.svg'
                };

                res.write('data: ' + JSON.stringify(finalResponse) + '\n\n');
            }

        } catch (error) {
            getLogger().error('Error processing query: ' + error.message);
            res.write('data: ' + JSON.stringify({
                type: 'error',
                error: 'Failed to process query',
                message: error.message
            }) + '\n\n');
        }

        res.write('data: [DONE]\n\n');
        res.end();

    } catch (error) {
        getLogger().error('Error in SSE endpoint: ' + error.message);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    }
});

// Endpoint to clear session and chat history
app.post('/api/clear-session', (req, res) => {
    try {
        const userId = req.headers['x-user-id'] || 'anonymous-user';

        // Get the user's session ID
        const sessionId = sessionManager.getSessionIdForUser(userId);

        if (sessionId) {
            // Terminate the session, which will remove it from the sessions map
            sessionManager.terminateSession(sessionId, 'user_refresh');
            getLogger().info('Session cleared for user ' + userId);
            res.json({ success: true, message: 'Session cleared successfully' });
        } else {
            // No session to clear
            res.json({ success: true, message: 'No session to clear' });
        }
    } catch (error) {
        getLogger().error('Error clearing session: ' + error.message);
        res.status(500).json({ error: 'Failed to clear session', message: error.message });
    }
});

// Simple prompt endpoint - returns final answer only (no streaming)
app.post('/api/prompt', async (req, res) => {
    const { messages, language = 'en', phase, llmProvider } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'Messages are required and must be a non-empty array.' });
    }

    const userId = req.headers['x-user-id'] || 'anonymous-user';

    try {
        // Ensure MCP Client is initialized
        if (!mcpClient.isInitialized) {
            await mcpClient.initialize();
        }

        // Get or create session for the user
        const session = sessionManager.getOrCreateSession(userId, {
            userAgent: req.headers['user-agent'],
            language: language
        });

        // Add messages to session history with phase
        messages.forEach(msg => {
            if (!msg.phase) {
                msg.phase = phase || 'phase1';
            }
            sessionManager.addMessageToHistory(session.sessionId, msg);
        });

        // Get the latest user message
        const userMessage = messages[messages.length - 1];

        try {
            const response = await axios.post(`${COORDINATOR_URL}/api/query`, {
                query: userMessage.content,
                language: language || 'en',
                phase: phase || 'phase1',
                llmProvider: llmProvider || 'aws',
                userContext: {
                    email: STATIC_USER_IDENTITY.email,
                    history: session.messageHistory,
                    sessionId: session.sessionId
                },
                streamThinking: false
            }, {
                timeout: 120000
            });

            const data = response.data;

            if (data.success) {
                const assistantMessage = {
                    role: 'assistant',
                    content: data.response
                };

                sessionManager.addMessageToHistory(session.sessionId, assistantMessage);

                const finalResponse = {
                    type: 'response',
                    messages: session.messageHistory,
                    sessionId: session.sessionId,
                    source: 'mcp-gateway'
                };

                // Include token metadata if available
                if (data.metadata) {
                    finalResponse.metadata = data.metadata;
                } else {
                    finalResponse.metadata = {};
                }

                // Add LLM provider to metadata
                const providerInfo = LLM_PROVIDERS_CONFIG.find(p => p.id === (llmProvider || 'aws'));
                finalResponse.metadata.llmProvider = {
                    id: llmProvider || 'aws',
                    name: providerInfo ? providerInfo.name : 'AWS',
                    logo: providerInfo ? providerInfo.logo : './images/amazonwebservices-original-wordmark.svg'
                };

                res.json(finalResponse);
            } else {
                res.status(400).json({
                    success: false,
                    error: data.message || 'Failed to process query',
                    sessionId: session.sessionId
                });
            }
        } catch (error) {
            getLogger().error('Error calling coordinator: ' + error.message);
            res.status(500).json({
                success: false,
                error: 'Failed to process query',
                message: error.message
            });
        }
    } catch (error) {
        getLogger().error('Error in prompt endpoint: ' + error.message);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
});

// llm providers endpoint - fetch from coordinator if available, fallback to static config
app.get('/api/llm-providers', async (req, res) => {
    try {
        // Try to fetch llm providers from MCP Gateway/Coordinator
        if (mcpClient.isInitialized) {
            try {
                const coordinatorResponse = await axios.get(`${COORDINATOR_URL}/api/llm-providers`, {
                    timeout: 5000
                });
                
                if (coordinatorResponse.data) {
                    if (coordinatorResponse.data.success === false && coordinatorResponse.data.providers && coordinatorResponse.data.providers.length === 0) {
                        // No providers configured - return error
                        getLogger().warn('No llm providers configured in coordinator');
                        return res.status(503).json({
                            error: 'No llm providers configured',
                            message: 'Please configure llm providers: AWS Bedrock (AWS_REGION + BEDROCK_COORDINATOR_MODEL) or Ollama (OLLAMA_SERVER_URL)',
                            providers: [],
                            source: 'coordinator'
                        });
                    }
                    
                    if (coordinatorResponse.data.success !== false) {
                        getLogger().info('llm providers fetched from coordinator');
                        return res.json(coordinatorResponse.data);
                    }
                }
            } catch (error) {
                getLogger().warn('Failed to fetch llm providers from coordinator: ' + error.message);
                // Fall through to static config or error
            }
        }

        // If no coordinator response, return error instead of static config
        getLogger().error('Unable to fetch llm providers - coordinator unavailable');
        return res.status(503).json({
            error: 'llm providers unavailable',
            message: 'Unable to reach MCP Gateway for llm provider configuration',
            providers: [],
            source: 'offline'
        });
    } catch (error) {
        getLogger().error('Error loading llm providers: ' + error.message);
        res.status(500).json({
            error: 'Failed to load llm providers',
            message: error.message
        });
    }
});

// llm provider selection endpoint - stores selected provider
app.post('/api/llm-providers', (req, res) => {
    try {
        const { provider } = req.body;
        
        // Validate against the same providers list
        const validProvider = LLM_PROVIDERS_CONFIG.find(p => p.id === provider);
        
        if (!provider || !validProvider) {
            const validProviders = LLM_PROVIDERS_CONFIG.map(p => p.id).join(', ');
            return res.status(400).json({
                error: 'Invalid provider',
                message: `Provider must be one of: ${validProviders}`
            });
        }
        
        // Update the selected provider on the server
        selectedAIProvider = provider;
        
        getLogger().info(`llm provider selected: ${provider}`);
        
        res.json({
            success: true,
            message: `llm provider updated to ${provider}`,
            default_provider: provider,
            providers: LLM_PROVIDERS_CONFIG
        });
    } catch (error) {
        getLogger().error('Error setting llm provider: ' + error.message);
        res.status(500).json({
            error: 'Failed to set llm provider',
            message: error.message
        });
    }
});

// Start server
app.listen(PORT, () => {
    getLogger().info('Server running on http://localhost:' + PORT);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    getLogger().info('Received SIGTERM, shutting down gracefully...');
    sessionManager.cleanup();
    process.exit(0);
});

process.on('SIGINT', () => {
    getLogger().info('Received SIGINT, shutting down gracefully...');
    sessionManager.cleanup();
    process.exit(0);
});
