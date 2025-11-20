/**
 * Connection Monitor for handling backend connectivity
 */
import { CONFIG } from './config.js';

export class ConnectionMonitor {
    constructor(apiService, uiManager, i18n) {
        this.apiService = apiService;
        this.uiManager = uiManager;
        this.i18n = i18n;
        this.connectionCheckInterval = null;
        this.wasOnline = true;
        this.wasDegraded = false;
        this.lastHealthData = null;
        this.isOnline = false;
        this.boundHandlers = {};
        this.isInitialized = false;
        
        this.init();
    }

    /**
     * Initialize connection monitor - called from constructor
     */
    init() {
        if (this.isInitialized) return;
        this.attachListeners();
        this.isInitialized = true;
        console.log('✅ ConnectionMonitor initialized');
    }

    /**
     * Attach event listeners for connection monitoring
     */
    attachListeners() {
        // Store bound handlers for proper cleanup
        this.boundHandlers.languageChanged = this.onLanguageChanged.bind(this);
        this.boundHandlers.apiTimeout = this.onApiTimeout.bind(this);

        // Listen for language changes
        window.addEventListener('languageChanged', this.boundHandlers.languageChanged);
        
        // Listen for timeout events from api-service
        window.addEventListener('apiTimeout', this.boundHandlers.apiTimeout);
    }

    /**
     * Handle language change event
     */
    onLanguageChanged(event) {
        const { language } = event.detail;
        this.currentLanguage = language;
        console.log('Connection monitor language updated to:', language);
    }

    /**
     * Handle timeout events from api-service
     */
    onApiTimeout(event) {
        console.warn('API timeout detected:', event.detail);
        this.uiManager.showNotification(
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
        window.removeEventListener('languageChanged', this.boundHandlers.languageChanged);
        window.removeEventListener('apiTimeout', this.boundHandlers.apiTimeout);
        
        this.boundHandlers = {};
        this.isInitialized = false;
        console.log('✅ ConnectionMonitor stopped');
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
            this.uiManager.updateConnectionStatus(isOnline, healthData);
            if (this.wasOnline !== isOnline) {
                this.uiManager.showConnectionStatusChange(isOnline, healthData);
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
