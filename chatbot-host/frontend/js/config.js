/**
 * Application Configuration - Simple base URL approach
 */

// Base URL configuration - adapts to environment
export const API_BASE_URL = window.location.origin;

// Other application constants
export const CONFIG = {
    DEBOUNCE_DELAY: 300,
    MAX_RETRIES: 3,
    HEARTBEAT_INTERVAL: 10000, // Check connection every 30 seconds
    CONNECTION_TIMEOUT: 5000,  // 5 seconds timeout for connection checks
    REQUEST_TIMEOUT: 60000     // 60 seconds for API requests
};
