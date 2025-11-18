/**
 * ChatBot Application - Refactored with modular architecture and unified i18n
 */
import { ApiService } from './api-service.js';
import { UIManager } from './ui-manager.js';
import { QuestionsManager } from './questions-manager.js';
import { ConnectionMonitor } from './connection-monitor.js';
import { SecurityDevPanel } from './security-dev-panel.js';
import { ThemeManager } from './theme-manager.js';
import { i18n } from './i18n.js';

class ChatBotApp {
    constructor() {
        // Default to English, but detect from URL params or localStorage
        this.currentLanguage = this.detectLanguage();
        this.currentPhase = 'phase1';
        
        // Check if we need to restore a phase after refresh
        const returnToPhase = sessionStorage.getItem('returnToPhase');
        if (returnToPhase) {
            this.currentPhase = returnToPhase;
            sessionStorage.removeItem('returnToPhase');
        }
        
        this.chatHistory = [];
        this.securityDevPanel = null; // Will be initialized in init()

        console.log(`Initial language detected: ${this.currentLanguage}`);
    }

    /**
     * Detect user's preferred language
     */
    detectLanguage() {
        // 1. Check URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const urlLang = urlParams.get('lang');

        // 2. Check localStorage
        const savedLang = localStorage.getItem('chatbot-language');

        // 3. Check browser language
        const browserLang = navigator.language?.substring(0, 2);

        // Priority: URL > localStorage > browser > default (English)
        return urlLang || savedLang || 'en';
    }

    /**
     * Initialize the application
     */
    async init() {
        try {
            // Show loading indicator
            this.showLoading(true);

            // Initialize i18n first
            await i18n.init(this.currentLanguage);

            // Initialize theme manager for dark/light mode switching
            this.themeManager = new ThemeManager();

            // Initialize services with i18n
            this.apiService = new ApiService();
            this.apiService.setLanguage(this.currentLanguage); // Set initial language
            this.uiManager = new UIManager(this.currentLanguage, i18n);
            this.questionsManager = new QuestionsManager(i18n, this.uiManager);
            this.connectionMonitor = new ConnectionMonitor(this.apiService, this.uiManager);
            
            // Initialize Security Dev Panel for real-time Prisma AIRS analysis
            this.securityDevPanel = new SecurityDevPanel(i18n);

            // Setup page lifecycle events to handle refresh
            this.setupPageLifecycleEvents();

            // Setup UI and event listeners
            await this.updateUI();
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
            const errorMsg = i18n.t('errors.initError') || 'Failed to initialize the application';
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
     * Update UI text based on current language
     */
    async updateUI() {
        // Delegate all UI translation updates to i18n service
        i18n.updateUI();
    }

    /**
     * Setup all event listeners
     */
    setupEventListeners() {
        // User Menu Setup
        this.setupUserMenu();

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

        // Listen for global language change events
        window.addEventListener('languageChanged', this.onLanguageChanged.bind(this));
        
        // Listen for API retry events
        window.addEventListener('apiRetry', this.onApiRetry.bind(this));
    }

    /**
     * Change language
     */
    async changeLanguage(language) {
        try {
            this.showLoading(true);

            await i18n.changeLanguage(language);
            this.currentLanguage = language;

            // Save to localStorage
            localStorage.setItem('chatbot-language', language);

            // Update URL without reload
            const url = new URL(window.location);
            url.searchParams.set('lang', language);
            window.history.replaceState({}, '', url);

            // Update UI
            await this.updateUI();

            // Update API service language
            if (this.apiService) {
                this.apiService.setLanguage(language);
            }

            // Refresh questions for new language
            if (this.questionsManager) {
                this.questionsManager.setLanguage(language);
                this.questionsManager.renderQuestions(this.currentPhase);
            }

            this.showLoading(false);

        } catch (error) {
            this.showLoading(false);
            console.error('Error changing language:', error);
        }
    }

    /**
     * Handle global language change events
     */
    async onLanguageChanged(event) {
        const { language } = event.detail;
        if (language !== this.currentLanguage) {
            this.currentLanguage = language;
            await this.updateUI();
        }
    }

    /**
     * Handle API retry notifications
     */
    onApiRetry(event) {
        const { attempt, maxAttempts } = event.detail;
        const retryMsg = i18n.t('errors.retrying', { count: attempt, max: maxAttempts });
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
     * Setup page lifecycle events to detect and handle page refresh
     */
    setupPageLifecycleEvents() {
        // Detect if this is a new page load (not a simple state change)
        // We use sessionStorage to track if the page was refreshed
        
        // Check if this is a fresh page load (new session)
        if (!sessionStorage.getItem('chatbot-session-id')) {
            // This is a fresh page load, set a session ID in sessionStorage
            const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            sessionStorage.setItem('chatbot-session-id', sessionId);
            
            // Clear the server-side session by calling the clear-session endpoint
            this.clearServerSession();
            
            console.log('Page refreshed or new session detected, clearing server-side session');
        }
        
        // Listen for unload events to clear session ID so it fires on every page refresh
        window.addEventListener('beforeunload', () => {
            // Clear session ID so the next page load will trigger clear-session
            sessionStorage.removeItem('chatbot-session-id');
        });
    }

    /**
     * Clear server-side session to ensure fresh start after page refresh
     */
    async clearServerSession() {
        try {
            await this.apiService.clearSession();
        } catch (error) {
            console.warn('⚠️ Error clearing server session:', error);
            // Don't fail the app initialization if clear fails
        }
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
            const errorMsg = i18n.t('errors.connectionError');
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
                    const timeoutWarning = i18n.t('errors.agentTimeout');
                    this.uiManager?.showRetryNotification(timeoutWarning);
                }
            }, 15000); // Show warning after 15 seconds

            // Send to API with streaming thinking messages
            const response = await this.apiService.sendMessageWithThinking(
                this.chatHistory,
                this.currentPhase,
                this.currentLanguage,
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
                errorMsg = i18n.t('errors.agentTimeout');
            } else if (errorMessage === 'NETWORK_ERROR') {
                errorMsg = i18n.t('errors.networkError');
            } else if (errorMessage === 'SERVER_OVERLOAD') {
                errorMsg = i18n.t('errors.serverOverload');
            } else if (errorMessage === 'SERVER_ERROR') {
                errorMsg = i18n.t('errors.serverError');
            } else {
                // Fallback for unknown errors
                errorMsg = i18n.t('errors.agentError');
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
     * Setup user menu functionality
     */
    async setupUserMenu() {
        const trigger = document.getElementById('userMenuTrigger');
        const dropdown = document.getElementById('userMenuDropdown');
        const languageSelect = document.getElementById('userMenuLanguageSelect');
        const logoutBtn = document.getElementById('userMenuLogout');

        if (!trigger || !dropdown) return;

        // Populate language options dynamically from backend using i18n service
        await i18n.populateLanguageSelect(languageSelect);

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

        // Close dropdown when clicking inside it
        dropdown.addEventListener('click', (e) => {
            if (e.target !== languageSelect) {
                // Keep open for language select changes
            }
        });

        // Language selection from user menu
        if (languageSelect) {
            languageSelect.addEventListener('change', async (e) => {
                const newLang = e.target.value;
                if (newLang && newLang !== this.currentLanguage) {
                    await this.changeLanguage(newLang);
                    // Keep dropdown open
                }
            });
        }

        // Logout button
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                this.handleLogout();
            });
        }

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
        const languageSelect = document.getElementById('userMenuLanguageSelect');

        if (userName) {
            userName.textContent = i18n.t('userProfile.name');
        }
        if (userEmail) {
            userEmail.textContent = i18n.t('userProfile.email');
        }
        if (userMenuLabel) {
            userMenuLabel.textContent = i18n.t('userMenu.label') || 'User';
        }
        if (languageSelect) {
            languageSelect.value = this.currentLanguage;
        }
    }

    /**
     * Handle logout action
     */
    async handleLogout() {
        console.log('🚪 Logout initiated');
        
        // Clear user session data from localStorage
        localStorage.removeItem('chatbot-session');
        
        // Clear server-side session
        await this.clearServerSession();
        
        // Show confirmation message
        this.uiManager?.showNotification(i18n.t('userMenu.logoutSuccess') || 'Logged out successfully', 'success');
        
        // Optional: Reload page or redirect
        setTimeout(() => {
            // Uncomment to redirect to login page
            // window.location.href = '/login';
            console.log('Logout complete');
        }, 1000);
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