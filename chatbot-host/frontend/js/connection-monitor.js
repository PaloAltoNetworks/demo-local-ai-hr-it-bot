/**
 * Connection Monitor for handling backend connectivity
 */
import { CONFIG } from './config.js';

export class ConnectionMonitor {
    constructor(apiService, uiManager) {
        this.apiService = apiService;
        this.uiManager = uiManager;
        this.connectionCheckInterval = null;
        this.wasOnline = true;
        this.wasDegraded = false;
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
    }

    /**
     * Check backend connection and update UI
     */
    async checkConnection() {
        const isOnline = await this.apiService.checkConnection();
        const healthData = this.apiService.getLastHealthData();
        
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
     * Force check connection status
     */
    async forceCheck() {
        return await this.checkConnection();
    }
}
