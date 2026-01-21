/**
 * ChatBot Application - Pure Orchestrator Pattern
 * 
 * @fileoverview Main application entry point implementing a pure orchestrator pattern.
 * This module is responsible ONLY for bootstrapping and wiring up all application modules.
 * It contains NO business logic - all functionality is delegated to specialized service modules.
 * 
 * @architecture The app follows Dependency Injection (DI) principles with a declarative
 * service registry. Services are instantiated in order, allowing later services to depend
 * on earlier ones. This enables loose coupling and easy testing via module mocking.
 * 
 * @version 1.0.0
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
 * Service Registry - Declarative Dependency Injection Configuration
 * 
 * @description Centralized configuration for all application services. This registry
 * defines the instantiation order and dependency graph for all modules.
 * 
 * @important ORDER MATTERS - Services are instantiated sequentially, so dependencies
 * must be declared AFTER their dependents in this array. Circular dependencies are
 * not supported and will cause runtime errors.
 * 
 * @structure Each entry contains:
 *   - name: string - Unique identifier used to store/retrieve the service instance
 *   - class: Constructor - The service class to instantiate
 *   - deps: function(modules) => array - Optional factory function that receives all
 *     previously instantiated modules and returns constructor arguments
 * 
 * @example Adding a new service:
 *   { name: 'myService', class: MyService, deps: (m) => [m.apiService, m.i18n] }
 * 
 * @type {Array<{name: string, class: Function, deps?: Function}>}* 
 * @property {ApiService} apiService - HTTP client for backend communication
 * @property {PhaseManager} phaseManager - Application phase/state controller
 * @property {I18nService} i18n - Internationalization service
 * @property {ThemeManager} themeManager - UI theme controller
 * @property {LLMProviderManager} llmProviderManager - LLM provider configuration
 * @property {SecurityDevPanel} securityDevPanel - Developer security tools
 * @property {UIManager} uiManager - DOM manipulation and UI state
 * @property {SessionManager} sessionManager - User session handling
 * @property {ChatHandler} chatHandler - Chat message processing
 * @property {ConnectionMonitor} connectionMonitor - Backend connectivity monitoring
 */
const SERVICE_REGISTRY = [
    { name: 'apiService', class: ApiService },
    { name: 'phaseManager', class: PhaseManager },
    { name: 'i18n', class: I18nService, deps: (m) => [m.apiService] },
    { name: 'themeManager', class: ThemeManager, deps: (m) => [m.i18n] },
    { name: 'llmProviderManager', class: LLMProviderManager, deps: (m) => [m.apiService] },
    { name: 'securityDevPanel', class: SecurityDevPanel, deps: (m) => [m.i18n] },
    { name: 'uiManager', class: UIManager, deps: (m) => [m.i18n] },
    { name: 'sessionManager', class: SessionManager, deps: (m) => [m.apiService, m.i18n] },
    { name: 'chatHandler', class: ChatHandler, deps: (m) => [m.apiService, m.uiManager, m.i18n] },
    { name: 'connectionMonitor', class: ConnectionMonitor, deps: (m) => [m.apiService, m.i18n] },
];

/**
 * ChatBotApp - Main Application Controller
 * 
 * @class ChatBotApp
 * @description Core application class that orchestrates the entire chatbot lifecycle.
 * Implements the Composition Root pattern - this is the ONLY place where services
 * are wired together. All other modules remain decoupled and testable in isolation.
 * 
 * @responsibilities
 *   - Service instantiation and dependency injection
 *   - Application lifecycle management (init/destroy)
 *   - Loading state UI coordination
 *   - Module access for external integrations
 * 
 * @pattern Singleton (typically instantiated once in index.html or entry point)
 * 
 * @example
 *   const app = new ChatBotApp();
 *   await app.init();
 *   // Later, for cleanup:
 *   app.destroy();
 */
class ChatBotApp {
    /**
     * Service Modules Container
     * 
     * @type {Object.<string, Object>}
     * @description Registry of all instantiated service modules keyed by their name.
     * Populated during createServices() and accessed throughout the application lifecycle.
     */
    modules = {};

    /**
     * Initialize the Application
     * 
     * @async
     * @method init
     * @description Main entry point for application startup. Orchestrates the complete
     * initialization sequence: shows loading UI, creates services, initializes them,
     * and finally sets up default language and phase state.
     * 
     * @returns {Promise<void>} Resolves when initialization completes (success or failure)
     * 
     * @throws {Error} Catches and logs all errors - does NOT propagate exceptions
     * to prevent unhandled promise rejections from breaking the app
     * 
     * @sideEffects
     *   - Populates this.modules with service instances
     *   - Manipulates DOM loading indicator
     *   - Logs to console
     * 
     * @example
     *   const app = new ChatBotApp();
     *   await app.init(); // Safe to call - errors are handled internally
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
        }
    }

    /**
     * Create All Services from Registry
     * 
     * @method createServices
     * @private
     * @description Iterates through SERVICE_REGISTRY and instantiates each service
     * class with its resolved dependencies. Uses the factory pattern via the deps
     * function to support flexible dependency injection.
     * 
     * @algorithm
     *   1. Iterate SERVICE_REGISTRY in order
     *   2. For each service, resolve dependencies using deps(this.modules)
     *   3. Instantiate service class with spread dependencies
     *   4. Store instance in this.modules[service.name]
     * 
     * @note This is a synchronous operation - services are constructed but NOT
     * initialized. Async initialization happens in initializeServices().
     * 
     * @throws {Error} If a dependency is undefined (service order misconfigured)
     */
    createServices() {
        for (const service of SERVICE_REGISTRY) {
            const deps = service.deps ? service.deps(this.modules) : [];
            this.modules[service.name] = new service.class(...deps);
        }
    }

    /**
     * Initialize All Services with Async Support
     * 
     * @async
     * @method initializeServices
     * @private
     * @description Calls the init() method on each service that implements it.
     * Services are initialized sequentially (not parallel) to ensure proper
     * initialization order for interdependent services.
     * 
     * @returns {Promise<void>} Resolves when all services are initialized
     * 
     * @postConditions
     *   - All services with init() methods have been initialized
     *   - i18n language is set to current/default language
     *   - PhaseManager is switched to current/default phase
     * 
     * @note The explicit language and phase initialization at the end ensures
     * the UI is in a consistent state even if defaults were already set.
     */
    async initializeServices() {
        for (const service of SERVICE_REGISTRY) {
            const module = this.modules[service.name];
            if (typeof module.init === 'function') {
                await module.init();
            }
        }
        await this.modules.i18n.changeLanguage(this.modules.i18n.currentLanguage, true);
        await this.modules.phaseManager.switchPhase(this.modules.phaseManager.currentPhase, true);
    }

    /**
     * Toggle Loading Indicator Visibility
     * 
     * @method showLoading
     * @private
     * @description Controls the visibility of the application loading overlay.
     * Uses CSS class toggling for show/hide animation support.
     * 
     * @param {boolean} show - true to show loading indicator, false to hide
     * 
     * @note Gracefully handles missing loading indicator element (no-op if not found).
     * This allows the app to function in environments without the loading UI.
     * 
     * @domElement Expects element with id="loading-indicator" in the DOM
     * @cssClass Toggles the 'show' class for visibility control
     */
    showLoading(show) {
        const loadingEl = document.getElementById('loading-indicator');
        if (loadingEl) {
            loadingEl.classList.toggle('show', show);
        }
    }

    /**
     * Destroy Application and Release Resources
     * 
     * @method destroy
     * @description Graceful shutdown handler that cleans up all services in REVERSE
     * order of creation. This ensures dependencies are destroyed before their dependents,
     * preventing use-after-free style bugs.
     * 
     * @cleanup Each service is checked for:
     *   1. destroy() method - preferred cleanup method
     *   2. stop() method - fallback for services using different naming convention
     * 
     * @note Uses optional chaining (?.) for safety - handles undefined modules gracefully
     * 
     * @useCase Call this method before:
     *   - Page unload/navigation
     *   - Hot module replacement (HMR)
     *   - Application restart
     *   - Memory leak prevention in SPAs
     * 
     * @example
     *   window.addEventListener('beforeunload', () => app.destroy());
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
}

// Export for module usage
export { ChatBotApp };