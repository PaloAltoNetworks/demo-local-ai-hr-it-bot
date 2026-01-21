/**
 * SecurityDevPanel - Real-time Prisma AIRS Security Checkpoint Monitor
 *
 * @fileoverview Developer panel for monitoring Prisma AIRS security checkpoints in real-time.
 * Displays checkpoint data as it's processed, with collapsible request/response JSON details.
 * This panel is intended for development and debugging purposes only.
 *
 * @responsibilities
 *   - Display real-time security checkpoint events from ChatHandler
 *   - Show checkpoint status (approved/blocked) with visual indicators
 *   - Provide collapsible JSON details for each checkpoint's input/output
 *   - Track and display checkpoint count via badge notification
 *   - Support panel resize (medium/large) for detailed inspection
 *   - Link checkpoints to Strata Cloud Manager admin console
 *
 * @dependencies
 *   - i18n: Internationalization service for translating UI labels
 *
 * @events
 *   - Listens: securityCheckpoint - When ChatHandler receives a security checkpoint from backend
 *
 * @version 1.0.0
 */

/**
 * Strata Cloud Manager admin console base URL
 *
 * @type {string}
 */
const ADMIN_CONSOLE_BASE_URL = 'https://stratacloudmanager.paloaltonetworks.com/ai-security/runtime/ai-sessions';

/**
 * SecurityDevPanel - Developer panel for monitoring security checkpoints
 *
 * @class SecurityDevPanel
 * @description Provides a collapsible panel that displays real-time security checkpoint
 * data from Prisma AIRS. Each checkpoint shows status, latency, and expandable JSON details.
 *
 * @pattern Observer - Listens to window events for checkpoint notifications
 *
 * @example
 *   const panel = new SecurityDevPanel(i18nService);
 *   await panel.init();
 */
export class SecurityDevPanel {

    // ═══════════════════════════════════════════════════════════════════════════
    // PRIVATE INSTANCE PROPERTIES
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Injected i18n service for translations
     *
     * @type {I18nService}
     * @private
     */
    #i18n;

    /**
     * Cached DOM elements
     *
     * @type {Object.<string, HTMLElement>}
     * @private
     */
    #elements = {};

    /**
     * Bound event handlers for proper cleanup
     *
     * @type {Object.<string, Function>}
     * @private
     */
    #boundHandlers = {};

    /**
     * Collection of received security checkpoints
     *
     * @type {Array<Object>}
     * @private
     */
    #checkpoints = [];

    /**
     * Current panel open state
     *
     * @type {boolean}
     * @private
     */
    #isOpen = false;

    /**
     * Current panel size is large
     *
     * @type {boolean}
     * @private
     */
    #isLarge = false;

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Create a new SecurityDevPanel instance
     *
     * @constructor
     * @param {I18nService} i18n - Internationalization service for translations
     */
    constructor(i18n) {
        this.#i18n = i18n;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // LIFECYCLE METHODS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Initialize the module
     *
     * @async
     * @returns {Promise<void>}
     *
     * @description Called by app.js during application bootstrap. Caches DOM elements,
     * binds event handlers, and attaches event listeners.
     */
    async init() {
        this.#cacheElements();
        this.#bindEventHandlers();
        this.#attachListeners();
        console.log('[SecurityDevPanel] Module initialized');
    }

    /**
     * Clean up resources and remove event listeners
     *
     * @returns {void}
     *
     * @description Called during application shutdown. Removes all event
     * listeners and releases resources to prevent memory leaks.
     */
    destroy() {
        this.#detachListeners();
        this.#checkpoints = [];
        this.#elements = {};
        this.#boundHandlers = {};
        console.log('[SecurityDevPanel] Module destroyed');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENT HANDLERS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Handle security checkpoint events from ChatHandler
     *
     * @param {CustomEvent} event - Security checkpoint event
     * @param {Object} event.detail - Event payload
     * @param {Object} event.detail.checkpoint - Checkpoint data object
     * @private
     */
    #onSecurityCheckpoint(event) {
        const { checkpoint } = event.detail;
        if (!checkpoint) return;

        console.debug('[SecurityDevPanel] Received security checkpoint event', checkpoint);

        checkpoint.timestamp ??= new Date().toISOString();
        this.#checkpoints.push(checkpoint);
        this.#updateBadge();
        this.#renderCheckpointItem(checkpoint);
    }

    /**
     * Toggle panel visibility between open and closed
     *
     * @private
     */
    #onTogglePanel() {
        if (!this.#elements.panelContent) return;
        this.#isOpen = !this.#isOpen;
        this.#elements.panelContent.classList.toggle('open', this.#isOpen);
    }

    /**
     * Toggle panel size between medium and large
     *
     * @private
     */
    #onToggleSize() {
        if (!this.#elements.panelContent) return;

        this.#isLarge = !this.#isLarge;
        this.#elements.panelContent.classList.toggle('size-large', this.#isLarge);

        const icon = this.#elements.resizeButton?.querySelector('.material-symbols');
        if (icon) icon.textContent = this.#isLarge ? 'close_fullscreen' : 'open_in_full';
    }

    /**
     * Clear all checkpoints and reset the panel
     *
     * @private
     */
    #onClearAll() {
        this.#checkpoints = [];
        this.#updateBadge();
        this.#resetLiveFeed();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DOM OPERATIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Cache frequently accessed DOM elements
     *
     * @private
     */
    #cacheElements() {
        this.#elements = {
            panelButton: document.getElementById('security-dev-button'),
            panelContent: document.getElementById('security-dev-content'),
            clearButton: document.getElementById('security-dev-clear'),
            resizeButton: document.getElementById('security-dev-resize'),
            badge: document.getElementById('security-badge'),
            liveFeed: document.getElementById('security-live-feed'),
        };
    }

    /**
     * Update the badge count display
     *
     * @private
     */
    #updateBadge() {
        const { badge } = this.#elements;
        if (!badge) return;

        const count = this.#checkpoints.length;
        badge.textContent = count;
        badge.classList.toggle('hidden', count === 0);
    }

    /**
     * Create a DOM element with optional class and text content
     *
     * @param {string} tag - HTML tag name
     * @param {string} [className] - CSS class name(s)
     * @param {string} [text] - Text content
     * @returns {HTMLElement}
     * @private
     */
    #createElement(tag, className, text) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text) el.textContent = text;
        return el;
    }

    /**
     * Render a checkpoint item in the live feed using safe DOM methods
     *
     * @param {Object} checkpoint - Checkpoint data to render
     * @private
     */
    #renderCheckpointItem(checkpoint) {
        const { liveFeed } = this.#elements;
        if (!liveFeed) return;

        if (this.#checkpoints.length === 1) {
            liveFeed.textContent = '';
        }

        const action = checkpoint.output?.action;
        const isApproved = action === 'allow';
        const statusClass = isApproved ? 'approved' : 'blocked';

        const item = this.#createElement('div', `security-live-item ${statusClass}`);

        item.appendChild(
            this.#createElement('div', 'checkpoint-timestamp', new Date(checkpoint.timestamp).toLocaleTimeString())
        );

        const header = this.#createElement('div', 'checkpoint-header');
        header.appendChild(this.#createElement('span', 'checkpoint-icon', isApproved ? '✅' : '🚫'));
        header.appendChild(this.#buildCheckpointLink(checkpoint));
        header.appendChild(this.#createElement('span', 'checkpoint-latency', `${checkpoint.latency_ms}ms`));
        item.appendChild(header);

        item.appendChild(this.#createElement('div', 'checkpoint-label', checkpoint.label));

        const statusText = (action?.toUpperCase() ?? 'UNKNOWN') + (checkpoint.output?.category ? ` (${checkpoint.output.category})` : '');
        item.appendChild(this.#createElement('div', `checkpoint-status ${statusClass}`, statusText));

        item.appendChild(this.#buildDetailsSection(checkpoint));

        liveFeed.appendChild(item);
        liveFeed.scrollTop = liveFeed.scrollHeight;
    }

    /**
     * Build the collapsible details section for a checkpoint
     *
     * @param {Object} checkpoint - Checkpoint data
     * @returns {HTMLDetailsElement}
     * @private
     */
    #buildDetailsSection(checkpoint) {
        const details = document.createElement('details');
        details.className = 'checkpoint-details';

        const summary = document.createElement('summary');
        summary.textContent = this.#i18n.t('security.viewDetails');
        details.appendChild(summary);

        const container = this.#createElement('div', 'checkpoint-json-container');
        container.appendChild(this.#buildJsonSection('security.inputLabel', checkpoint.input));
        container.appendChild(this.#buildJsonSection('security.outputLabel', checkpoint.output));
        details.appendChild(container);

        return details;
    }

    /**
     * Build a JSON display section with label and formatted code
     *
     * @param {string} labelKey - i18n key for the section label
     * @param {Object} data - Data to stringify
     * @returns {HTMLDivElement}
     * @private
     */
    #buildJsonSection(labelKey, data) {
        const section = this.#createElement('div', 'checkpoint-json-section');
        section.appendChild(this.#createElement('div', 'checkpoint-json-label', this.#i18n.t(labelKey)));

        const pre = this.#createElement('pre', 'checkpoint-json-code');
        const code = document.createElement('code');
        code.textContent = JSON.stringify(data, null, 2);
        pre.appendChild(code);
        section.appendChild(pre);

        return section;
    }

    /**
     * Reset the live feed to initial state
     *
     * @private
     */
    #resetLiveFeed() {
        const { liveFeed } = this.#elements;
        if (!liveFeed) return;

        liveFeed.textContent = '';
        const p = this.#createElement('p', 'no-data', this.#i18n.t('security.waiting'));
        liveFeed.appendChild(p);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENT LISTENER MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Create bound handlers for all event listeners
     *
     * @private
     */
    #bindEventHandlers() {
        this.#boundHandlers = {
            securityCheckpoint: this.#onSecurityCheckpoint.bind(this),
            togglePanel: this.#onTogglePanel.bind(this),
            toggleSize: this.#onToggleSize.bind(this),
            clearAll: this.#onClearAll.bind(this),
        };
    }

    /**
     * Attach all event listeners
     *
     * @private
     */
    #attachListeners() {
        window.addEventListener('securityCheckpoint', this.#boundHandlers.securityCheckpoint);
        this.#elements.panelButton?.addEventListener('click', this.#boundHandlers.togglePanel);
        this.#elements.resizeButton?.addEventListener('click', this.#boundHandlers.toggleSize);
        this.#elements.clearButton?.addEventListener('click', this.#boundHandlers.clearAll);
    }

    /**
     * Remove all event listeners
     *
     * @private
     */
    #detachListeners() {
        window.removeEventListener('securityCheckpoint', this.#boundHandlers.securityCheckpoint);
        this.#elements.panelButton?.removeEventListener('click', this.#boundHandlers.togglePanel);
        this.#elements.resizeButton?.removeEventListener('click', this.#boundHandlers.toggleSize);
        this.#elements.clearButton?.removeEventListener('click', this.#boundHandlers.clearAll);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PRIVATE HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Build the Strata Cloud Manager admin console URL for a checkpoint
     *
     * @param {Object} checkpoint - Checkpoint data
     * @returns {string|null} Admin console URL or null if required data is missing
     * @private
     */
    #buildAdminConsoleUrl(checkpoint) {
        const trId = checkpoint.input?.tr_id;
        const profileId = checkpoint.input?.ai_profile?.profile_id 
            || checkpoint.output?.profile_id;
        const appName = checkpoint.input?.metadata?.app_name;
        const scanId = checkpoint.output?.scan_id;
        const tsgId = checkpoint.tsg_id;

        if (!trId || !profileId || !appName || !scanId || !tsgId) {
            return null;
        }

        const checkpointIndex = (checkpoint.number ?? 1) - 1;
        return `${ADMIN_CONSOLE_BASE_URL}/${trId}/${profileId}/${appName}/transactions/${scanId}/${checkpointIndex}?tsg_id=${tsgId}`;
    }

    /**
     * Build a checkpoint link element (external link if URL available, span otherwise)
     *
     * @param {Object} checkpoint - Checkpoint data
     * @returns {HTMLElement} Link or span element with checkpoint number
     * @private
     */
    #buildCheckpointLink(checkpoint) {
        const text = `${this.#i18n.t('security.checkpoint')} ${checkpoint.number}`;
        const url = this.#buildAdminConsoleUrl(checkpoint);

        if (url) {
            const link = document.createElement('a');
            link.className = 'checkpoint-number checkpoint-link';
            link.href = url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = text;
            link.title = this.#i18n.t('security.viewInConsole') || 'View in Strata Cloud Manager';
            return link;
        }

        return this.#createElement('span', 'checkpoint-number', text);
    }
}
