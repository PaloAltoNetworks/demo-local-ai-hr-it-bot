/**
 * Chat Handler for managing message sending and chat operations
 * Includes streaming message handling and retry logic
 */
import { CONFIG } from './config.js';

export class ChatHandler {
    constructor(apiService, uiManager, i18n) {
        this.apiService = apiService;
        this.uiManager = uiManager;
        this.i18n = i18n;
        this.chatHistory = [];
        this.isProcessing = false;
        this.currentPhase = 'phase1';
        this.boundHandlers = {};
        this.currentLanguage = this.i18n.currentLanguage || 'en';
        this.currentLLMProvider = 'aws';
    }

    /**
     * Initialize chat handler - called from constructor
     */
    init() {
        this.attachListeners();
        console.log('✅ ChatHandler initialized');
    }

    /**
     * Attach event listeners for chat operations
     */
    attachListeners() {
        // Store bound handlers for proper cleanup
        this.boundHandlers.sendClick = this.handleSendMessageClick.bind(this);
        this.boundHandlers.keyPress = this.handleKeyPress.bind(this);
        this.boundHandlers.clearClick = this.clearChat.bind(this);
        this.boundHandlers.phaseChanged = this.onPhaseChanged.bind(this);

        // Send message button
        const sendBtn = document.getElementById('sendMessage');
        sendBtn?.addEventListener('click', this.boundHandlers.sendClick);

        // Enter key in chat input
        const chatInput = document.getElementById('chatInput');
        chatInput?.addEventListener('keypress', this.boundHandlers.keyPress);

        // Clear chat button
        const clearBtn = document.getElementById('clearChatBtn');
        clearBtn?.addEventListener('click', this.boundHandlers.clearClick);

        // Listen for phase changes
        window.addEventListener('phaseChanged', this.boundHandlers.phaseChanged);
        
        window.addEventListener('languageChanged', (event) => {
            const { language } = event.detail;
            this.currentLanguage = language;
        });

        window.addEventListener('llmProviderChanged', (event) => {
            const { provider } = event.detail;
            this.currentLLMProvider = provider;
        });
    }

    /**
     * Handle key press in chat input
     */
    handleKeyPress(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.handleSendMessageClick();
        }
    }

    /**
     * Handle phase change event
     */
    onPhaseChanged(event) {
        const { phase } = event.detail;
        this.currentPhase = phase;
    }

    /**
     * Cleanup resources and listeners
     */
    destroy() {
        const sendBtn = document.getElementById('sendMessage');
        sendBtn?.removeEventListener('click', this.boundHandlers.sendClick);
        
        const chatInput = document.getElementById('chatInput');
        chatInput?.removeEventListener('keypress', this.boundHandlers.keyPress);
        
        const clearBtn = document.getElementById('clearChatBtn');
        clearBtn?.removeEventListener('click', this.boundHandlers.clearClick);
        
        window.removeEventListener('phaseChanged', this.boundHandlers.phaseChanged);
        
        this.boundHandlers = {};
        console.log('✅ ChatHandler destroyed');
    }

    /**
     * Handle key press in chat input
     */
    async handleSendMessageClick() {
        const chatInput = document.getElementById('chatInput');
        const userMessage = chatInput?.value.trim();

        if (!userMessage || this.isProcessing) {
            return;
        }

        await this.sendMessage(userMessage);
    }

    /**
     * Send a message with streaming using Server-Sent Events
     */
    async sendMessage(userMessage) {
        if (!userMessage || this.isProcessing) {
            return;
        }

        try {
            this.isProcessing = true;

            // Store the phase when the message was sent
            const messagePhase = this.currentPhase;

            // Add user message to history and display
            this.addMessageToHistory('user', userMessage, this.currentPhase);
            this.uiManager.displayMessage('user', userMessage, messagePhase);

            // Clear input
            this.uiManager.clearChatInput();

            // Show thinking message
            this.uiManager.showThinkingMessage('Thinking...');

            // Setup timeout warning
            const warningTimeout = setTimeout(() => {
                if (this.isProcessing) {
                    const timeoutWarning = this.i18n.t('errors.agentTimeout');
                    this.uiManager.showRetryNotification(timeoutWarning);
                }
            }, 15000); // Show warning after 15 seconds

            // Send to API with streaming using generic post method
            const response = await this.sendMessageWithRetry(
                this.chatHistory,
                messagePhase,
                {
                    onThinking: (thinkingMessage, isComplete) => {
                        if (!isComplete && thinkingMessage) {
                            this.uiManager.updateThinkingMessage(thinkingMessage);
                        }
                    },
                    onComplete: (response) => {
                        this.handleMessageComplete(response, messagePhase, warningTimeout);
                    },
                    onCheckpoint: (checkpoint) => {
                        if (checkpoint) {
                            const checkpointEvent = new CustomEvent('securityCheckpoint', {
                                detail: { checkpoint }
                            });
                            window.dispatchEvent(checkpointEvent);
                        }
                    }
                }
            );

            return response;

        } catch (error) {
            this.handleMessageError(error);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Send message with streaming thinking updates using Server-Sent Events
     */
    async sendMessageWithRetry(chatHistory, currentPhase, callbacks = {}, retryCount = 0) {
        try {
            const response = await this.apiService.postStream(
                '/api/process-prompt',
                {
                    messages: chatHistory,
                    phase: currentPhase,
                    language: this.currentLanguage,
                    llmProvider: this.currentLLMProvider
                },
                {},
                CONFIG.REQUEST_TIMEOUT
            );

            // Process Server-Sent Events
            return await this.parseSSEResponse(response, callbacks);

        } catch (error) {
            return this.handleStreamError(error, chatHistory, currentPhase, callbacks, retryCount);
        }
    }

    /**
     * Parse SSE response stream
     */
    async parseSSEResponse(response, callbacks = {}) {
        const { onThinking, onComplete, onSecurityCheckpoints, onCheckpoint } = callbacks;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                
                if (done) {
                    break;
                }
                
                buffer += decoder.decode(value, { stream: true });
                const events = buffer.split('\n\n');
                buffer = events.pop(); // Keep incomplete event in buffer
                
                for (const event of events) {
                    if (event.trim()) {
                        this.processSSEEvent(event, callbacks);
                    }
                }
            }
        } catch (error) {
            console.error('Error reading stream:', error);
            throw error;
        }
    }

    /**
     * Process individual SSE event
     */
    processSSEEvent(event, callbacks = {}) {
        const { onThinking, onComplete, onSecurityCheckpoints, onCheckpoint } = callbacks;

        try {
            // Parse SSE format: "data: {...}"
            const lines = event.trim().split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.substring(6);
                    if (jsonStr === '[DONE]') {
                        continue;
                    }
                    
                    const data = JSON.parse(jsonStr);
                    
                    if (data.type === 'thinking') {
                        if (data.message && onThinking) {
                            onThinking(data.message, false);
                        }
                    } else if (data.type === 'checkpoint') {
                        if (onCheckpoint) {
                            // Pass only checkpoint data (exclude the 'type' wrapper)
                            const checkpointData = { ...data };
                            delete checkpointData.type;
                            onCheckpoint(checkpointData);
                        }
                    } else if (data.type === 'security-checkpoints') {
                        if (onSecurityCheckpoints) {
                            onSecurityCheckpoints(data.checkpoints);
                        }
                    } else if (data.type === 'response') {
                        if (onComplete) {
                            onComplete(data);
                        }
                        return data;
                    } else if (data.type === 'error') {
                        throw new Error(data.error || 'Unknown error occurred');
                    }
                }
            }
        } catch (e) {
            console.error('Error parsing SSE event:', e);
            throw e;
        }
    }

    /**
     * Handle stream errors with retry logic
     */
    async handleStreamError(error, chatHistory, currentPhase, callbacks, retryCount) {
        console.error(`Stream Error (attempt ${retryCount + 1}):`, error);
        
        // Handle timeout errors
        if (error.name === 'AbortError') {
            if (retryCount < CONFIG.MAX_RETRIES) {
                this.notifyRetry(retryCount + 1, CONFIG.MAX_RETRIES);
                await this.delay(2000 * (retryCount + 1)); // Exponential backoff
                return this.sendMessageWithRetry(chatHistory, currentPhase, callbacks, retryCount + 1);
            }
            throw new Error('TIMEOUT_ERROR');
        }
        
        // Handle network errors
        if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
            throw new Error('NETWORK_ERROR');
        }
        
        if (error.message.includes('NetworkError') || error.message.includes('CORS')) {
            throw new Error('NETWORK_ERROR');
        }

        // Handle HTTP errors
        if (error.message.includes('HTTP error!')) {
            const status = error.message.match(/status: (\d+)/)?.[1];
            if (status === '500' || status === '503') {
                throw new Error('SERVER_OVERLOAD');
            } else if (status === '408' || status === '504') {
                throw new Error('TIMEOUT_ERROR');
            }
            throw new Error('SERVER_ERROR');
        }

        // Retry other errors if attempts remain
        if (retryCount < CONFIG.MAX_RETRIES) {
            console.warn(`Retry attempt ${retryCount + 1}:`, error.message);
            this.notifyRetry(retryCount + 1, CONFIG.MAX_RETRIES);
            await this.delay(1000 * (retryCount + 1)); // Exponential backoff
            return this.sendMessageWithRetry(chatHistory, currentPhase, callbacks, retryCount + 1);
        }
        
        throw error;
    }

    /**
     * Notify user about retry attempts
     */
    notifyRetry(currentAttempt, maxAttempts) {
        const retryEvent = new CustomEvent('apiRetry', {
            detail: {
                attempt: currentAttempt,
                maxAttempts: maxAttempts
            }
        });
        window.dispatchEvent(retryEvent);
    }

    /**
     * Utility delay function
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Handle successful message completion
     */
    handleMessageComplete(response, messagePhase, warningTimeout) {
        // Clear timeout warning
        clearTimeout(warningTimeout);
        
        // Hide thinking message
        this.uiManager.hideThinkingAnimation();
        
        if (response && response.messages) {
            // Update chat history
            this.chatHistory = response.messages;

            // Set token metadata if available
            if (response.metadata) {
                this.uiManager.setTokenMetadata(response.metadata);
                if (response.metadata.llmProvider) {
                    this.uiManager.setLLMProviderInfo(response.metadata.llmProvider);
                }
            }

            // Display assistant response
            const lastMessage = response.messages[response.messages.length - 1];
            if (lastMessage && lastMessage.role === 'assistant') {
                let contentToDisplay = lastMessage.content;
                
                // Handle array format
                if (Array.isArray(contentToDisplay)) {
                    contentToDisplay = contentToDisplay
                        .filter(item => item.type === 'text')
                        .map(item => item.text)
                        .join(' ');
                } else if (typeof contentToDisplay === 'object' && contentToDisplay.text) {
                    contentToDisplay = contentToDisplay.text;
                }
                
                // Display with thinking chain
                this.uiManager.displayBotMessageWithThinking(contentToDisplay, messagePhase);
            }
        }
    }

    /**
     * Handle message sending error
     */
    handleMessageError(error) {
        // Hide thinking message on error
        this.uiManager.hideThinkingAnimation();
        
        // Map error types to user-friendly messages
        let errorMsg;
        const errorMessage = error.message || '';
        
        if (errorMessage === 'TIMEOUT_ERROR') {
            errorMsg = this.i18n.t('errors.agentTimeout');
        } else if (errorMessage === 'NETWORK_ERROR') {
            errorMsg = this.i18n.t('errors.networkError');
        } else if (errorMessage === 'SERVER_OVERLOAD') {
            errorMsg = this.i18n.t('errors.serverOverload');
        } else if (errorMessage === 'SERVER_ERROR') {
            errorMsg = this.i18n.t('errors.serverError');
        } else {
            errorMsg = this.i18n.t('errors.agentError');
        }
        
        this.uiManager.showError(errorMsg);
        console.error('Error sending message:', error);
    }

    /**
     * Add message to chat history
     */
    addMessageToHistory(role, content, phase) {
        this.chatHistory.push({
            role,
            content,
            phase
        });
    }

    /**
     * Clear chat history
     */
    clearChat() {
        this.chatHistory = [];
        this.uiManager.clearChat();
    }

    /**
     * Get chat history
     */
    getHistory() {
        return this.chatHistory;
    }

    /**
     * Check if currently processing
     */
    isCurrentlyProcessing() {
        return this.isProcessing;
    }

    /**
     * Set chat history (for initialization or restore)
     */
    setHistory(history) {
        this.chatHistory = history || [];
    }
}
