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

/**
 * Service registry - declarative configuration for all modules
 * Order matters: services are created and initialized in array order
 * Dependencies are resolved via the deps function which receives the modules object
 */
const SERVICE_REGISTRY = [
    { name: 'apiService', class: ApiService },
    { name: 'i18n', class: I18nService, deps: (m) => [m.apiService] },
    { name: 'themeManager', class: ThemeManager, deps: (m) => [m.i18n] },
    { name: 'phaseManager', class: PhaseManager },
    { name: 'llmProviderManager', class: LLMProviderManager, deps: (m) => [m.apiService] },
    { name: 'uiManager', class: UIManager, deps: (m) => [m.i18n] },
    { name: 'securityDevPanel', class: SecurityDevPanel, deps: (m) => [m.i18n] },
    { name: 'sessionManager', class: SessionManager, deps: (m) => [m.apiService, m.uiManager, m.i18n] },
    { name: 'chatHandler', class: ChatHandler, deps: (m) => [m.apiService, m.uiManager, m.i18n] },
    { name: 'connectionMonitor', class: ConnectionMonitor, deps: (m) => [m.apiService, m.uiManager, m.i18n] },
];

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

            this.createServices();
            await this.initializeServices();

            this.showLoading(false);
            console.log('[app] ChatBot app initialized successfully');
        } catch (error) {
            this.showLoading(false);
            console.error('[app] Failed to initialize ChatBot app:', error);
            this.handleInitError(error);
        }
    }

    /**
     * Create all services from registry
     */
    createServices() {
        for (const service of SERVICE_REGISTRY) {
            const deps = service.deps ? service.deps(this.modules) : [];
            this.modules[service.name] = new service.class(...deps);
        }
    }

    /**
     * Initialize all services that have an init method
     */
    async initializeServices() {
        for (const service of SERVICE_REGISTRY) {
            const module = this.modules[service.name];
            if (typeof module.init === 'function') {
                await module.init();
            }
        }

        // Post-init: Update UI with i18n
        this.modules.i18n.updateUI();
        await this.modules.i18n.changeLanguage(this.modules.i18n.currentLanguage, true);
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
        // Call destroy on modules that support it (in reverse order)
        for (const service of [...SERVICE_REGISTRY].reverse()) {
            const module = this.modules[service.name];
            if (typeof module?.destroy === 'function') {
                module.destroy();
            } else if (typeof module?.stop === 'function') {
                module.stop();
            }
        }
        console.log('[app] ChatBot app cleaned up');
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