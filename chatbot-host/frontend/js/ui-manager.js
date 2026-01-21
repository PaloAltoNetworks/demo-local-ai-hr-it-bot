/**
 * @fileoverview UI Manager module for handling generic user interface operations.
 *
 * @responsibilities
 * - Display temporary notifications (success, error, warning, info)
 * - Manage user menu dropdown interactions
 * - Update UI elements with localized content
 * - Handle app-wide notification events
 *
 * @dependencies
 * - i18n: Internationalization service for translations
 *
 * @events
 * - Listens: 'appNotification' (window) - Generic notification requests from any module
 *
 * @version 1.0.0
 */

// ═══════════════════════════════════════════════════════════════════════════
// MODULE CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @type {Object.<string, string>}
 * @description Mapping of notification types to Material Symbols icon names
 */
const NOTIFICATION_ICONS = {
    success: 'check_circle',
    error: 'cancel',
    warning: 'warning',
    info: 'info'
};

/**
 * @type {number}
 * @description Default duration for notifications in milliseconds
 */
const DEFAULT_NOTIFICATION_DURATION = 4000;

/**
 * @type {HTMLTemplateElement|null}
 * @description Cached template element for notification creation
 */
let notificationTemplate = null;

// ═══════════════════════════════════════════════════════════════════════════
// CLASS DEFINITION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @class UIManager
 * @description Manages generic user interface operations including notifications,
 * user menu interactions, and localized content updates.
 *
 * @pattern Singleton-like manager with event-driven notification system
 *
 * @example
 * const uiManager = new UIManager(i18n);
 * await uiManager.init();
 *
 * uiManager.showNotification('Operation successful!', 'success');
 */
class UIManager {
    // ═══════════════════════════════════════════════════════════════════════
    // PRIVATE INSTANCE PROPERTIES
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @type {Object}
     * @private
     * @description Internationalization service instance
     */
    #i18n;

    /**
     * @type {Object.<string, HTMLElement>}
     * @private
     * @description Cached DOM element references
     */
    #elements = {};

    /**
     * @type {HTMLElement}
     * @private
     * @description Container element for notifications
     */
    #notificationContainer = null;

    /**
     * @type {Object.<string, Function>}
     * @private
     * @description Bound event handler references for cleanup
     */
    #boundHandlers = {};

    // ═══════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Creates a new UIManager instance.
     *
     * @param {Object} i18n - Internationalization service for translations
     */
    constructor(i18n) {
        this.#i18n = i18n;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // LIFECYCLE METHODS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Initializes the UI manager by caching elements and setting up event listeners.
     *
     * @async
     * @returns {Promise<void>}
     */
    async init() {
        this.#cacheElements();
        this.#initNotificationSystem();
        this.#bindEventHandlers();
        this.#attachListeners();
        this.#updateUserMenu();

        console.log('[UIManager] Initialized');
    }

    /**
     * Cleans up resources and removes all event listeners.
     *
     * @returns {void}
     */
    destroy() {
        this.#detachListeners();
        this.#notificationContainer?.remove();
        this.#notificationContainer = null;
        this.#elements = {};
        this.#boundHandlers = {};

        console.log('[UIManager] Destroyed');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PUBLIC API METHODS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Displays a temporary notification to the user.
     *
     * @param {string} message - The notification message to display
     * @param {('success'|'error'|'warning'|'info')} [type='info'] - The notification type
     * @param {number} [duration=4000] - Duration in milliseconds before auto-dismiss
     * @returns {void}
     *
     * @example
     * uiManager.showNotification('File saved successfully', 'success');
     * uiManager.showNotification('Connection lost', 'error', 6000);
     */
    showNotification(message, type = 'info', duration = DEFAULT_NOTIFICATION_DURATION) {
        const notification = this.#createNotificationElement(message, type);

        this.#notificationContainer.appendChild(notification);

        // Use requestAnimationFrame for smoother animation start
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                notification.classList.add('notification--show');
            });
        });

        setTimeout(() => {
            notification.classList.remove('notification--show');

            // Use transitionend for accurate removal timing
            const onTransitionEnd = () => {
                notification.removeEventListener('transitionend', onTransitionEnd);
                notification.remove();
            };
            notification.addEventListener('transitionend', onTransitionEnd, { once: true });

            // Fallback removal in case transitionend doesn't fire
            setTimeout(() => notification.remove(), 500);
        }, duration);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EVENT HANDLERS (PRIVATE)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Handles the appNotification custom event.
     *
     * @param {CustomEvent} event - The notification event with message details
     * @private
     * @returns {void}
     */
    #onAppNotification(event) {
        const { message, type, duration } = event.detail;
        this.showNotification(message, type, duration);
    }

    /**
     * Handles click on the user menu trigger button.
     *
     * @param {MouseEvent} event - The click event
     * @private
     * @returns {void}
     */
    #onUserMenuTriggerClick(event) {
        event.stopPropagation();
        this.#elements.userMenuDropdown?.classList.toggle('active');
    }

    /**
     * Handles document click for closing the user menu when clicking outside.
     *
     * @param {MouseEvent} event - The click event
     * @private
     * @returns {void}
     */
    #onDocumentClick(event) {
        const { userMenuTrigger, userMenuDropdown } = this.#elements;

        if (!userMenuTrigger || !userMenuDropdown) {
            return;
        }

        const isClickInsideMenu = userMenuTrigger.contains(event.target) ||
                                  userMenuDropdown.contains(event.target);

        if (!isClickInsideMenu) {
            userMenuDropdown.classList.remove('active');
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DOM OPERATIONS (PRIVATE)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Caches frequently accessed DOM elements.
     *
     * @private
     * @returns {void}
     */
    #cacheElements() {
        this.#elements = {
            userMenuTrigger: document.getElementById('userMenuTrigger'),
            userMenuDropdown: document.getElementById('userMenuDropdown'),
            userMenuName: document.getElementById('userMenuName'),
            userMenuEmail: document.getElementById('userMenuEmail'),
            userMenuLabel: document.getElementById('userMenuLabel')
        };
    }

    /**
     * Initializes the notification system with container and template.
     *
     * @private
     * @returns {void}
     */
    #initNotificationSystem() {
        // Create container if it doesn't exist
        this.#notificationContainer = document.getElementById('notification-container');
        if (!this.#notificationContainer) {
            this.#notificationContainer = document.createElement('div');
            this.#notificationContainer.id = 'notification-container';
            this.#notificationContainer.setAttribute('aria-live', 'polite');
            document.body.appendChild(this.#notificationContainer);
        }

        // Create template once for reuse
        if (!notificationTemplate) {
            notificationTemplate = document.createElement('template');
            notificationTemplate.innerHTML = `
                <div class="notification">
                    <div class="notification__content">
                        <span class="material-symbols"></span>
                        <span class="notification__message"></span>
                    </div>
                </div>
            `.trim();
        }
    }

    /**
     * Creates a notification DOM element using template cloning.
     *
     * @param {string} message - The notification message
     * @param {string} type - The notification type
     * @private
     * @returns {HTMLDivElement} The created notification element
     */
    #createNotificationElement(message, type) {
        const notification = notificationTemplate.content.firstElementChild.cloneNode(true);
        notification.classList.add(`notification--${type}`);

        const icon = NOTIFICATION_ICONS[type] || NOTIFICATION_ICONS.info;
        notification.querySelector('.material-symbols').textContent = icon;
        notification.querySelector('.notification__message').textContent = message;

        return notification;
    }

    /**
     * Updates user menu elements with localized content.
     *
     * @private
     * @returns {void}
     */
    #updateUserMenu() {
        const { userMenuName, userMenuEmail, userMenuLabel } = this.#elements;

        if (userMenuName) {
            userMenuName.textContent = this.#i18n.t('userProfile.name');
        }

        if (userMenuEmail) {
            userMenuEmail.textContent = this.#i18n.t('userProfile.email');
        }

        if (userMenuLabel) {
            userMenuLabel.textContent = this.#i18n.t('userMenu.label') || 'User';
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EVENT LISTENER MANAGEMENT (PRIVATE)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Binds event handler methods to preserve context.
     *
     * @private
     * @returns {void}
     */
    #bindEventHandlers() {
        this.#boundHandlers = {
            appNotification: this.#onAppNotification.bind(this),
            userMenuTriggerClick: this.#onUserMenuTriggerClick.bind(this),
            documentClick: this.#onDocumentClick.bind(this)
        };
    }

    /**
     * Attaches all event listeners.
     *
     * @private
     * @returns {void}
     */
    #attachListeners() {
        window.addEventListener('appNotification', this.#boundHandlers.appNotification);

        this.#elements.userMenuTrigger?.addEventListener(
            'click',
            this.#boundHandlers.userMenuTriggerClick
        );

        document.addEventListener('click', this.#boundHandlers.documentClick, { passive: true });
    }

    /**
     * Detaches all event listeners for cleanup.
     *
     * @private
     * @returns {void}
     */
    #detachListeners() {
        window.removeEventListener('appNotification', this.#boundHandlers.appNotification);

        this.#elements.userMenuTrigger?.removeEventListener(
            'click',
            this.#boundHandlers.userMenuTriggerClick
        );

        document.removeEventListener('click', this.#boundHandlers.documentClick, { passive: true });
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export { UIManager };
