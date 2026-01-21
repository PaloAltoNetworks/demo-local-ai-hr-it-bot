/**
 * UI Manager for handling generic user interface operations
 * Handles: notifications, user menu, language UI updates
 */

export class UIManager {
    constructor(i18n) {
        this.i18n = i18n;
    }

    /**
     * Initialize event listeners
     */
    async init() {
        // Listen to app events
        window.addEventListener('appNotification', this.onAppNotification.bind(this));
        
        // Setup UI listeners
        this.setupUserMenuListeners();
    }

    /**
     * Handle app notification event
     * Generic handler for notifications from any module
     */
    onAppNotification(event) {
        const { message, type, duration } = event.detail;
        this.showNotification(message, type, duration);
    }

    /**
     * Setup user menu event listeners
     */
    setupUserMenuListeners() {
        const trigger = document.getElementById('userMenuTrigger');
        const dropdown = document.getElementById('userMenuDropdown');

        if (!trigger || !dropdown) return;

        // Toggle dropdown on trigger click
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('active');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!trigger.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.remove('active');
            }
        });

        // Update user menu with localized content
        this.updateUserMenu();
    }

    /**
     * Update user menu with localized content
     */
    updateUserMenu() {
        const userName = document.getElementById('userMenuName');
        const userEmail = document.getElementById('userMenuEmail');
        const userMenuLabel = document.getElementById('userMenuLabel');

        if (userName) {
            userName.textContent = this.i18n.t('userProfile.name');
        }
        if (userEmail) {
            userEmail.textContent = this.i18n.t('userProfile.email');
        }
        if (userMenuLabel) {
            userMenuLabel.textContent = this.i18n.t('userMenu.label') || 'User';
        }
    }

    /**
     * Show a temporary notification to the user
     */
    showNotification(message, type = 'info', duration = 4000) {
        const notification = document.createElement('div');
        notification.className = `notification notification--${type}`;
        
        const icons = {
            success: 'check_circle',
            error: 'cancel',
            warning: 'warning',
            info: 'info'
        };
        
        notification.innerHTML = `
            <div class="notification__content">
                <span class="material-symbols">${icons[type] || icons.info}</span>
                <span>${message}</span>
            </div>
        `;

        document.body.appendChild(notification);

        // Trigger show animation
        setTimeout(() => notification.classList.add('notification--show'), 100);

        // Auto-remove after delay
        setTimeout(() => {
            notification.classList.remove('notification--show');
            setTimeout(() => notification.remove(), 300);
        }, duration);
    }
}
