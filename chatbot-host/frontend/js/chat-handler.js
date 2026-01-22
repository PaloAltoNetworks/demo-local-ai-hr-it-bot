/**
 * @fileoverview Chat Handler module for managing message sending and chat operations
 * 
 * @responsibilities
 * - Handle user message input and submission
 * - Manage chat history and message state
 * - Process streaming responses with Server-Sent Events
 * - Display chat messages with thinking chains
 * - Handle retry logic and error scenarios
 * - Manage token metadata and LLM provider information
 * - Control chat availability based on connection status
 * 
 * @dependencies
 * - apiService: API communication service
 * - i18n: Internationalization service
 * - CONFIG: Application configuration
 * 
 * @events
 * Listens:
 * - phaseChanged: Updates current phase context
 * - languageChanged: Updates current language
 * - llmProviderChanged: Updates current LLM provider
 * - connectionChanged: Updates chat availability
 * 
 * Dispatches:
 * - securityCheckpoint: Security checkpoint reached
 * - apiRetry: Retry attempt notification
 * - appNotification: User notifications
 * 
 * @version 0.0.16
 */

import { CONFIG } from './config.js';

// ═══════════════════════════════════════════════════════════════════════════
// CLASS DEFINITION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @class ChatHandler
 * @description Manages all chat operations including message sending, streaming responses,
 * history management, and chat UI display with thinking chains
 * 
 * @pattern Lifecycle-based initialization with proper cleanup
 * 
 * @example
 * const chatHandler = new ChatHandler(apiService, i18n);
 * await chatHandler.init();
 * // Internal methods handle all chat operations
 * chatHandler.destroy();
 */
export class ChatHandler {
    // ═══════════════════════════════════════════════════════════════════════════
    // PRIVATE INSTANCE PROPERTIES
    // ═══════════════════════════════════════════════════════════════════════════

    /** @type {Object} @private */
    #apiService;

    /** @type {Object} @private */
    #i18n;

    /** @type {Array<Object>} @private */
    #chatHistory = [];

    /** @type {boolean} @private */
    #isProcessing = false;

    /** @type {string} @private */
    #currentPhase = 'phase1';

    /** @type {Object} @private */
    #boundHandlers = {};

    /** @type {string} @private */
    #currentLanguage;

    /** @type {string} @private */
    #currentLLMProvider = 'aws';

    /** @type {HTMLElement|null} @private */
    #thinkingMessageElement = null;

    /** @type {Array<Object>} @private */
    #thinkingChain = [];

    /** @type {Object} @private */
    #tokenMetadata = {};

    /** @type {Object|null} @private */
    #llmProviderInfo = null;

    /** @type {boolean} @private */
    #isOnlineStatus = true;

    /** @type {Object} @private */
    #elements = {};

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @description Create ChatHandler instance
     * @param {Object} apiService - API service for backend communication
     * @param {Object} i18n - Internationalization service
     */
    constructor(apiService, i18n) {
        this.#apiService = apiService;
        this.#i18n = i18n;
        this.#currentLanguage = this.#i18n.currentLanguage || 'en';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // LIFECYCLE METHODS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @description Initialize chat handler
     * @async
     * @returns {Promise<void>}
     */
    async init() {
        this.#cacheElements();
        this.#bindEventHandlers();
        this.#attachListeners();
        console.log('[ChatHandler] ChatHandler initialized');
    }

    /**
     * @description Cleanup resources and remove event listeners
     */
    destroy() {
        this.#detachListeners();
        this.#boundHandlers = {};
        this.#elements = {};
        console.log('[ChatHandler] ChatHandler destroyed');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MESSAGE SENDING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @description Send a message with streaming using Server-Sent Events
     * @async
     * @param {string} userMessage - The user's message to send
     * @returns {Promise<Object>} Response from the server
     * @throws {Error} If message sending fails
     * @private
     */
    async #sendMessage(userMessage) {
        if (!userMessage || this.#isProcessing) {
            return;
        }

        try {
            this.#isProcessing = true;

            const messagePhase = this.#currentPhase;

            this.#addMessageToHistory('user', userMessage, this.#currentPhase);
            this.#displayMessage('user', userMessage, messagePhase);

            this.#clearChatInput();
            this.#showThinkingMessage('Thinking...');

            const warningTimeout = setTimeout(() => {
                if (this.#isProcessing) {
                    const timeoutWarning = this.#i18n.t('errors.agentTimeout');
                    this.#showRetryNotification(timeoutWarning);
                }
            }, 15000);

            const response = await this.#sendMessageWithRetry(
                this.#chatHistory,
                messagePhase,
                {
                    onThinking: (thinkingMessage, isComplete) => {
                        if (!isComplete && thinkingMessage) {
                            this.#updateThinkingMessage(thinkingMessage);
                        }
                    },
                    onComplete: (response) => {
                        this.#handleMessageComplete(response, messagePhase, warningTimeout);
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
            this.#handleMessageError(error);
        } finally {
            this.#isProcessing = false;
        }
    }

    /**
     * @description Clear chat history and UI
     * @private
     */
    #clearChat() {
        this.#chatHistory = [];
        this.#clearChatUI();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CHAT DISPLAY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @description Display a message in the chat UI
     * @param {string} role - Message role (user, bot, system)
     * @param {string} content - Message content
     * @param {string|null} phase - Current phase context
     * @private
     */
    #displayMessage(role, content, phase = null) {
        if (!this.#elements.chatMessages) return;

        const messageElement = this.#createMessageElement(role, content, phase);
        this.#elements.chatMessages.appendChild(messageElement);
        this.#scrollToBottom();
    }

    /**
     * @description Display error message in chat
     * @param {string} message - Error message to display
     * @private
     */
    #displayErrorMessage(message) {
        if (!this.#elements.chatMessages) return;

        const errorElement = this.#createMessageElement('system', message, null);
        errorElement.classList.add('message--error');
        this.#elements.chatMessages.appendChild(errorElement);
        this.#scrollToBottom();
    }

    /**
     * @description Handle send message button click
     * @async
     * @private
     */
    async #onSendMessageClick() {
        const userMessage = this.#elements.chatInput?.value.trim();

        if (!userMessage || this.#isProcessing) {
            return;
        }

        await this.#sendMessage(userMessage);
    }

    /**
     * @description Handle key press in chat input
     * @param {KeyboardEvent} event - Keyboard event
     * @private
     */
    #onKeyPress(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.#onSendMessageClick();
        }
    }

    /**
     * @description Handle phase change event
     * @param {CustomEvent} event - Phase change event
     * @private
     */
    #onPhaseChanged(event) {
        const { phase } = event.detail;
        this.#currentPhase = phase;
    }

    /**
     * @description Handle language change event
     * @param {CustomEvent} event - Language change event
     * @private
     */
    #onLanguageChanged(event) {
        const { language } = event.detail;
        this.#currentLanguage = language;
    }

    /**
     * @description Handle LLM provider change event
     * @param {CustomEvent} event - LLM provider change event
     * @private
     */
    #onLLMProviderChanged(event) {
        const { provider } = event.detail;
        this.#currentLLMProvider = provider;
    }

    /**
     * @description Handle connection status change event
     * @param {CustomEvent} event - Connection change event
     * @private
     */
    #onConnectionChanged(event) {
        const { isOnline, placeholder } = event.detail;
        this.#isOnlineStatus = isOnline;
        this.#updateChatAvailability(isOnline, placeholder);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MESSAGE PROCESSING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @description Send message with streaming thinking updates using Server-Sent Events
     * @async
     * @param {Array<Object>} chatHistory - Current chat history
     * @param {string} currentPhase - Current phase
     * @param {Object} callbacks - Callback functions for streaming events
     * @param {number} retryCount - Current retry attempt count
     * @returns {Promise<Object>} Response from server
     * @throws {Error} If all retry attempts fail
     * @private
     */
    async #sendMessageWithRetry(chatHistory, currentPhase, callbacks = {}, retryCount = 0) {
        try {
            const response = await this.#apiService.postStream(
                '/api/process-prompt',
                {
                    messages: chatHistory,
                    phase: currentPhase,
                    language: this.#currentLanguage,
                    llmProvider: this.#currentLLMProvider
                },
                {},
                CONFIG.REQUEST_TIMEOUT
            );

            return await this.#parseSSEResponse(response, callbacks);

        } catch (error) {
            return this.#handleStreamError(error, chatHistory, currentPhase, callbacks, retryCount);
        }
    }

    /**
     * @description Parse SSE response stream
     * @async
     * @param {Response} response - Fetch response object
     * @param {Object} callbacks - Callback functions for events
     * @returns {Promise<Object>} Parsed response data
     * @throws {Error} If stream reading fails
     * @private
     */
    async #parseSSEResponse(response, callbacks = {}) {
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
                buffer = events.pop();
                
                for (const event of events) {
                    if (event.trim()) {
                        this.#processSSEEvent(event, callbacks);
                    }
                }
            }
        } catch (error) {
            console.error('[ChatHandler] Error reading stream:', error);
            throw error;
        }
    }

    /**
     * @description Process individual SSE event
     * @param {string} event - SSE event string
     * @param {Object} callbacks - Callback functions
     * @returns {Object|undefined} Response data if type is response
     * @throws {Error} If event contains error type
     * @private
     */
    #processSSEEvent(event, callbacks = {}) {
        const { onThinking, onComplete, onCheckpoint } = callbacks;

        try {
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
                            const checkpointData = { ...data };
                            delete checkpointData.type;
                            onCheckpoint(checkpointData);
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
            console.error('[ChatHandler] Error parsing SSE event:', e);
            throw e;
        }
    }

    /**
     * @description Handle stream errors with retry logic
     * @async
     * @param {Error} error - Error that occurred
     * @param {Array<Object>} chatHistory - Chat history
     * @param {string} currentPhase - Current phase
     * @param {Object} callbacks - Callback functions
     * @param {number} retryCount - Current retry count
     * @returns {Promise<Object>} Retry response or throws error
     * @throws {Error} Categorized error if all retries exhausted
     * @private
     */
    async #handleStreamError(error, chatHistory, currentPhase, callbacks, retryCount) {
        console.error(`[ChatHandler] Stream Error (attempt ${retryCount + 1}):`, error);
        
        if (error.name === 'AbortError') {
            if (retryCount < CONFIG.MAX_RETRIES) {
                this.#notifyRetry(retryCount + 1, CONFIG.MAX_RETRIES);
                await this.#delay(2000 * (retryCount + 1));
                return this.#sendMessageWithRetry(chatHistory, currentPhase, callbacks, retryCount + 1);
            }
            throw new Error('TIMEOUT_ERROR');
        }
        
        if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
            throw new Error('NETWORK_ERROR');
        }
        
        if (error.message.includes('NetworkError') || error.message.includes('CORS')) {
            throw new Error('NETWORK_ERROR');
        }

        if (error.message.includes('HTTP error!')) {
            const status = error.message.match(/status: (\d+)/)?.[1];
            if (status === '500' || status === '503') {
                throw new Error('SERVER_OVERLOAD');
            } else if (status === '408' || status === '504') {
                throw new Error('TIMEOUT_ERROR');
            }
            throw new Error('SERVER_ERROR');
        }

        if (retryCount < CONFIG.MAX_RETRIES) {
            console.warn(`[ChatHandler] Retry attempt ${retryCount + 1}:`, error.message);
            this.#notifyRetry(retryCount + 1, CONFIG.MAX_RETRIES);
            await this.#delay(1000 * (retryCount + 1));
            return this.#sendMessageWithRetry(chatHistory, currentPhase, callbacks, retryCount + 1);
        }
        
        throw error;
    }

    /**
     * @description Handle successful message completion
     * @param {Object} response - Response from server
     * @param {string} messagePhase - Phase when message was sent
     * @param {number} warningTimeout - Timeout ID to clear
     * @private
     */
    #handleMessageComplete(response, messagePhase, warningTimeout) {
        clearTimeout(warningTimeout);
        this.#hideThinkingAnimation();
        
        if (response && response.messages) {
            this.#chatHistory = response.messages;

            if (response.metadata) {
                this.#setTokenMetadata(response.metadata);
                if (response.metadata.llmProvider) {
                    this.#setLLMProviderInfo(response.metadata.llmProvider);
                }
            }

            const lastMessage = response.messages[response.messages.length - 1];
            if (lastMessage && lastMessage.role === 'assistant') {
                let contentToDisplay = lastMessage.content;
                
                if (Array.isArray(contentToDisplay)) {
                    contentToDisplay = contentToDisplay
                        .filter(item => item.type === 'text')
                        .map(item => item.text)
                        .join(' ');
                } else if (typeof contentToDisplay === 'object' && contentToDisplay.text) {
                    contentToDisplay = contentToDisplay.text;
                }
                
                this.#displayBotMessageWithThinking(contentToDisplay, messagePhase);
            }
        }
    }

    /**
     * @description Handle message sending error
     * @param {Error} error - Error that occurred
     * @private
     */
    #handleMessageError(error) {
        this.#hideThinkingAnimation();
        
        let errorMsg;
        const errorMessage = error.message || '';
        
        if (errorMessage === 'TIMEOUT_ERROR') {
            errorMsg = this.#i18n.t('errors.agentTimeout');
        } else if (errorMessage === 'NETWORK_ERROR') {
            errorMsg = this.#i18n.t('errors.networkError');
        } else if (errorMessage === 'SERVER_OVERLOAD') {
            errorMsg = this.#i18n.t('errors.serverOverload');
        } else if (errorMessage === 'SERVER_ERROR') {
            errorMsg = this.#i18n.t('errors.serverError');
        } else {
            errorMsg = this.#i18n.t('errors.agentError');
        }
        
        this.#showError(errorMsg);
        console.error('[ChatHandler] Error sending message:', error);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CHAT HISTORY MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @description Add message to chat history
     * @param {string} role - Message role
     * @param {string} content - Message content
     * @param {string} phase - Current phase
     * @private
     */
    #addMessageToHistory(role, content, phase) {
        this.#chatHistory.push({
            role,
            content,
            phase
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CHAT DISPLAY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @description Create a message element
     * @param {string} role - Message role (user, bot, system)
     * @param {string} content - Message content
     * @param {string|null} phase - Current phase
     * @returns {HTMLElement} Message element
     * @private
     */
    #createMessageElement(role, content, phase = null) {
        const messageDiv = document.createElement('div');
        messageDiv.className = phase ? `message ${role}-message ${phase}-message` : `message ${role}-message`;

        const isSystem = role === 'system';
        const isUser = role === 'user';
        
        const icon = isSystem ? 'warning' : (isUser ? 'account_circle' : 'otter-icon');
        const displayContent = isSystem || isUser ? this.#escapeHtml(content) : this.#formatBotResponse(content);

        messageDiv.innerHTML = `
            <div class="message-avatar">
                <span class="material-symbols">${icon}</span>
            </div>
            <div class="message-content">
                <div class="message-text">${displayContent}</div>
                <div class="message-timestamp">${this.#getTimestamp()}</div>
            </div>
        `;

        return messageDiv;
    }

    /**
     * @description Display bot message with thinking chain
     * @param {string} content - Message content
     * @param {string|null} phase - Current phase
     * @private
     */
    #displayBotMessageWithThinking(content, phase = null) {
        if (!this.#elements.chatMessages) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = phase ? `message bot-message ${phase}-message` : 'message bot-message';

        const displayContent = this.#formatBotResponse(content);
        const timestamp = this.#getTimestamp();
        
        const hasThinkingChain = this.#thinkingChain.length > 0;
        const hasTokens = this.#tokenMetadata && (this.#tokenMetadata.total_tokens || this.#tokenMetadata.coordinator_tokens);
        const hasProvider = this.#llmProviderInfo?.logo;
        
        let messageHTML = `
            <div class="message-avatar">
                <i class="otter-icon"></i>
            </div>
            <div class="message-content">
                <div class="message-text-wrapper">
                    <div class="message-text">${displayContent}</div>
        `;

        if (hasProvider) {
            messageHTML += `
                    <div class="llm-provider-badge" title="${this.#llmProviderInfo.name}">
                        <img src="${hasProvider}" alt="${this.#llmProviderInfo.name}" class="provider-badge-logo">
                    </div>
            `;
        }

        messageHTML += `
                </div>
                <div class="message-timestamp">${timestamp}</div>
        `;

        if (hasTokens) {
            const totalTokens = this.#tokenMetadata.total_tokens || 0;
            const coordinatorTokens = this.#tokenMetadata.coordinator_tokens || 0;
            const agentTokens = this.#tokenMetadata.agent_tokens || 0;
            
            messageHTML += `
                <div class="token-info">
                    <div class="token-info-row">
                        <span class="token-label" data-i18n="chat.totalTokens">
                            <span class="material-symbols">memory</span> ${this.#i18n.t('chat.totalTokens')}:
                        </span>
                        <span class="token-count">${totalTokens}</span>
                    </div>
            `;
            
            if (coordinatorTokens > 0) {
                messageHTML += `
                    <div class="token-info-row token-info-detail">
                        <span class="token-label-detail" data-i18n="chat.coordinator">${this.#i18n.t('chat.coordinator')}:</span>
                        <span class="token-count-detail">${coordinatorTokens}</span>
                    </div>
                `;
            }
            
            if (agentTokens > 0) {
                messageHTML += `
                    <div class="token-info-row token-info-detail">
                        <span class="token-label-detail" data-i18n="chat.agents">${this.#i18n.t('chat.agents')}:</span>
                        <span class="token-count-detail">${agentTokens}</span>
                    </div>
                `;
            }
            
            messageHTML += `
                </div>
            `;
        }

        if (hasThinkingChain) {
            const thinkingId = `thinking-${Date.now()}`;
            messageHTML += `
                <button class="thinking-toggle" data-thinking-id="${thinkingId}" title="View thinking chain">
                    <span class="material-symbols">expand_more</span>
                    <span class="thinking-toggle-text">${this.#i18n.t('chat.viewThinking')}</span>
                </button>
                <div class="thinking-chain hidden" id="${thinkingId}">
            `;
            
            this.#thinkingChain.forEach((thought) => {
                messageHTML += `
                    <div class="thinking-step">
                        <div class="thinking-step-header">
                            <span class="thinking-step-time">${thought.timestamp}</span>
                        </div>
                        <div class="thinking-step-content">
                            ${this.#escapeHtml(thought.text)}
                        </div>
                    </div>
                `;
            });
            
            messageHTML += `
                </div>
            `;
        }

        messageHTML += `
            </div>
        `;

        messageDiv.innerHTML = messageHTML;
        this.#elements.chatMessages.appendChild(messageDiv);

        if (hasThinkingChain) {
            const toggleBtn = messageDiv.querySelector('.thinking-toggle');
            const thinkingChain = messageDiv.querySelector('.thinking-chain');
            
            toggleBtn.addEventListener('click', () => {
                thinkingChain.classList.toggle('hidden');
                toggleBtn.classList.toggle('expanded');
            });
        }

        this.#scrollToBottom();
        this.#clearThinkingData();
    }

    /**
     * @description Show thinking message with text
     * @param {string} text - Thinking message text
     * @private
     */
    #showThinkingMessage(text = 'Thinking...') {
        if (!this.#elements.chatMessages) return;
        
        this.#hideThinkingAnimation();

        this.#thinkingMessageElement = document.createElement('div');
        this.#thinkingMessageElement.className = 'message bot-message thinking-message';

        this.#thinkingMessageElement.innerHTML = `
            <div class="message-avatar">
                <i class="otter-icon"></i>
            </div>
            <div class="message-content">
                <div class="message-text thinking-text">
                    ${text}
                </div>
            </div>
        `;

        this.#elements.chatMessages.appendChild(this.#thinkingMessageElement);
        this.#scrollToBottom();
    }

    /**
     * @description Update thinking message text with enhanced formatting
     * @param {string} text - Thinking message text
     * @private
     */
    #updateThinkingMessage(text) {
        this.#addToThinkingChain(text);

        if (this.#thinkingMessageElement) {
            const textElement = this.#thinkingMessageElement.querySelector('.thinking-text');
            if (textElement) {
                textElement.innerHTML = text;
            }
        } else {
            this.#showThinkingMessage(text);
        }
    }

    /**
     * @description Hide thinking animation
     * @private
     */
    #hideThinkingAnimation() {
        if (this.#thinkingMessageElement && this.#thinkingMessageElement.parentNode) {
            this.#thinkingMessageElement.parentNode.removeChild(this.#thinkingMessageElement);
            this.#thinkingMessageElement = null;
        }
    }

    /**
     * @description Add thinking message to chain
     * @param {string} text - Thinking message text
     * @private
     */
    #addToThinkingChain(text) {
        const cleanText = text.replace(/^\[COORDINATOR\]\s*/, '');
        const timestamp = new Date().toLocaleTimeString(this.#currentLanguage);
        this.#thinkingChain.push({
            text: cleanText,
            timestamp
        });
    }

    /**
     * @description Scroll chat to bottom
     * @private
     */
    #scrollToBottom() {
        if (this.#elements.chatMessages) {
            this.#elements.chatMessages.scrollTop = this.#elements.chatMessages.scrollHeight;
        }
    }

    /**
     * @description Clear the chat input field
     * @private
     */
    #clearChatInput() {
        if (this.#elements.chatInput) {
            this.#elements.chatInput.value = '';
        }
    }

    /**
     * @description Clear all chat messages from UI
     * @private
     */
    #clearChatUI() {
        if (this.#elements.chatMessages) {
            this.#elements.chatMessages.innerHTML = '';
        }
    }

    /**
     * @description Update chat interface availability based on connection status
     * @param {boolean} isOnline - Connection status
     * @param {string|null} placeholder - Custom placeholder text
     * @private
     */
    #updateChatAvailability(isOnline, placeholder = null) {
        if (this.#elements.sendButton) {
            this.#elements.sendButton.disabled = !isOnline || this.#isProcessing;
        }

        if (this.#elements.chatInput) {
            this.#elements.chatInput.disabled = !isOnline;
            
            if (placeholder) {
                this.#elements.chatInput.placeholder = placeholder;
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DOM OPERATIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @description Cache frequently accessed DOM elements
     * @private
     */
    #cacheElements() {
        this.#elements = {
            chatMessages: document.getElementById('chat-container'),
            chatInput: document.getElementById('chatInput'),
            sendButton: document.getElementById('sendMessage')
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENT LISTENER MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @description Bind event handlers to preserve context
     * @private
     */
    #bindEventHandlers() {
        this.#boundHandlers = {
            sendClick: this.#onSendMessageClick.bind(this),
            keyPress: this.#onKeyPress.bind(this),
            clearClick: this.#clearChat.bind(this),
            phaseChanged: this.#onPhaseChanged.bind(this),
            languageChanged: this.#onLanguageChanged.bind(this),
            llmProviderChanged: this.#onLLMProviderChanged.bind(this),
            connectionChanged: this.#onConnectionChanged.bind(this)
        };
    }

    /**
     * @description Attach event listeners for chat operations
     * @private
     */
    #attachListeners() {
        this.#elements.sendButton?.addEventListener('click', this.#boundHandlers.sendClick);
        this.#elements.chatInput?.addEventListener('keypress', this.#boundHandlers.keyPress);
        
        const clearBtn = document.getElementById('clearChatBtn');
        clearBtn?.addEventListener('click', this.#boundHandlers.clearClick);

        window.addEventListener('phaseChanged', this.#boundHandlers.phaseChanged);
        window.addEventListener('languageChanged', this.#boundHandlers.languageChanged);
        window.addEventListener('llmProviderChanged', this.#boundHandlers.llmProviderChanged);
        window.addEventListener('connectionChanged', this.#boundHandlers.connectionChanged);
    }

    /**
     * @description Remove all event listeners
     * @private
     */
    #detachListeners() {
        this.#elements.sendButton?.removeEventListener('click', this.#boundHandlers.sendClick);
        this.#elements.chatInput?.removeEventListener('keypress', this.#boundHandlers.keyPress);
        
        const clearBtn = document.getElementById('clearChatBtn');
        clearBtn?.removeEventListener('click', this.#boundHandlers.clearClick);
        
        window.removeEventListener('phaseChanged', this.#boundHandlers.phaseChanged);
        window.removeEventListener('languageChanged', this.#boundHandlers.languageChanged);
        window.removeEventListener('llmProviderChanged', this.#boundHandlers.llmProviderChanged);
        window.removeEventListener('connectionChanged', this.#boundHandlers.connectionChanged);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PRIVATE HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @description Set token metadata
     * @param {Object} metadata - Token usage metadata
     * @private
     */
    #setTokenMetadata(metadata) {
        this.#tokenMetadata = metadata;
    }

    /**
     * @description Set LLM provider info
     * @param {Object} providerInfo - LLM provider information
     * @private
     */
    #setLLMProviderInfo(providerInfo) {
        this.#llmProviderInfo = providerInfo;
    }

    /**
     * @description Clear all thinking data
     * @private
     */
    #clearThinkingData() {
        this.#thinkingChain = [];
        this.#tokenMetadata = {};
        this.#llmProviderInfo = null;
    }

    /**
     * @description Notify user about retry attempts
     * @param {number} currentAttempt - Current retry attempt
     * @param {number} maxAttempts - Maximum retry attempts
     * @private
     */
    #notifyRetry(currentAttempt, maxAttempts) {
        const retryEvent = new CustomEvent('apiRetry', {
            detail: {
                attempt: currentAttempt,
                maxAttempts: maxAttempts
            }
        });
        window.dispatchEvent(retryEvent);
    }

    /**
     * @description Show error message to user
     * @param {string} message - Error message
     * @private
     */
    #showError(message) {
        console.error(message);
        window.dispatchEvent(new CustomEvent('appNotification', {
            detail: { message, type: 'error' }
        }));

        if (/server|connection|serveur|connexion|timeout|network|agent|overload/i.test(message)) {
            this.#displayErrorMessage(message);
        }
    }

    /**
     * @description Show retry notification to user
     * @param {string} message - Retry notification message
     * @private
     */
    #showRetryNotification(message) {
        window.dispatchEvent(new CustomEvent('appNotification', {
            detail: { message, type: 'warning', duration: 3000 }
        }));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // UTILITY METHODS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @description Delay execution for specified milliseconds
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise<void>}
     * @private
     */
    #delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * @description Escape HTML to prevent XSS
     * @param {string} text - Text to escape
     * @returns {string} Escaped HTML string
     * @private
     */
    #escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * @description Format bot response with basic markdown
     * @param {string|*} text - Text to format
     * @returns {string} Formatted HTML string
     * @private
     */
    #formatBotResponse(text) {
        if (!text) return '';
        const str = typeof text === 'string' ? text : String(text);
        return str
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>');
    }

    /**
     * @description Get current timestamp
     * @returns {string} Formatted timestamp
     * @private
     */
    #getTimestamp() {
        return new Intl.DateTimeFormat(this.#currentLanguage, {
            hour: '2-digit',
            minute: '2-digit'
        }).format(new Date());
    }
}
