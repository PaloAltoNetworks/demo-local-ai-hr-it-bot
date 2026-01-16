/**
 * ChatBot Application - Pure Orchestrator Pattern
 * Initializes and wires up all modules, NO business logic
 */
import { ApiService } from './api-service.js';
import { UIManager } from './ui-manager.js';
import { ConnectionMonitor } from './connection-monitor.js';
import { SecurityDevPanel } from './security-dev-panel.js';
import { ThemeManager } from './theme-manager.js';
import { LLMProviderManager } from './llm-provider-manager.js';
import { I18nService } from './i18n.js';
import { SessionManager } from './session-manager.js';
import { ChatHandler } from './chat-handler.js';
import { PhaseManager } from './phase-manager.js';

class ChatBotApp {
    constructor() {
        this.modules = {};
    }

    /**
     * Initialize the application
     */
    async init() {
        try {
            this.showLoading(true);

            // Initialize in dependency order
            this.initializeCore();
            await this.initializeServices();
            this.initializeManagers();
            this.wireupDependencies();

            this.showLoading(false);
            console.log('✅ ChatBot app initialized successfully');
        } catch (error) {
            this.showLoading(false);
            console.error('❌ Failed to initialize ChatBot app:', error);
            this.handleInitError(error);
        }
    }

    /**
     * Initialize core services (API, i18n, theme, session)
     */
    initializeCore() {
        this.modules.apiService = new ApiService();
        this.modules.i18n = new I18nService(this.modules.apiService);
        this.modules.themeManager = new ThemeManager(this.modules.i18n);
        this.modules.sessionManager = new SessionManager(this.modules.apiService);
    }

    /**
     * Initialize async services
     */
    async initializeServices() {
        await this.modules.i18n.init();
        await this.modules.themeManager.init();
        await this.modules.sessionManager.init();
    }

    /**
     * Initialize UI and business logic managers
     */
    initializeManagers() {
        // LLM Provider manager
        this.modules.llmProviderManager = new LLMProviderManager(
            this.modules.apiService
        );

        // UI manager - initializes its own listeners
        this.modules.uiManager = new UIManager(this.modules.i18n);

        // Connection monitoring
        this.modules.connectionMonitor = new ConnectionMonitor(
            this.modules.apiService,
            this.modules.uiManager,
            this.modules.i18n
        );

        // Security panel
        this.modules.securityDevPanel = new SecurityDevPanel(this.modules.i18n);

        // Phase management - initializes its own listeners
        this.modules.phaseManager = new PhaseManager(this.modules.i18n);

        // Chat operations - initializes its own listeners
        this.modules.chatHandler = new ChatHandler(
            this.modules.apiService,
            this.modules.uiManager,
            this.modules.i18n
        );

        // Start monitoring
        this.modules.connectionMonitor.start();

        // Update UI with i18n
        this.modules.i18n.updateUI();

        // Render initial phase
        const currentPhase = this.modules.phaseManager.getCurrentPhase();
        this.modules.phaseManager.switchPhase(currentPhase, true);
    }

    /**
     * Wire up dependencies between modules
     */
    wireupDependencies() {
        // Session manager dependencies
        this.modules.sessionManager.setUIManager(this.modules.uiManager);
        this.modules.sessionManager.setI18nService(this.modules.i18n);
    }

    /**
     * Handle initialization errors
     */
    handleInitError(error) {
        const errorMsg = this.modules.i18n?.t('errors.initError')
            || 'Failed to initialize the application';
        this.modules.uiManager?.showError(errorMsg);
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
     * Cleanup resources when app is destroyed
     */
    destroy() {
        if (this.modules.connectionMonitor) {
            this.modules.connectionMonitor.stop();
        }
        console.log('✅ ChatBot app cleaned up');
    }

    /**
     * Get a module (for testing or external access)
     */
    getModule(name) {
        return this.modules[name];
    }
}

// Export for module usage
export { ChatBotApp };