/**
 * Chat Handler for managing message sending and chat operations
 * Includes streaming message handling, retry logic, and chat display
 */
import { CONFIG } from './config.js';

export class ChatHandler {
    constructor(apiService, i18n) {
        this.apiService = apiService;
        this.i18n = i18n;
        this.chatHistory = [];
        this.isProcessing = false;
        this.currentPhase = 'phase1';
        this.boundHandlers = {};
        this.currentLanguage = this.i18n.currentLanguage || 'en';
        this.currentLLMProvider = 'aws';
        
        // Chat display state
        this.thinkingMessageElement = null;
        this.thinkingChain = [];
        this.tokenMetadata = {};
        this.llmProviderInfo = null;
        this.isOnlineStatus = true;
        
        // Cache DOM elements for chat display
        this.elements = {};
        this.cacheElements();
    }

    /**
     * Cache frequently accessed DOM elements
     */
    cacheElements() {
        this.elements.chatMessages = document.getElementById('chat-container');
        this.elements.chatInput = document.getElementById('chatInput');
        this.elements.sendButton = document.getElementById('sendMessage');
    }

    /**
     * Initialize chat handler - called from constructor
     */
    init() {
        this.attachListeners();
        console.log('[ChatHandler] ChatHandler initialized');
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

        // Listen for connection changes
        window.addEventListener('connectionChanged', (event) => {
            const { isOnline, placeholder } = event.detail;
            this.isOnlineStatus = isOnline;
            this.updateChatAvailability(isOnline, placeholder);
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
        console.log('[ChatHandler] ChatHandler destroyed');
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
            this.displayMessage('user', userMessage, messagePhase);

            // Clear input
            this.clearChatInput();

            // Show thinking message
            this.showThinkingMessage('Thinking...');

            // Setup timeout warning
            const warningTimeout = setTimeout(() => {
                if (this.isProcessing) {
                    const timeoutWarning = this.i18n.t('errors.agentTimeout');
                    this.showRetryNotification(timeoutWarning);
                }
            }, 15000); // Show warning after 15 seconds

            // Send to API with streaming using generic post method
            const response = await this.sendMessageWithRetry(
                this.chatHistory,
                messagePhase,
                {
                    onThinking: (thinkingMessage, isComplete) => {
                        if (!isComplete && thinkingMessage) {
                            this.updateThinkingMessage(thinkingMessage);
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
            console.error('[ChatHandler] Error reading stream:', error);
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
            console.error('[ChatHandler] Error parsing SSE event:', e);
            throw e;
        }
    }

    /**
     * Handle stream errors with retry logic
     */
    async handleStreamError(error, chatHistory, currentPhase, callbacks, retryCount) {
        console.error(`[ChatHandler] Stream Error (attempt ${retryCount + 1}):`, error);
        
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
            console.warn(`[ChatHandler] Retry attempt ${retryCount + 1}:`, error.message);
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
        this.hideThinkingAnimation();
        
        if (response && response.messages) {
            // Update chat history
            this.chatHistory = response.messages;

            // Set token metadata if available
            if (response.metadata) {
                this.setTokenMetadata(response.metadata);
                if (response.metadata.llmProvider) {
                    this.setLLMProviderInfo(response.metadata.llmProvider);
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
                this.displayBotMessageWithThinking(contentToDisplay, messagePhase);
            }
        }
    }

    /**
     * Handle message sending error
     */
    handleMessageError(error) {
        // Hide thinking message on error
        this.hideThinkingAnimation();
        
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
        
        this.showError(errorMsg);
        console.error('[ChatHandler] Error sending message:', error);
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
        this.clearChatUI();
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

    // ========================================
    // Chat Display Methods
    // ========================================

    /**
     * Display a message in the chat UI
     */
    displayMessage(role, content, phase = null) {
        if (!this.elements.chatMessages) return;

        const messageElement = this.createMessageElement(role, content, phase);
        this.elements.chatMessages.appendChild(messageElement);
        this.scrollToBottom();
    }

    /**
     * Create a message element
     */
    createMessageElement(role, content, phase = null) {
        const messageDiv = document.createElement('div');
        let className = `message ${role}-message`;

        if (phase) {
            className += ` ${phase}-message`;
        }

        messageDiv.className = className;

        let icon, displayContent;

        if (role === 'system') {
            icon = 'warning';
            displayContent = this.escapeHtml(content);
        } else {
            const isUser = role === 'user';
            icon = isUser ? 'account_circle' : 'otter-icon';
            displayContent = isUser ? this.escapeHtml(content) : this.formatBotResponse(content);
        }

        messageDiv.innerHTML = `
            <div class="message-avatar">
                <span class="material-symbols">${icon}</span>
            </div>
            <div class="message-content">
                <div class="message-text">${displayContent}</div>
                <div class="message-timestamp">${this.getTimestamp()}</div>
            </div>
        `;

        return messageDiv;
    }

    /**
     * Display error message in chat
     */
    displayErrorMessage(message) {
        if (!this.elements.chatMessages) return;

        const errorElement = this.createMessageElement('system', message, null);
        errorElement.classList.add('message--error');
        this.elements.chatMessages.appendChild(errorElement);
        this.scrollToBottom();
    }

    /**
     * Display bot message with thinking chain
     */
    displayBotMessageWithThinking(content, phase = null) {
        if (!this.elements.chatMessages) return;

        const messageDiv = document.createElement('div');
        let className = `message bot-message`;
        if (phase) {
            className += ` ${phase}-message`;
        }
        messageDiv.className = className;

        const displayContent = this.formatBotResponse(content);
        const timestamp = this.getTimestamp();
        
        // Create message with thinking chain button if there are thoughts
        const hasThinkingChain = this.thinkingChain.length > 0;
        const hasTokens = this.tokenMetadata && (this.tokenMetadata.total_tokens || this.tokenMetadata.coordinator_tokens);
        const hasProvider = this.llmProviderInfo && this.llmProviderInfo.logo;
        
        let messageHTML = `
            <div class="message-avatar">
                <i class="otter-icon"></i>
            </div>
            <div class="message-content">
                <div class="message-text-wrapper">
                    <div class="message-text">${displayContent}</div>
        `;

        // Add LLM provider badge if available
        if (hasProvider) {
            messageHTML += `
                    <div class="llm-provider-badge" title="${this.llmProviderInfo.name}">
                        <img src="${this.llmProviderInfo.logo}" alt="${this.llmProviderInfo.name}" class="provider-badge-logo">
                    </div>
            `;
        }

        messageHTML += `
                </div>
                <div class="message-timestamp">${timestamp}</div>
        `;

        // Add token information if available
        if (hasTokens) {
            const totalTokens = this.tokenMetadata.total_tokens || 0;
            const coordinatorTokens = this.tokenMetadata.coordinator_tokens || 0;
            const agentTokens = this.tokenMetadata.agent_tokens || 0;
            
            messageHTML += `
                <div class="token-info">
                    <div class="token-info-row">
                        <span class="token-label" data-i18n="chat.totalTokens">
                            <span class="material-symbols">memory</span> ${this.i18n.t('chat.totalTokens')}:
                        </span>
                        <span class="token-count">${totalTokens}</span>
                    </div>
            `;
            
            if (coordinatorTokens > 0) {
                messageHTML += `
                    <div class="token-info-row token-info-detail">
                        <span class="token-label-detail" data-i18n="chat.coordinator">${this.i18n.t('chat.coordinator')}:</span>
                        <span class="token-count-detail">${coordinatorTokens}</span>
                    </div>
                `;
            }
            
            if (agentTokens > 0) {
                messageHTML += `
                    <div class="token-info-row token-info-detail">
                        <span class="token-label-detail" data-i18n="chat.agents">${this.i18n.t('chat.agents')}:</span>
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
                    <span class="thinking-toggle-text">${this.i18n.t('chat.viewThinking')}</span>
                </button>
                <div class="thinking-chain hidden" id="${thinkingId}">
            `;
            
            // Add each thinking step
            this.thinkingChain.forEach((thought, index) => {
                const formattedIcon = this.getThinkingIcon(thought.text);
                messageHTML += `
                    <div class="thinking-step">
                        <div class="thinking-step-header">
                            <span class="thinking-step-time">${thought.timestamp}</span>
                        </div>
                        <div class="thinking-step-content">
                            ${formattedIcon} ${this.escapeHtml(thought.text)}
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
        this.elements.chatMessages.appendChild(messageDiv);

        // Add event listener to toggle button
        if (hasThinkingChain) {
            const toggleBtn = messageDiv.querySelector('.thinking-toggle');
            const thinkingChain = messageDiv.querySelector('.thinking-chain');
            
            toggleBtn.addEventListener('click', () => {
                thinkingChain.classList.toggle('hidden');
                toggleBtn.classList.toggle('expanded');
            });
        }

        this.scrollToBottom();
        this.clearThinkingData();
    }

    /**
     * Get thinking icon HTML
     * @returns {string} HTML span element with icon
     */
    getThinkingIcon() {
        return '<span class="material-symbols thinking-icon">chat</span>';
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Format bot response with basic markdown
     */
    formatBotResponse(text) {
        if (!text) return '';
        const str = typeof text === 'string' ? text : String(text);
        return str
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>');
    }

    /**
     * Get current timestamp
     */
    getTimestamp() {
        return new Intl.DateTimeFormat(this.currentLanguage, {
            hour: '2-digit',
            minute: '2-digit'
        }).format(new Date());
    }

    /**
     * Show thinking message with text
     */
    showThinkingMessage(text = 'Thinking...') {
        if (!this.elements.chatMessages) return;
        
        // Remove existing thinking message if any
        this.hideThinkingAnimation();

        this.thinkingMessageElement = document.createElement('div');
        this.thinkingMessageElement.className = 'message bot-message thinking-message';

        this.thinkingMessageElement.innerHTML = `
            <div class="message-avatar">
                <i class="otter-icon"></i>
            </div>
            <div class="message-content">
                <div class="message-text thinking-text">
                    ${text}
                </div>
            </div>
        `;

        this.elements.chatMessages.appendChild(this.thinkingMessageElement);
        this.scrollToBottom();
    }

    /**
     * Update thinking message text with enhanced formatting
     * Also accumulates thinking chain for later display
     */
    updateThinkingMessage(text) {
        // Store thinking in chain
        this.addToThinkingChain(text);

        if (this.thinkingMessageElement) {
            const textElement = this.thinkingMessageElement.querySelector('.thinking-text');
            if (textElement) {
                // Enhanced formatting for different message types
                let formattedText = this.formatThinkingMessage(text);
                textElement.innerHTML = formattedText;
                
                // Add a subtle animation effect
                textElement.style.opacity = '0.7';
                setTimeout(() => {
                    textElement.style.opacity = '1';
                }, 100);
            }
        } else {
            // Create thinking message if it doesn't exist
            this.showThinkingMessage(text);
        }
    }

    /**
     * Add thinking message to chain
     */
    addToThinkingChain(text) {
        const cleanText = text.replace(/^\[COORDINATOR\]\s*/, '');
        const timestamp = new Date().toLocaleTimeString(this.currentLanguage);
        this.thinkingChain.push({
            text: cleanText,
            timestamp: timestamp,
            timestamp_ms: Date.now()
        });
    }

    /**
     * Format thinking messages with icons and styling
     * @param {string} text - The thinking message text to format
     * @returns {string} HTML string with formatted text and icon
     */
    formatThinkingMessage(text) {
        // Remove [COORDINATOR] prefix if present
        const cleanText = text.replace(/^\[COORDINATOR\]\s*/, '');
        
        return `<span class="material-symbols thinking-icon">chat</span> ${cleanText}`;
    }

    /**
     * Hide thinking animation
     */
    hideThinkingAnimation() {
        if (this.thinkingMessageElement && this.thinkingMessageElement.parentNode) {
            this.thinkingMessageElement.parentNode.removeChild(this.thinkingMessageElement);
            this.thinkingMessageElement = null;
        }
    }

    /**
     * Set token metadata
     */
    setTokenMetadata(metadata) {
        this.tokenMetadata = metadata;
    }

    /**
     * Set LLM provider info
     */
    setLLMProviderInfo(providerInfo) {
        this.llmProviderInfo = providerInfo;
    }

    /**
     * Clear all thinking data (chain + metadata)
     */
    clearThinkingData() {
        this.thinkingChain = [];
        this.tokenMetadata = {};
        this.llmProviderInfo = null;
    }

    /**
     * Scroll chat to bottom
     */
    scrollToBottom() {
        if (this.elements.chatMessages) {
            this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
        }
    }

    /**
     * Clear the chat input field
     */
    clearChatInput() {
        if (this.elements.chatInput) {
            this.elements.chatInput.value = '';
        }
    }

    /**
     * Clear all chat messages from UI
     */
    clearChatUI() {
        if (this.elements.chatMessages) {
            this.elements.chatMessages.innerHTML = '';
        }
    }

    /**
     * Show error message to user
     */
    showError(message) {
        console.error(message);
        window.dispatchEvent(new CustomEvent('appNotification', {
            detail: { message, type: 'error' }
        }));

        // Also display error in chat if it's a communication error
        if (message.includes('server') || message.includes('connection') || message.includes('serveur') || message.includes('connexion') ||
            message.includes('timeout') || message.includes('network') || message.includes('agent') || message.includes('overload')) {
            this.displayErrorMessage(message);
        }
    }

    /**
     * Show retry notification to user
     */
    showRetryNotification(message) {
        window.dispatchEvent(new CustomEvent('appNotification', {
            detail: { message, type: 'warning', duration: 3000 }
        }));
    }

    /**
     * Update chat interface availability based on connection status
     */
    updateChatAvailability(isOnline, placeholder = null) {
        if (this.elements.sendButton) {
            this.elements.sendButton.disabled = !isOnline || this.isProcessing;
        }

        if (this.elements.chatInput) {
            this.elements.chatInput.disabled = !isOnline;
            
            if (placeholder) {
                this.elements.chatInput.placeholder = placeholder;
            }
        }
    }

    /**
     * Temporarily disable chat with custom message
     */
    temporarilyDisableChat(message, duration = 5000) {
        this.updateChatAvailability(false, message);
        
        setTimeout(() => {
            this.updateChatAvailability(this.isOnlineStatus);
        }, duration);
    }
}
