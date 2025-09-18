/**
 * La Loutre - Frontend Application
 * Enterprise HR/IT Assistant with WebSocket Real-time Chat
 */

class LaLoutreApp {
    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.messageHistory = [];
        this.languageService = null;

        this.init();
    }

    /**
     * Initialize the application
     */
    async init() {
        // Wait for language service to be available
        await this.initializeLanguageService();
        
        this.setupEventListeners();
        this.connectWebSocket();
        this.checkOllamaStatus();

        // Auto-resize textarea
        this.setupTextareaResize();
    }

    /**
     * Initialize the language service
     */
    async initializeLanguageService() {
        // Wait for language service to be ready
        if (window.languageService) {
            this.languageService = window.languageService;
        } else {
            // Wait for language service to initialize
            await new Promise((resolve) => {
                const checkService = () => {
                    if (window.languageService) {
                        this.languageService = window.languageService;
                        resolve();
                    } else {
                        setTimeout(checkService, 100);
                    }
                };
                checkService();
            });
        }

        // Listen for language changes
        window.addEventListener('languageChanged', (event) => {
            this.onLanguageChanged(event.detail);
        });

        console.log('Language service initialized in app');
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Language selector
        document.getElementById('language-selector').addEventListener('change', async (e) => {
            await this.languageService.setLanguage(e.target.value);
        });

        // Send message
        document.getElementById('send-button').addEventListener('click', () => {
            this.sendMessage();
        });

        // Enter to send (Ctrl+Enter for new line)
        document.getElementById('chat-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

                // Example question buttons (moved from quick actions)
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('example-question')) {
                const queryKey = e.target.getAttribute('data-query');
                if (queryKey) {
                    // Get the localized query text
                    const query = this.languageService.getText(`quickActions.${queryKey}`);
                    // Put the text in the input field
                    const input = document.getElementById('chat-input');
                    input.value = query;
                    input.focus();
                    // Optionally auto-send the message
                    // this.sendMessage();
                }
            }
        });
    }

    /**
     * Setup textarea auto-resize
     */
    setupTextareaResize() {
        const textarea = document.getElementById('chat-input');
        textarea.addEventListener('input', () => {
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
        });
    }

    /**
     * Connect to WebSocket server
     */
    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log('WebSocket connected');
                this.isConnected = true;
                this.updateConnectionStatus('connected');
            };

            this.ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                this.handleIncomingMessage(message);
            };

            this.ws.onclose = () => {
                console.log('WebSocket disconnected');
                this.isConnected = false;
                this.updateConnectionStatus('disconnected');

                // Attempt to reconnect after 3 seconds
                setTimeout(() => {
                    this.connectWebSocket();
                }, 3000);
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.updateConnectionStatus('disconnected');
            };

        } catch (error) {
            console.error('Failed to create WebSocket connection:', error);
            this.updateConnectionStatus('disconnected');
        }
    }

    /**
     * Update connection status indicator
     */
    updateConnectionStatus(status) {
        const statusText = document.getElementById('connection-indicator');

        const text = this.languageService ? this.languageService.getText(status) : status;
        statusText.textContent = text;

        console.log(`Connection status: ${status}`);

        if (status === 'connected') {
            statusText.className = 'connected';
        } else {
            statusText.className = 'disconnected';
        }
    }

    /**
     * Handle incoming WebSocket messages
     */
    handleIncomingMessage(message) {
        this.hideTypingIndicator();

        if (message.type === 'system' || message.type === 'assistant') {
            this.addMessageToChat('assistant', message.content, message.language);
        } else if (message.type === 'error') {
            this.addMessageToChat('system', message.content, message.language);
        }

        // Store message in history
        this.messageHistory.push(message);
    }

    /**
     * Send a message via WebSocket
     */
    sendMessage() {
        const input = document.getElementById('chat-input');
        const message = input.value.trim();

        if (!message || !this.isConnected) {
            return;
        }

        // Add user message to chat
        this.addMessageToChat('user', message, this.languageService.getCurrentLanguage());

        // Send to server
        this.ws.send(JSON.stringify({
            type: 'chat',
            content: message,
            language: this.languageService.getCurrentLanguage(),
            timestamp: new Date().toISOString()
        }));

        // Clear input and show typing indicator
        input.value = '';
        input.style.height = 'auto';
        this.showTypingIndicator();

        // Store in history
        this.messageHistory.push({
            type: 'user',
            content: message,
            language: this.languageService ? this.languageService.getCurrentLanguage() : 'en',
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Send a quick message from buttons/links
     */
    sendQuickMessage(query) {
        const input = document.getElementById('chat-input');
        input.value = query;
        this.sendMessage();
    }

    /**
     * Add message to chat display
     */
    addMessageToChat(sender, content, language) {
        const chatMessages = document.getElementById('chat-messages');

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;

        const avatar = document.createElement('div');
        avatar.className = `message-avatar ${sender}`;

        if (sender === 'user') {
            avatar.textContent = '👤';
        } else if (sender === 'assistant') {
            avatar.textContent = '🦦';
        } else {
            avatar.textContent = '🤖';
        }

        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';

        // Format message content with basic markdown-like formatting
        const formattedContent = this.formatMessageContent(content);
        messageContent.innerHTML = formattedContent;

        messageDiv.appendChild(avatar);
        messageDiv.appendChild(messageContent);

        chatMessages.appendChild(messageDiv);

        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    /**
     * Format message content with basic styling
     */
    formatMessageContent(content) {
        return content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')  // Bold
            .replace(/\*(.*?)\*/g, '<em>$1</em>')              // Italic
            .replace(/`(.*?)`/g, '<code>$1</code>')            // Code
            .replace(/\n/g, '<br>')                            // Line breaks
            .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>'); // Links
    }

    /**
     * Show typing indicator
     */
    showTypingIndicator() {
        const indicator = document.getElementById('typing-indicator');
        indicator.classList.add('show');
    }

    /**
     * Hide typing indicator
     */
    hideTypingIndicator() {
        const indicator = document.getElementById('typing-indicator');
        indicator.classList.remove('show');
    }

    /**
     * Handle language change events from the language service
     */
    onLanguageChanged(detail) {
        const { currentLanguage } = detail;
        
        // Update any dynamic content that isn't handled by data-i18n attributes
        this.updateDynamicContent();
        
        console.log(`Language changed to: ${currentLanguage}`);
    }

    /**
     * Update dynamic content that can't use data-i18n attributes
     */
    updateDynamicContent() {
        // Most content is now handled automatically by the language service's updateUI method
        // Only add specific dynamic updates here if needed
        
        // Example: Update Ollama status if needed
        this.checkOllamaStatus();
    }



    /**
     * Check Ollama service status
     */
    async checkOllamaStatus() {
        try {
            const response = await fetch('/health');
            if (response.ok) {
                // Try to detect if Ollama is available by checking AI response
                const testResponse = await fetch('/api/hr/request', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        query: 'test',
                        language: this.languageService ? this.languageService.getCurrentLanguage() : 'en'
                    })
                });

                const indicator = document.getElementById('ollama-indicator');
                if (testResponse.ok) {
                    indicator.textContent = this.languageService ? this.languageService.getText('status.ollamaConnected') : 'Connected';
                    indicator.className = 'connected';
                } else {
                    indicator.textContent = this.languageService ? this.languageService.getText('status.ollamaDisconnected') : 'Fallback Mode';
                    indicator.className = 'disconnected';
                }
            }
        } catch (error) {
            console.error('Failed to check Ollama status:', error);
            const indicator = document.getElementById('ollama-indicator');
            indicator.textContent = this.languageService ? this.languageService.getText('status.ollamaError') : 'Unavailable';
            indicator.className = 'disconnected';
        }
    }


}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.laLoutre = new LaLoutreApp();
});

// Export for testing purposes
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LaLoutreApp;
}