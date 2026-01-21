/**
 * @fileoverview Session Manager - Handles session lifecycle and server communication
 * @responsibilities
 * - Generate and manage unique session identifiers
 * - Handle page lifecycle events (load, unload)
 * - Manage logout functionality and session cleanup
 * - Synchronize client and server session state
 * @dependencies
 * - apiService: API communication service for backend calls
 * - i18n: Internationalization service for translated messages
 * @events
 * - Listens: beforeunload (window)
 * - Dispatches: appNotification (for logout success/error messages)
 * @version 1.0.0
 */

// ═══════════════════════════════════════════════════════════════════════════
// MODULE CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/** @type {string} Session storage key for session ID */
const SESSION_STORAGE_KEY = 'chatbot-session-id';

/** @type {number} Delay in milliseconds before completing logout */
const LOGOUT_COMPLETE_DELAY = 1000;

// ═══════════════════════════════════════════════════════════════════════════
// CLASS DEFINITION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @class SessionManager
 * @description Manages user session lifecycle including initialization, persistence,
 * and cleanup. Coordinates between client-side session storage and server-side
 * session state.
 * @pattern Singleton-like (one instance per application)
 * @example
 * const sessionManager = new SessionManager(apiService, i18n);
 * await sessionManager.init();
 */
class SessionManager {
    // ═══════════════════════════════════════════════════════════════════════
    // PRIVATE INSTANCE PROPERTIES
    // ═══════════════════════════════════════════════════════════════════════

    /** @type {Object} API service for backend communication @private */
    #apiService;

    /** @type {Object} Internationalization service @private */
    #i18n;

    /** @type {string} Current session identifier @private */
    #sessionId;

    /** @type {Object} Cached DOM element references @private */
    #elements;

    /** @type {Object} Bound event handler references for cleanup @private */
    #boundHandlers;

    // ═══════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Creates a new SessionManager instance
     * @param {Object} apiService - API service for backend communication
     * @param {Object} i18n - Internationalization service for translations
     */
    constructor(apiService, i18n) {
        this.#apiService = apiService;
        this.#i18n = i18n;
        this.#sessionId = this.#generateSessionId();
        this.#elements = {};
        this.#boundHandlers = {};
    }

    // ═══════════════════════════════════════════════════════════════════════
    // LIFECYCLE METHODS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Initialize session manager and setup lifecycle events
     * @async
     * @returns {Promise<void>}
     */
    async init() {
        if (!this.#getStoredSessionId()) {
            this.#storeSessionId();
            await this.#clearSession();
            console.log('[SessionManager] Fresh page load detected, cleared server-side session');
        }

        this.#cacheElements();
        this.#bindEventHandlers();
        this.#attachListeners();

        console.log('[SessionManager] Initialized');
    }

    /**
     * Cleanup session manager resources and remove event listeners
     * @returns {void}
     */
    destroy() {
        this.#detachListeners();
        this.#elements = {};
        this.#boundHandlers = {};

        console.log('[SessionManager] Destroyed');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EVENT HANDLERS (PRIVATE)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Handle beforeunload event to clear session ID
     * @private
     * @returns {void}
     */
    #onBeforeUnload() {
        this.#clearStoredSessionId();
    }

    /**
     * Handle logout button click event
     * @async
     * @private
     * @param {Event} event - Click event
     * @returns {Promise<void>}
     */
    async #onLogoutClick(event) {
        event.preventDefault();
        console.log('[SessionManager] Logout initiated');

        try {
            await this.#logout();

            const successMsg = this.#i18n?.t('userMenu.logoutSuccess') || 'Logged out successfully';
            window.dispatchEvent(new CustomEvent('appNotification', {
                detail: { message: successMsg, type: 'success' }
            }));

            setTimeout(() => {
                console.log('[SessionManager] Logout complete');
            }, LOGOUT_COMPLETE_DELAY);
        } catch (error) {
            console.error('[SessionManager] Error during logout:', error);
            const errorMsg = this.#i18n?.t('userMenu.logoutError') || 'Failed to logout';
            window.dispatchEvent(new CustomEvent('appNotification', {
                detail: { message: errorMsg, type: 'error' }
            }));
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DOM OPERATIONS (PRIVATE)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Cache DOM element references
     * @private
     * @returns {void}
     */
    #cacheElements() {
        this.#elements = {
            logoutButton: document.getElementById('userMenuLogout'),
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EVENT LISTENER MANAGEMENT (PRIVATE)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Bind event handlers to preserve context for cleanup
     * @private
     * @returns {void}
     */
    #bindEventHandlers() {
        this.#boundHandlers = {
            beforeUnload: this.#onBeforeUnload.bind(this),
            logoutClick: this.#onLogoutClick.bind(this),
        };
    }

    /**
     * Attach all event listeners
     * @private
     * @returns {void}
     */
    #attachListeners() {
        window.addEventListener('beforeunload', this.#boundHandlers.beforeUnload);
        this.#elements.logoutButton?.addEventListener('click', this.#boundHandlers.logoutClick);
    }

    /**
     * Detach all event listeners for cleanup
     * @private
     * @returns {void}
     */
    #detachListeners() {
        window.removeEventListener('beforeunload', this.#boundHandlers.beforeUnload);
        this.#elements.logoutButton?.removeEventListener('click', this.#boundHandlers.logoutClick);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PRIVATE HELPERS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Generate a unique session ID
     * @private
     * @returns {string} A unique session identifier
     */
    #generateSessionId() {
        return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Clear session on the backend
     * @async
     * @private
     * @returns {Promise<Object>} Response from the server
     * @throws {Error} If the API call fails
     */
    async #clearSession() {
        try {
            const response = await this.#apiService.post('/api/clear-session', {});
            console.log('[SessionManager] Session cleared successfully');
            return response;
        } catch (error) {
            console.error('[SessionManager] Failed to clear session:', error);
            throw error;
        }
    }

    /**
     * Logout user - clears both client and server session
     * @async
     * @private
     * @returns {Promise<boolean>} True if logout was successful
     * @throws {Error} If logout fails
     */
    async #logout() {
        try {
            this.#clearStoredSessionId();
            await this.#clearSession();

            console.log('[SessionManager] User logged out and session cleared');
            return true;
        } catch (error) {
            console.error('[SessionManager] Error during logout:', error);
            throw error;
        }
    }

    /**
     * Store session ID in sessionStorage
     * @private
     * @returns {void}
     */
    #storeSessionId() {
        try {
            sessionStorage.setItem(SESSION_STORAGE_KEY, this.#sessionId);
        } catch (error) {
            console.warn('[SessionManager] Failed to store session ID:', error);
        }
    }

    /**
     * Retrieve stored session ID from sessionStorage
     * @private
     * @returns {string|null} The stored session ID or null if not found
     */
    #getStoredSessionId() {
        try {
            return sessionStorage.getItem(SESSION_STORAGE_KEY);
        } catch (error) {
            console.warn('[SessionManager] Failed to retrieve session ID:', error);
            return null;
        }
    }

    /**
     * Clear stored session ID from sessionStorage
     * @private
     * @returns {void}
     */
    #clearStoredSessionId() {
        try {
            sessionStorage.removeItem(SESSION_STORAGE_KEY);
        } catch (error) {
            console.warn('[SessionManager] Failed to clear stored session ID:', error);
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export { SessionManager };
