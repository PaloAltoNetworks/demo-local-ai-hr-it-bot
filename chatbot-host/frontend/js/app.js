/**
 * ChatBot Application - Refactored with modular architecture and unified i18n
 */
import { ApiService } from './api-service.js';
import { UIManager } from './ui-manager.js';
import { QuestionsManager } from './questions-manager.js';
import { ConnectionMonitor } from './connection-monitor.js';
import { SecurityDevPanel } from './security-dev-panel.js';
import { ThemeManager } from './theme-manager.js';
import { LLMProviderManager } from './llm-provider-manager.js';
import { I18nService } from './i18n.js';
import { SessionManager } from './session-manager.js';

class ChatBotApp {
    constructor() {
        this.currentPhase = 'phase1';
        
        // Check if we need to restore a phase after refresh
        const returnToPhase = sessionStorage.getItem('returnToPhase');
        if (returnToPhase) {
            this.currentPhase = returnToPhase;
            sessionStorage.removeItem('returnToPhase');
        }
        
        this.chatHistory = [];
        this.securityDevPanel = null; // Will be initialized in init()
    }

    /**
     * Initialize the application
     */
    async init() {
        try {
            // Show loading indicator
            this.showLoading(true);

            // Initialize API service first
            this.apiService = new ApiService();

            // Initialize session manager and setup lifecycle
            this.sessionManager = new SessionManager(this.apiService);

            // Initialize i18n with API service (detects language automatically)
            this.i18n = new I18nService(this.apiService);
            await this.i18n.init();

            // Initialize theme manager with i18n service
            this.themeManager = new ThemeManager(this.i18n);

            // Initialize llm provider manager with i18n and API service
            this.LLMProviderManager = new LLMProviderManager(this.i18n, this.apiService);
            
            // Set initial llm provider
            this.apiService.setAIProvider(this.LLMProviderManager.getCurrentProvider());

            this.uiManager = new UIManager(this.i18n);
            this.questionsManager = new QuestionsManager(this.i18n, this.uiManager);
            this.connectionMonitor = new ConnectionMonitor(this.apiService, this.uiManager, this.i18n);
            
            // Initialize Security Dev Panel for real-time Prisma AIRS analysis
            this.securityDevPanel = new SecurityDevPanel(this.i18n);

            // Now that UI and i18n are initialized, pass them to SessionManager
            this.sessionManager.setUIManager(this.uiManager);
            this.sessionManager.setI18nService(this.i18n);
            await this.sessionManager.init();

            // Setup UI and event listeners
            this.i18n.updateUI();
            this.setupEventListeners();
            this.switchPhase(this.currentPhase, true); // Force render questions on initialization

            // Start connection monitoring
            this.connectionMonitor.start();

            this.showLoading(false);
            console.log(`ChatBot app initialized successfully`);
        } catch (error) {
            this.showLoading(false);
            console.error(`❌ Failed to initialize ChatBot app:`, error);

            // Use fallback error message
            const errorMsg = this.i18n.t('errors.initError') || 'Failed to initialize the application';
            this.uiManager?.showError(errorMsg);
        }
    }

    /**
     * Show/hide loading indicator
     */
    showLoading(show) {
        const loadingEl = document.getElementById('loading-indicator');
        if (loadingEl) {
            loadingEl.classList.toggle('show', show);
        }
    }

    /**
     * Setup all event listeners
     */
    setupEventListeners() {
        // Phase selector buttons
        document.querySelectorAll('.phase-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const phase = e.currentTarget.getAttribute('data-phase');
                if (phase && phase !== this.currentPhase) {
                    this.switchPhase(phase);
                }
            });
        });

        // Chat input and send button
        this.setupChatEventListeners();

        // Setup user menu display (language selection handled by i18n)
        this.setupUserMenu();

        // Listen for API retry events
        window.addEventListener('apiRetry', this.onApiRetry.bind(this));
    }

    /**
     * Handle API retry notifications
     */
    onApiRetry(event) {
        const { attempt, maxAttempts } = event.detail;
        const retryMsg = this.i18n.t('errors.retrying', { count: attempt, max: maxAttempts });
        this.uiManager?.showRetryNotification(retryMsg);
    }

    /**
     * Setup chat-related event listeners
     */
    setupChatEventListeners() {
        // Send message button
        const sendBtn = document.getElementById('sendMessage');
        sendBtn?.addEventListener('click', () => this.handleSendMessage());

        // Enter key in chat input
        const chatInput = document.getElementById('chatInput');
        chatInput?.addEventListener('keypress', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                this.handleSendMessage();
            }
        });

        // Clear chat button
        const clearBtn = document.getElementById('clearChatBtn');
        clearBtn?.addEventListener('click', () => this.clearChat());
    }

    /**
     * Clear the chat
     */
    clearChat() {
        this.chatHistory = [];
        const chatContainer = document.getElementById('chat-container');
        if (chatContainer) {
            chatContainer.innerHTML = '';
        }
    }

    /**
     * Handle sending a message
     */
    async handleSendMessage() {
        const chatInput = document.getElementById('chatInput');
        const userMessage = chatInput?.value.trim();

        if (!userMessage || this.isProcessing) return;

        // Check if we're online before attempting to send
        if (!this.apiService.getConnectionStatus()) {
            const errorMsg = this.i18n.t('errors.connectionError');
            this.uiManager?.showError(errorMsg);
            return;
        }

        try {
            this.isProcessing = true;

            // Store the phase when the message was sent (for later use in response)
            const messagePhase = this.currentPhase;

            // Add user message to history and display
            this.addMessageToHistory('user', userMessage);
            this.uiManager?.displayMessage('user', userMessage, messagePhase);

            // Clear input
            if (chatInput) chatInput.value = '';

            // Show initial thinking message
            this.uiManager?.showThinkingMessage('Thinking...');

            // Set up timeout warning
            const warningTimeout = setTimeout(() => {
                if (this.isProcessing) {
                    const timeoutWarning = this.i18n.t('errors.agentTimeout');
                    this.uiManager?.showRetryNotification(timeoutWarning);
                }
            }, 15000); // Show warning after 15 seconds

            // Send to API with streaming thinking messages
            const response = await this.apiService.sendMessageWithThinking(
                this.chatHistory,
                this.currentPhase,
                // Thinking callback
                (thinkingMessage, isComplete) => {
                    if (isComplete) {
                        // Thinking is complete, message will be replaced by final response
                    } else if (thinkingMessage) {
                        // Update thinking message
                        this.uiManager?.updateThinkingMessage(thinkingMessage);
                    }
                },
                // Complete callback
                (response) => {
                    // Clear timeout warning
                    clearTimeout(warningTimeout);
                    
                    // Hide thinking message
                    this.uiManager?.hideThinkingAnimation();
                    
                    if (response && response.messages) {
                        // Update chat history
                        this.chatHistory = response.messages;

                        // Set token metadata if available
                        if (response.metadata) {
                            this.uiManager?.setTokenMetadata(response.metadata);
                            // Store LLM provider info for display
                            if (response.metadata.llmProvider) {
                                this.uiManager?.setLLMProviderInfo(response.metadata.llmProvider);
                            }
                        }

                        // Display assistant response
                        const lastMessage = response.messages[response.messages.length - 1];
                        if (lastMessage && lastMessage.role === 'assistant') {
                            // Extract text content from array format if needed
                            let contentToDisplay = lastMessage.content;
                            
                            if (Array.isArray(contentToDisplay)) {
                                // Handle array format: [{"type": "text", "text": "..."}]
                                contentToDisplay = contentToDisplay
                                    .filter(item => item.type === 'text')
                                    .map(item => item.text)
                                    .join(' ');
                            } else if (typeof contentToDisplay === 'object' && contentToDisplay.text) {
                                // Handle single object format: {"type": "text", "text": "..."}
                                contentToDisplay = contentToDisplay.text;
                            }
                            
                            // Display with thinking chain if available, using the phase when message was sent
                            this.uiManager?.displayBotMessageWithThinking(contentToDisplay, messagePhase);
                        }
                    }
                },
                // Checkpoints are sent individually via SSE as separate events
                null, // onSecurityCheckpoints (batch) - not used
                // Individual checkpoint callback for real-time display
                (checkpoint) => {
                    if (this.securityDevPanel && checkpoint) {
                        this.securityDevPanel.addCheckpoint(checkpoint);
                    }
                }
            );

        } catch (error) {
            console.error('Error sending message:', error);
            
            // Clear timeout warning
            clearTimeout(warningTimeout);
            
            // Hide thinking message on error
            this.uiManager?.hideThinkingAnimation();
            
            // Provide specific error messages based on error type
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
                // Fallback for unknown errors
                errorMsg = this.i18n.t('errors.agentError');
            }
            
            this.uiManager?.showError(errorMsg);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Add message to chat history
     */
    addMessageToHistory(role, content) {
        this.chatHistory.push({
            role,
            content,
            phase: this.currentPhase
        });
    }

    /**
     * Update phase UI elements
     */
    updatePhaseUI() {
        // Update phase buttons
        this.uiManager.elements.phaseButtons.forEach(btn => {
            btn.classList.toggle('active',
                btn.getAttribute('data-phase') === this.currentPhase
            );
        });

        // Update body class
        document.body.className = `${this.currentPhase}-active`;

        console.log(`UI updated for phase: ${this.currentPhase}`);
    }

    /**
     * Switch to a different phase
     */
    switchPhase(newPhase, forceRender = false) {
        if (newPhase === this.currentPhase && !forceRender) return;

        this.currentPhase = newPhase;
        this.updatePhaseUI();

        // Refresh questions for new phase
        if (this.questionsManager) {
            this.questionsManager.renderQuestions(newPhase);
        }

        console.log(`Switched to phase: ${newPhase}`);
    }

    /**
     * Setup user menu functionality (language selection handled by i18n)
     */
    setupUserMenu() {
        const trigger = document.getElementById('userMenuTrigger');
        const dropdown = document.getElementById('userMenuDropdown');

        if (!trigger || !dropdown) return;

        // Toggle dropdown on trigger click
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('active');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!trigger.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.remove('active');
            }
        });

        // Update user menu with user info
        this.updateUserMenu();
    }

    /**
     * Update user menu with current user information
     */
    updateUserMenu() {
        const userName = document.getElementById('userMenuName');
        const userEmail = document.getElementById('userMenuEmail');
        const userMenuLabel = document.getElementById('userMenuLabel');

        if (userName) {
            userName.textContent = this.i18n.t('userProfile.name');
        }
        if (userEmail) {
            userEmail.textContent = this.i18n.t('userProfile.email');
        }
        if (userMenuLabel) {
            userMenuLabel.textContent = this.i18n.t('userMenu.label') || 'User';
        }
    }

    /**
     * Cleanup resources when app is destroyed
     */
    destroy() {
        if (this.connectionMonitor) {
            this.connectionMonitor.stop();
        }
        console.log('ChatBot app cleaned up');
    }
}

// Export for module usage
export { ChatBotApp };