/**
 * @fileoverview Connection Monitor Module
 * Handles backend connectivity monitoring and status updates.
 *
 * @responsibilities
 * - Monitor backend health via periodic health checks
 * - Detect connection state changes (online, offline, degraded)
 * - Dispatch connection status events for UI updates
 * - Handle API timeout events
 *
 * @dependencies
 * - config.js: Configuration constants (HEARTBEAT_INTERVAL)
 * - apiService: HTTP client for health endpoint requests
 * - i18n: Internationalization service for status messages
 *
 * @events
 * - Listens: 'apiTimeout' - API request timeout notifications
 * - Dispatches: 'connectionChanged' - Connection status updates
 * - Dispatches: 'appNotification' - User-facing notifications
 * - Dispatches: 'connectionCheckTimeout' - Health check timeout events
 *
 * @version 1.0.0
 */

import { CONFIG } from './config.js';

// ═══════════════════════════════════════════════════════════════════════════
// CLASS DEFINITION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @class ConnectionMonitor
 * @description Monitors backend connectivity and dispatches status change events.
 * Performs periodic health checks and handles connection state transitions.
 * @pattern Observer - Dispatches events for connection state changes
 * @example
 * const monitor = new ConnectionMonitor(apiService, i18n);
 * await monitor.init();
 * monitor.start();
 */
class ConnectionMonitor {
    // ═══════════════════════════════════════════════════════════════════════════
    // PRIVATE INSTANCE PROPERTIES
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @type {Object}
     * @private
     */
    #apiService;

    /**
     * @type {Object}
     * @private
     */
    #i18n;

    /**
     * @type {number|null}
     * @private
     */
    #connectionCheckInterval;

    /**
     * @type {boolean}
     * @private
     */
    #wasOnline;

    /**
     * @type {boolean}
     * @private
     */
    #wasDegraded;

    /**
     * @type {Object|null}
     * @private
     */
    #lastHealthData;

    /**
     * @type {boolean}
     * @private
     */
    #isOnline;

    /**
     * @type {Object}
     * @private
     */
    #boundHandlers;

    /**
     * @type {Object}
     * @private
     */
    #elements;

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Creates a new ConnectionMonitor instance.
     * @param {Object} apiService - The API service for HTTP requests
     * @param {Object} i18n - The internationalization service
     */
    constructor(apiService, i18n) {
        this.#apiService = apiService;
        this.#i18n = i18n;
        this.#connectionCheckInterval = null;
        this.#wasOnline = true;
        this.#wasDegraded = false;
        this.#lastHealthData = null;
        this.#isOnline = false;
        this.#boundHandlers = {};
        this.#elements = {};
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // LIFECYCLE METHODS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Initializes the connection monitor.
     * Caches DOM elements, binds event handlers, attaches listeners, and starts monitoring.
     * @returns {void}
     */
    init() {
        this.#cacheElements();
        this.#bindEventHandlers();
        this.#attachListeners();
        this.start();
        console.log('[ConnectionMonitor] Initialized');
    }

    /**
     * Cache DOM elements for status indicator.
     * @private
     * @returns {void}
     */
    #cacheElements() {
        this.#elements = {
            statusIndicator: document.getElementById('statusIndicator'),
            statusIcon: document.getElementById('statusIcon'),
            statusText: document.getElementById('statusText')
        };
    }

    /**
     * Destroys the connection monitor and releases all resources.
     * Stops monitoring, removes event listeners, and clears cached data.
     * @returns {void}
     */
    destroy() {
        this.stop();
        this.#detachListeners();
        this.#boundHandlers = {};
        this.#lastHealthData = null;
        console.log('[ConnectionMonitor] Destroyed');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PUBLIC API METHODS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Starts monitoring the backend connection.
     * Initiates periodic health checks at the configured interval.
     * @returns {void}
     */
    start() {
        this.#connectionCheckInterval = setInterval(() => {
            this.#checkConnection();
        }, CONFIG.HEARTBEAT_INTERVAL);

        this.#checkConnection();
    }

    /**
     * Stops the connection monitoring.
     * Clears the health check interval.
     * @returns {void}
     */
    stop() {
        if (this.#connectionCheckInterval) {
            clearInterval(this.#connectionCheckInterval);
            this.#connectionCheckInterval = null;
        }
        console.log('[ConnectionMonitor] Stopped');
    }

    /**
     * Gets the current connection status.
     * @returns {boolean} True if currently online
     */
    getConnectionStatus() {
        return this.#isOnline;
    }

    /**
     * Gets the last health check data.
     * @returns {Object|null} The last health check response data
     */
    getLastHealthData() {
        return this.#lastHealthData;
    }

    /**
     * Forces an immediate connection check.
     * @async
     * @returns {Promise<boolean>} True if the connection is online
     */
    async forceCheck() {
        return await this.#checkConnection();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENT HANDLERS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Handles API timeout events from the api-service.
     * @param {CustomEvent} event - The timeout event with error details
     * @private
     * @returns {void}
     */
    #onApiTimeout(event) {
        console.warn('[ConnectionMonitor] API timeout detected:', event.detail);
        this.#dispatchNotificationEvent(
            this.#i18n.t('errors.agentTimeout'),
            'warning'
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENT LISTENER MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Binds event handler methods to preserve context.
     * @private
     * @returns {void}
     */
    #bindEventHandlers() {
        this.#boundHandlers = {
            apiTimeout: this.#onApiTimeout.bind(this),
        };
    }

    /**
     * Attaches event listeners to the window.
     * @private
     * @returns {void}
     */
    #attachListeners() {
        window.addEventListener('apiTimeout', this.#boundHandlers.apiTimeout);
    }

    /**
     * Detaches event listeners from the window.
     * @private
     * @returns {void}
     */
    #detachListeners() {
        window.removeEventListener('apiTimeout', this.#boundHandlers.apiTimeout);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PRIVATE HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Checks the backend connection and updates UI if status changed.
     * @async
     * @private
     * @returns {Promise<boolean>} True if the connection is online
     */
    async #checkConnection() {
        const isOnline = await this.#fetchHealthStatus();
        const healthData = this.#lastHealthData;

        const isDegraded = isOnline &&
            healthData &&
            healthData.status === 'degraded' &&
            !healthData.serviceAvailable;

        if (this.#wasOnline !== isOnline || this.#wasDegraded !== isDegraded) {
            this.#dispatchConnectionStatusEvent(isOnline, healthData);
            if (this.#wasOnline !== isOnline) {
                this.#showConnectionStatusNotification(isOnline, healthData);
            }
            this.#wasOnline = isOnline;
            this.#wasDegraded = isDegraded;
        }

        return isOnline;
    }

    /**
     * Fetches health status from the backend.
     * @async
     * @private
     * @returns {Promise<boolean>} True if the backend is basically online
     */
    async #fetchHealthStatus() {
        try {
            const healthData = await this.#apiService.get('/health');

            console.debug('[ConnectionMonitor] Health check response:', healthData);
            this.#lastHealthData = healthData;

            const isBasicallyOnline = healthData.status === 'ok' || healthData.status === 'degraded';

            if (healthData.status === 'degraded' && !healthData.serviceAvailable) {
                console.warn('[ConnectionMonitor] MCP services are unavailable:', healthData.message);
            }

            return isBasicallyOnline;
        } catch (error) {
            this.#handleConnectionError(error);
            return false;
        }
    }

    /**
     * Handles connection check errors with appropriate logging.
     * @param {Error} error - The error that occurred during connection check
     * @private
     * @returns {void}
     */
    #handleConnectionError(error) {
        if (error.name === 'AbortError' || error.message.includes('timeout')) {
            console.warn('[ConnectionMonitor] Health check timeout:', error.message);
            const timeoutEvent = new CustomEvent('connectionCheckTimeout', {
                detail: { error: error.message }
            });
            window.dispatchEvent(timeoutEvent);
        } else if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
            console.warn('[ConnectionMonitor] Backend appears to be offline:', error.message);
        } else if (error.message.includes('NetworkError') || error.message.includes('CORS')) {
            console.warn('[ConnectionMonitor] Network error:', error.message);
        } else {
            console.warn('[ConnectionMonitor] Backend connection check failed:', error.message);
        }
    }

    /**
     * Shows a notification for connection status changes.
     * @param {boolean} isOnline - Whether the connection is online
     * @param {Object|null} healthData - The health check response data
     * @private
     * @returns {void}
     */
    #showConnectionStatusNotification(isOnline, healthData = null) {
        let message;
        let type;

        if (isOnline) {
            if (healthData && healthData.status === 'degraded' && !healthData.serviceAvailable) {
                message = this.#i18n.t('errors.servicesDegraded');
                type = 'warning';
            } else {
                message = this.#i18n.t('chat.connectionRestored');
                type = 'success';
            }
        } else {
            if (healthData && healthData.message) {
                message = healthData.message;
            } else if (healthData && healthData.unhealthyServers && healthData.unhealthyServers.length > 0) {
                const serverList = healthData.unhealthyServers.join(', ');
                message = this.#i18n.t('chat.ollamaServersDown').replace('{servers}', serverList);
            } else {
                message = this.#i18n.t('chat.connectionLost');
            }
            type = 'error';
        }

        this.#dispatchNotificationEvent(message, type);
    }

    /**
     * Dispatches a notification event for UI display.
     * @param {string} message - The notification message
     * @param {string} type - The notification type (success, warning, error)
     * @private
     * @returns {void}
     */
    #dispatchNotificationEvent(message, type) {
        window.dispatchEvent(new CustomEvent('appNotification', {
            detail: { message, type }
        }));
    }

    /**
     * Dispatches a connection status changed event.
     * @param {boolean} isOnline - Whether the connection is online
     * @param {Object} healthData - The health check response data
     * @private
     * @returns {void}
     */
    #dispatchConnectionStatusEvent(isOnline, healthData) {
        const statusDetails = this.#computeConnectionStatusDetails(isOnline, healthData);
        
        // Update status indicator UI directly
        this.#updateStatusIndicatorUI(statusDetails);
        
        // Dispatch event for other modules (e.g., chat availability)
        window.dispatchEvent(new CustomEvent('connectionChanged', {
            detail: statusDetails
        }));
    }

    /**
     * Updates the status indicator UI elements.
     * @param {Object} statusDetails - The computed status details
     * @private
     * @returns {void}
     */
    #updateStatusIndicatorUI(statusDetails) {
        const { statusClass, statusIcon, statusText } = statusDetails;

        if (this.#elements.statusIndicator) {
            this.#elements.statusIndicator.className = `status ${statusClass}`;
        }

        if (this.#elements.statusIcon) {
            this.#elements.statusIcon.textContent = statusIcon;
        }

        if (this.#elements.statusText) {
            this.#elements.statusText.textContent = statusText;
        }
    }

    /**
     * Computes connection status details for UI display.
     * @param {boolean} isOnline - Whether the backend is reachable
     * @param {Object} healthData - Health check response data
     * @private
     * @returns {Object} Status details for UI rendering
     */
    #computeConnectionStatusDetails(isOnline, healthData) {
        let statusClass = 'status--error';
        let statusIcon = 'warning';
        let statusText = this.#i18n.t('chat.offline');
        let placeholder = this.#i18n.t('chat.placeholderOffline');
        let isDegraded = false;

        if (isOnline) {
            if (healthData && healthData.status === 'degraded' && !healthData.serviceAvailable) {
                statusClass = 'status--warning';
                statusIcon = 'warning';
                statusText = this.#i18n.t('chat.online') + ' (Limited)';
                placeholder = this.#i18n.t('errors.mcpUnavailable');
                isDegraded = true;
            } else {
                statusClass = 'status--success';
                statusIcon = 'check_circle';
                statusText = this.#i18n.t('chat.online');
                placeholder = this.#i18n.t('chat.placeholder');
            }
        }

        return {
            isOnline,
            isDegraded,
            statusClass,
            statusIcon,
            statusText,
            placeholder,
            healthData
        };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export { ConnectionMonitor };
