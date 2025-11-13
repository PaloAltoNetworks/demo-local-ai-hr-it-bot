/**
 * UI Manager for handling user interface operations
 */
import { Utils } from './utils.js';

export class UIManager {
    constructor(language, i18n) {
        this.language = language;
        this.i18n = i18n;
        this.elements = this.cacheElements();
        this.connectionStatusCallbacks = [];
        this.thinkingMessageElement = null;
        this.isOnlineStatus = true;
        this.thinkingChain = []; // Store thinking chain
        this.currentThinkingContainer = null; // Current thinking message container
        this.tokenMetadata = {}; // Store token usage metadata
    }

    /**
     * Cache frequently used DOM elements
     */
    cacheElements() {
        return {
            chatInput: document.getElementById('chatInput'),
            chatMessages: document.getElementById('chat-container'),
            sendButton: document.getElementById('sendMessage'),
            questionsContainer: document.getElementById('questions-container'),
            phaseButtons: document.querySelectorAll('.phase-btn'),
            statusIndicator: document.getElementById('statusIndicator'),
            statusIcon: document.getElementById('statusIcon'),
            statusText: document.getElementById('statusText')
        };
    }

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

        // Ajouter la classe de phase si elle est fournie
        if (phase) {
            className += ` ${phase}-message`;
        }

        messageDiv.className = className;

        let icon, displayContent;

        if (role === 'system') {
            icon = 'warning';
            displayContent = Utils.escapeHtml(content);
        } else {
            const isUser = role === 'user';
            icon = isUser ? 'account_circle' : 'otter-icon';
            displayContent = isUser ? Utils.escapeHtml(content) : Utils.formatBotResponse(content);
        }

        messageDiv.innerHTML = `
            <div class="message-avatar">
                <span class="material-symbols">${icon}</span>
            </div>
            <div class="message-content">
                <div class="message-text">${displayContent}</div>
                <div class="message-timestamp">${Utils.getTimestamp(this.language)}</div>
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
     * Display a bot message with thinking chain
     */
    displayBotMessageWithThinking(content, phase = null) {
        if (!this.elements.chatMessages) return;

        const messageDiv = document.createElement('div');
        let className = `message bot-message`;
        if (phase) {
            className += ` ${phase}-message`;
        }
        messageDiv.className = className;

        const displayContent = Utils.formatBotResponse(content);
        const timestamp = Utils.getTimestamp(this.language);
        
        // Create message with thinking chain button if there are thoughts
        const hasThinkingChain = this.thinkingChain.length > 0;
        const hasTokens = this.tokenMetadata && (this.tokenMetadata.total_tokens || this.tokenMetadata.coordinator_tokens);
        
        let messageHTML = `
            <div class="message-avatar">
                <i class="otter-icon"></i>
            </div>
            <div class="message-content">
                <div class="message-text">${displayContent}</div>
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
                            ${formattedIcon} ${Utils.escapeHtml(thought.text)}
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
     * Get thinking icon HTML based on content
     */
    getThinkingIcon(text) {
        if (text.includes('Analyzing') || text.includes('🔍')) {
            return `<span class="material-symbols thinking-icon">search</span>`;
        } else if (text.includes('Checking language') || text.includes('🌐')) {
            return `<span class="material-symbols thinking-icon">public</span>`;
        } else if (text.includes('Translated') || text.includes('🔄')) {
            return `<span class="material-symbols thinking-icon">language</span>`;
        } else if (text.includes('Determining') || text.includes('🎯')) {
            return `<span class="material-symbols thinking-icon">center_focus_strong</span>`;
        } else if (text.includes('Connecting') || text.includes('📡')) {
            return `<span class="material-symbols thinking-icon">cloud_queue</span>`;
        } else if (text.includes('processing') || text.includes('⏳')) {
            return `<span class="material-symbols thinking-icon spinning">settings</span>`;
        } else if (text.includes('Response received') || text.includes('✅')) {
            return `<span class="material-symbols thinking-icon success">check_circle</span>`;
        } else if (text.includes('Error') || text.includes('❌')) {
            return `<span class="material-symbols thinking-icon error">cancel</span>`;
        } else {
            return `<span class="material-symbols thinking-icon">chat</span>`;
        }
    }

    /**
     * Show thinking animation in chat
     */
    showThinkingAnimation() {
        if (!this.elements.chatMessages || this.thinkingMessageElement) return;

        this.thinkingMessageElement = document.createElement('div');
        this.thinkingMessageElement.className = 'message bot-message thinking-message';

        this.thinkingMessageElement.innerHTML = `
            <div class="message-avatar">
                <i class="otter-icon"></i>
            </div>
            <div class="message-content">
                <div class="message-text">
                    <div class="thinking-dots">
                        <div class="thinking-dot"></div>
                        <div class="thinking-dot"></div>
                        <div class="thinking-dot"></div>
                    </div>
                </div>
            </div>
        `;

        this.elements.chatMessages.appendChild(this.thinkingMessageElement);
        this.scrollToBottom();
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
        const timestamp = new Date().toLocaleTimeString(this.language);
        this.thinkingChain.push({
            text: cleanText,
            timestamp: timestamp,
            timestamp_ms: Date.now()
        });
    }

    /**
     * Clear thinking chain
     */
    clearThinkingChain() {
        this.thinkingChain = [];
    }

    /**
     * Get thinking chain
     */
    getThinkingChain() {
        return this.thinkingChain;
    }

    /**
     * Set token metadata
     */
    setTokenMetadata(metadata) {
        this.tokenMetadata = metadata;
    }

    /**
     * Get token metadata
     */
    getTokenMetadata() {
        return this.tokenMetadata;
    }

    /**
     * Clear all thinking data (chain + metadata)
     */
    clearThinkingData() {
        this.thinkingChain = [];
        this.tokenMetadata = {};
    }

    /**
     * Format thinking messages with icons and styling
     */
    formatThinkingMessage(text) {
        // Remove [COORDINATOR] prefix if present
        const cleanText = text.replace(/^\[COORDINATOR\]\s*/, '');
        
        // Add appropriate styling based on content
        if (cleanText.includes('Analyzing') || cleanText.includes('🔍')) {
            return `<span class="material-symbols thinking-icon">search</span> ${cleanText}`;
        } else if (cleanText.includes('Checking language') || cleanText.includes('🌐')) {
            return `<span class="material-symbols thinking-icon">public</span> ${cleanText}`;
        } else if (cleanText.includes('Translated') || cleanText.includes('🔄')) {
            return `<span class="material-symbols thinking-icon">language</span> ${cleanText}`;
        } else if (cleanText.includes('Determining') || cleanText.includes('🎯')) {
            return `<span class="material-symbols thinking-icon">center_focus_strong</span> ${cleanText}`;
        } else if (cleanText.includes('Connecting') || cleanText.includes('📡')) {
            return `<span class="material-symbols thinking-icon">cloud_queue</span> ${cleanText}`;
        } else if (cleanText.includes('processing') || cleanText.includes('⏳')) {
            return `<span class="material-symbols thinking-icon spinning">settings</span> ${cleanText}`;
        } else if (cleanText.includes('Response received') || cleanText.includes('✅')) {
            return `<span class="material-symbols thinking-icon success">check_circle</span> ${cleanText}`;
        } else if (cleanText.includes('Error') || cleanText.includes('❌')) {
            return `<span class="material-symbols thinking-icon error">cancel</span> ${cleanText}`;
        } else {
            return `<span class="material-symbols thinking-icon">chat</span> ${cleanText}`;
        }
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
     * Set processing state
     */
    setProcessingState(isProcessing) {
        if (isProcessing) {
            this.showThinkingAnimation();
        } else {
            this.hideThinkingAnimation();
        }

        // Update chat availability
        this.updateChatAvailability(this.isOnlineStatus);
    }

    /**
     * Check if currently processing
     */
    isProcessing() {
        return this.thinkingMessageElement !== null;
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
     * Update connection status UI
     */
    updateConnectionStatus(isOnline, healthData = null) {
        if (!this.elements.statusIndicator) return;

        // Track online status
        this.isOnlineStatus = isOnline;

        // Determine status based on health data
        let statusClass = 'status--error';
        let statusIcon = 'warning';
        let statusText = this.i18n.t('chat.offline');
        let customPlaceholder = null;

        if (isOnline) {
            if (healthData && healthData.status === 'degraded' && !healthData.serviceAvailable) {
                // Service degraded - MCP unavailable but basic functionality works
                statusClass = 'status--warning';
                statusIcon = 'warning';
                statusText = this.i18n.t('chat.online') + ' (Limited)';
                customPlaceholder = this.i18n.t('errors.mcpUnavailable');
            } else {
                // Fully operational
                statusClass = 'status--success';
                statusIcon = 'check_circle';
                statusText = this.i18n.t('chat.online');
            }
        }

        // Update status indicator class (for styling based on state)
        this.elements.statusIndicator.className = `status ${statusClass}`;

        // Update icon only
        if (this.elements.statusIcon) {
            this.elements.statusIcon.textContent = statusIcon;
        }

        // Update text only
        if (this.elements.statusText) {
            this.elements.statusText.textContent = statusText;
        }

        // Update chat availability with custom placeholder if needed
        this.updateChatAvailability(isOnline, customPlaceholder);

        // Notify callbacks
        this.connectionStatusCallbacks.forEach(callback => callback(isOnline));
    }

    /**
     * Update chat interface availability based on connection status
     */
    updateChatAvailability(isOnline, customMessage = null) {
        if (this.elements.sendButton) {
            this.elements.sendButton.disabled = !isOnline || this.isProcessing();
        }

        if (this.elements.chatInput) {
            this.elements.chatInput.disabled = !isOnline;
            
            if (customMessage) {
                this.elements.chatInput.placeholder = customMessage;
            } else {
                this.elements.chatInput.placeholder = isOnline
                    ? this.i18n.t('chat.placeholder')
                    : this.i18n.t('chat.placeholderOffline');
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

    /**
     * Show a temporary notification to the user
     */
    showNotification(message, type = 'info', duration = 4000) {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification--${type}`;
        
        // Choose appropriate icon
        let icon;
        switch(type) {
            case 'success': icon = 'check_circle'; break;
            case 'error': icon = 'cancel'; break;
            case 'warning': icon = 'warning'; break;
            default: icon = 'info'; break;
        }
        
        notification.innerHTML = `
            <div class="notification__content">
                <span class="material-symbols">${icon}</span>
                <span>${message}</span>
            </div>
        `;

        // Add to page
        document.body.appendChild(notification);

        // Trigger show animation
        setTimeout(() => notification.classList.add('notification--show'), 100);

        // Auto-remove after delay
        setTimeout(() => {
            notification.classList.remove('notification--show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, duration);
    }

    /**
     * Show error message to user
     */
    showError(message) {
        console.error(message);
        this.showNotification(message, 'error');

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
        this.showNotification(message, 'warning', 3000); // Show for 3 seconds
    }

    /**
     * Show connection status change notification
     */
    showConnectionStatusChange(isOnline, healthData = null) {
        let message;

        if (isOnline) {
            // Check if services are degraded
            if (healthData && healthData.status === 'degraded' && !healthData.serviceAvailable) {
                message = this.i18n.t('errors.servicesDegraded');
                this.showNotification(message, 'warning');
            } else {
                message = this.i18n.t('chat.connectionRestored');
                this.showNotification(message, 'success');
            }
        } else {
            // Use specific MCP/service error message if available
            if (healthData && healthData.message) {
                message = healthData.message;
            } else if (healthData && healthData.unhealthyServers && healthData.unhealthyServers.length > 0) {
                const serverList = healthData.unhealthyServers.join(', ');
                message = this.i18n.t('chat.ollamaServersDown').replace('{servers}', serverList);
            } else {
                message = this.i18n.t('chat.connectionLost');
            }
            this.showNotification(message, 'error');
        }
    }

    /**
     * Get user input value
     */
    getUserInput() {
        return this.elements.chatInput?.value?.trim() || '';
    }

    /**
     * Clear user input
     */
    clearUserInput() {
        if (this.elements.chatInput) {
            this.elements.chatInput.value = '';
        }
    }

    /**
     * Set user input value
     */
    setUserInput(value) {
        if (this.elements.chatInput) {
            this.elements.chatInput.value = value;
            this.elements.chatInput.focus();
        }
    }

    /**
     * Register callback for connection status changes
     */
    onConnectionStatusChange(callback) {
        this.connectionStatusCallbacks.push(callback);
    }

    /**
     * Update language
     */
    setLanguage(language) {
        this.language = language;
    }


}
