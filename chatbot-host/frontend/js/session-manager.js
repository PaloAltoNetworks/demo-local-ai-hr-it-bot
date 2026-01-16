/**
 * Session Manager - Handles session lifecycle and server communication
 */
export class SessionManager {
    constructor(apiService, uiManager, i18nService) {
        this.apiService = apiService;
        this.uiManager = uiManager;
        this.i18nService = i18nService;
        this.sessionId = this.generateSessionId();
    }

    /**
     * Initialize session manager and setup lifecycle events
     */
    async init() {

        // Check if this is a fresh page load
        if (!this.getStoredSessionId()) {
            // This is a fresh page load, set a session ID
            this.storeSessionId();
            
            // Clear the server-side session
            await this.clearSession();
            console.log('✓ Fresh page load detected, cleared server-side session');
        }
        
        this.setupLifecycleEvents();
        this.setupUIEventListeners();

        console.log('SessionManager initialized');
    }

    /**
     * Setup page lifecycle events
     */
    setupLifecycleEvents() {
        // Listen for unload events to clear session ID so it fires on every page refresh
        window.addEventListener('beforeunload', () => {
            this.clearStoredSessionId();
        });
    }

    /**
     * Setup UI event listeners (logout button, etc)
     */
    setupUIEventListeners() {
        const logoutBtn = document.getElementById('userMenuLogout');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                await this.handleLogoutUI();
            });
        }
    }

    /**
     * Handle logout UI action
     */
    async handleLogoutUI() {
        console.log('🚪 Logout initiated');
        
        try {
            // Perform logout
            await this.logout();
            
            // Show confirmation message
            const successMsg = this.i18nService?.t('userMenu.logoutSuccess') || 'Logged out successfully';
            this.uiManager?.showNotification(successMsg, 'success');
            
            // Optional: Reload page or redirect after a delay
            setTimeout(() => {
                // Uncomment to redirect to login page
                // window.location.href = '/login';
                console.log('✓ Logout complete');
            }, 1000);
        } catch (error) {
            console.error('Error during logout:', error);
            const errorMsg = 'Failed to logout';
            this.uiManager?.showError(errorMsg);
        }
    }

    /**
     * Generate a unique session ID
     */
    generateSessionId() {
        return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get current session ID
     */
    getSessionId() {
        return this.sessionId;
    }

    /**
     * Clear session on the backend
     */
    async clearSession() {
        try {
            const response = await this.apiService.post('/api/clear-session', {});
            console.log('✓ Session cleared successfully');
            return response;
        } catch (error) {
            console.error('❌ Failed to clear session:', error);
            throw error;
        }
    }

    /**
     * Logout - clears both client and server session
     */
    async logout() {
        try {
            // Clear user session data from localStorage
            localStorage.removeItem('chatbot-session');
            
            // Clear stored session ID
            this.clearStoredSessionId();
            
            // Clear server-side session
            await this.clearSession();
            
            console.log('✓ User logged out and session cleared');
            return true;
        } catch (error) {
            console.error('❌ Error during logout:', error);
            throw error;
        }
    }

    /**
     * Store session ID in sessionStorage
     */
    storeSessionId() {
        try {
            sessionStorage.setItem('chatbot-session-id', this.sessionId);
        } catch (error) {
            console.warn('Failed to store session ID:', error);
        }
    }

    /**
     * Retrieve stored session ID
     */
    getStoredSessionId() {
        try {
            return sessionStorage.getItem('chatbot-session-id');
        } catch (error) {
            console.warn('Failed to retrieve session ID:', error);
            return null;
        }
    }

    /**
     * Clear stored session ID
     */
    clearStoredSessionId() {
        try {
            sessionStorage.removeItem('chatbot-session-id');
        } catch (error) {
            console.warn('Failed to clear stored session ID:', error);
        }
    }
}
