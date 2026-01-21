/**
 * Connection Monitor for handling backend connectivity
 */
import { CONFIG } from './config.js';

export class ConnectionMonitor {
    constructor(apiService, i18n) {
        this.apiService = apiService;
        this.i18n = i18n;
        this.connectionCheckInterval = null;
        this.wasOnline = true;
        this.wasDegraded = false;
        this.lastHealthData = null;
        this.isOnline = false;
        this.boundHandlers = {};
    }

    /**
     * Initialize connection monitor - called from constructor
     */
    init() {
        this.attachListeners();
        console.log('ConnectionMonitor initialized');
    }

    /**
     * Attach event listeners for connection monitoring
     */
    attachListeners() {
        // Store bound handlers for proper cleanup
        this.boundHandlers.apiTimeout = this.onApiTimeout.bind(this);
        
        // Listen for timeout events from api-service
        window.addEventListener('apiTimeout', this.boundHandlers.apiTimeout);
    }

    /**
     * Handle timeout events from api-service
     */
    onApiTimeout(event) {
        console.warn('API timeout detected:', event.detail);
        this.dispatchNotificationEvent(
            this.i18n.t('errors.agentTimeout'),
            'warning'
        );
    }

    /**
     * Start monitoring backend connection
     */
    start() {
        this.connectionCheckInterval = setInterval(() => {
            this.checkConnection();
        }, CONFIG.HEARTBEAT_INTERVAL);
        
        // Initial check
        this.checkConnection();
    }

    /**
     * Stop connection monitoring
     */
    stop() {
        if (this.connectionCheckInterval) {
            clearInterval(this.connectionCheckInterval);
            this.connectionCheckInterval = null;
        }
        
        // Properly clean up event listeners using stored references
        window.removeEventListener('apiTimeout', this.boundHandlers.apiTimeout);
        
        this.boundHandlers = {};
        console.log('ConnectionMonitor stopped');
    }

    /**
     * Check backend connection and update UI
     */
    async checkConnection() {
        const isOnline = await this.fetchHealthStatus();
        const healthData = this.lastHealthData;
        
        // Check if degraded state changed (MCP unavailable while service is running)
        const isDegraded = isOnline && healthData && healthData.status === 'degraded' && !healthData.serviceAvailable;
        
        // Update UI if online status changed OR degradation status changed
        if (this.wasOnline !== isOnline || this.wasDegraded !== isDegraded) {
            this.dispatchConnectionStatusEvent(isOnline, healthData);
            if (this.wasOnline !== isOnline) {
                this.showConnectionStatusNotification(isOnline, healthData);
            }
            this.wasOnline = isOnline;
            this.wasDegraded = isDegraded;
        }
        
        return isOnline;
    }

    /**
     * Fetch health status from backend using api-service generic call
     * @return {Promise<boolean>}
     */
    async fetchHealthStatus() {
        try {
            const healthData = await this.apiService.get('/health');
            
            console.log('Health check response:', healthData);
            this.lastHealthData = healthData;
            
            const isBasicallyOnline = healthData.status === 'ok' || healthData.status === 'degraded';
            
            if (healthData.status === 'degraded' && !healthData.serviceAvailable) {
                console.warn('MCP services are unavailable:', healthData.message);
            }
            
            return isBasicallyOnline;
        } catch (error) {
            this.handleConnectionError(error);
            return false;
        }
    }

    /**
     * Handle connection check errors
     */
    handleConnectionError(error) {
        if (error.name === 'AbortError' || error.message.includes('timeout')) {
            console.warn('Health check timeout:', error.message);
            // Dispatch timeout event to notify UI
            const timeoutEvent = new CustomEvent('connectionCheckTimeout', {
                detail: { error: error.message }
            });
            window.dispatchEvent(timeoutEvent);
        } else if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
            console.warn('Backend appears to be offline:', error.message);
        } else if (error.message.includes('NetworkError') || error.message.includes('CORS')) {
            console.warn('Network error:', error.message);
        } else {
            console.warn('Backend connection check failed:', error.message);
        }
    }

    /**
     * Show connection status change notification
     * Builds the appropriate message based on health data and displays it
     */
    showConnectionStatusNotification(isOnline, healthData = null) {
        let message;
        let type;

        if (isOnline) {
            // Check if services are degraded
            if (healthData && healthData.status === 'degraded' && !healthData.serviceAvailable) {
                message = this.i18n.t('errors.servicesDegraded');
                type = 'warning';
            } else {
                message = this.i18n.t('chat.connectionRestored');
                type = 'success';
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
            type = 'error';
        }

        this.dispatchNotificationEvent(message, type);
    }

    /**
     * Dispatch a notification event for UIManager to handle
     */
    dispatchNotificationEvent(message, type) {
        window.dispatchEvent(new CustomEvent('appNotification', {
            detail: { message, type }
        }));
    }

    /**
     * Dispatch connection status changed event for UIManager to handle
     * Computes all status details so listeners only need to apply them
     */
    dispatchConnectionStatusEvent(isOnline, healthData) {
        const statusDetails = this.computeConnectionStatusDetails(isOnline, healthData);
        window.dispatchEvent(new CustomEvent('connectionChanged', {
            detail: statusDetails
        }));
    }

    /**
     * Compute connection status details for UI display
     * @param {boolean} isOnline - Whether the backend is reachable
     * @param {Object} healthData - Health check response data
     * @returns {Object} Status details for UI rendering
     */
    computeConnectionStatusDetails(isOnline, healthData) {
        let statusClass = 'status--error';
        let statusIcon = 'warning';
        let statusText = this.i18n.t('chat.offline');
        let placeholder = this.i18n.t('chat.placeholderOffline');
        let isDegraded = false;

        if (isOnline) {
            if (healthData && healthData.status === 'degraded' && !healthData.serviceAvailable) {
                // Service degraded - MCP unavailable but basic functionality works
                statusClass = 'status--warning';
                statusIcon = 'warning';
                statusText = this.i18n.t('chat.online') + ' (Limited)';
                placeholder = this.i18n.t('errors.mcpUnavailable');
                isDegraded = true;
            } else {
                // Fully operational
                statusClass = 'status--success';
                statusIcon = 'check_circle';
                statusText = this.i18n.t('chat.online');
                placeholder = this.i18n.t('chat.placeholder');
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

    /**
     * Get current connection status
     */
    getConnectionStatus() {
        return this.isOnline;
    }

    /**
     * Get last health check data
     */
    getLastHealthData() {
        return this.lastHealthData;
    }

    /**
     * Force check connection status
     */
    async forceCheck() {
        return await this.checkConnection();
    }
}
