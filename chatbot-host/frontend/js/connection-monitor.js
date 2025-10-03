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
        
        // Update UI if status changed
        if (this.wasOnline !== isOnline) {
            this.uiManager.updateConnectionStatus(isOnline, healthData);
            this.uiManager.showConnectionStatusChange(isOnline, healthData);
            this.wasOnline = isOnline;
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
