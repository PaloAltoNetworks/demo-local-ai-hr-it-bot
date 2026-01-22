/**
 * PhaseManager - Application phase/state controller
 *
 * @fileoverview Manages application phases (e.g., phase1, phase2) and coordinates
 * UI state transitions. Handles phase persistence in localStorage and dispatches
 * phase change events for other modules to react to.
 *
 * @responsibilities
 *   - Track and persist current application phase
 *   - Handle phase button interactions
 *   - Update UI to reflect active phase
 *   - Dispatch phase change events to notify other modules
 *
 * @events
 *   - Dispatches: phaseChanged - When the active phase changes
 *
 * @version 1.0.0
 */

/**
 * PhaseManager - Controls application phase state and transitions
 *
 * @class PhaseManager
 * @description Manages the application's phase system, allowing users to switch
 * between different operational modes. Persists state across sessions and
 * coordinates UI updates with event dispatching.
 *
 * @pattern Observer (dispatches events for phase changes)
 *
 * @example
 *   const phaseManager = new PhaseManager();
 *   await phaseManager.init();
 *   phaseManager.switchPhase('phase2');
 */
export class PhaseManager {

    // ═══════════════════════════════════════════════════════════════════════════
    // STATIC PROPERTIES
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * LocalStorage key for phase persistence
     *
     * @static
     * @type {string}
     */
    static STORAGE_KEY = 'currentPhase';

    /**
     * Default phase when no saved preference exists
     *
     * @static
     * @type {string}
     */
    static DEFAULT_PHASE = 'phase1';

    // ═══════════════════════════════════════════════════════════════════════════
    // PRIVATE INSTANCE PROPERTIES
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Cached DOM elements
     *
     * @type {Object.<string, NodeList|HTMLElement>}
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

    // ═══════════════════════════════════════════════════════════════════════════
    // PUBLIC INSTANCE PROPERTIES
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Currently active phase
     *
     * @type {string}
     */
    currentPhase = PhaseManager.DEFAULT_PHASE;

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Create a new PhaseManager instance
     *
     * @constructor
     */
    constructor() {}

    // ═══════════════════════════════════════════════════════════════════════════
    // LIFECYCLE METHODS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Initialize the phase manager
     *
     * @returns {void}
     *
     * @description Restores saved phase from localStorage, caches DOM elements,
     * binds event handlers, and attaches listeners. Called by app.js during
     * application bootstrap.
     */
    init() {
        this.#restorePhase();
        this.#cacheElements();
        this.#bindEventHandlers();
        this.#attachListeners();
        console.log('[PhaseManager] Module initialized');
    }

    /**
     * Clean up resources and remove event listeners
     *
     * @returns {void}
     *
     * @description Removes all event listeners and clears cached references
     * to prevent memory leaks.
     */
    destroy() {
        this.#detachListeners();
        this.#elements = {};
        this.#boundHandlers = {};
        console.log('[PhaseManager] Module destroyed');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PUBLIC API
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Get the current active phase
     *
     * @returns {string} Current phase identifier
     */
    getCurrentPhase() {
        return this.currentPhase;
    }

    /**
     * Switch to a different phase
     *
     * @param {string} newPhase - Phase identifier to switch to
     * @param {boolean} [forceRender=false] - Force UI update even if phase unchanged
     * @returns {void}
     *
     * @description Updates the current phase, persists to localStorage, updates
     * UI elements, and dispatches a phaseChanged event for other modules.
     *
     * @example
     *   phaseManager.switchPhase('phase2');
     *   phaseManager.switchPhase('phase1', true); // Force re-render
     */
    switchPhase(newPhase, forceRender = false) {
        if (newPhase === this.currentPhase && !forceRender) {
            return;
        }

        this.currentPhase = newPhase;
        this.#savePhase(newPhase);
        this.#updatePhaseUI();
        this.#dispatchPhaseChangeEvent(newPhase);

        console.debug(`[PhaseManager] Switched to phase: ${newPhase}`);
    }

    /**
     * Re-applies current phase settings and updates UI
     * Useful for refreshing phase-related UI after dynamic content changes
     *
     * @returns {void}
     *
     * @description Forces a re-render of the current phase without changing it.
     * Useful when external components need to refresh phase-dependent UI.
     */
    reapply() {
        if (!this.currentPhase) {
            console.warn('[PhaseManager] No phase set to reapply');
            return;
        }

        this.switchPhase(this.currentPhase, true);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENT HANDLERS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Handle phase button click
     *
     * @param {MouseEvent} event - Click event from phase button
     * @private
     */
    #onPhaseButtonClick(event) {
        const phase = event.currentTarget.getAttribute('data-phase');
        if (phase && phase !== this.currentPhase) {
            this.switchPhase(phase);
        }
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
            phaseButtons: document.querySelectorAll('.phase-btn'),
        };
    }

    /**
     * Update phase UI elements to reflect current state
     *
     * @private
     */
    #updatePhaseUI() {
        this.#elements.phaseButtons?.forEach(btn => {
            btn.classList.toggle('active',
                btn.getAttribute('data-phase') === this.currentPhase
            );
        });

        document.body.className = `${this.currentPhase}-active`;
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
            phaseButtonClick: this.#onPhaseButtonClick.bind(this),
        };
    }

    /**
     * Attach all event listeners
     *
     * @private
     */
    #attachListeners() {
        this.#elements.phaseButtons?.forEach(btn => {
            btn.addEventListener('click', this.#boundHandlers.phaseButtonClick);
        });
    }

    /**
     * Remove all event listeners
     *
     * @private
     */
    #detachListeners() {
        this.#elements.phaseButtons?.forEach(btn => {
            btn.removeEventListener('click', this.#boundHandlers.phaseButtonClick);
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PRIVATE HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Save phase to localStorage
     *
     * @param {string} phase - Phase identifier to persist
     * @private
     */
    #savePhase(phase) {
        try {
            localStorage.setItem(PhaseManager.STORAGE_KEY, phase);
        } catch (error) {
            console.warn('[PhaseManager] Failed to save phase to localStorage:', error);
        }
    }

    /**
     * Restore phase from localStorage
     *
     * @private
     */
    #restorePhase() {
        try {
            const savedPhase = localStorage.getItem(PhaseManager.STORAGE_KEY);

            if (savedPhase) {
                this.currentPhase = savedPhase;
                console.debug(`[PhaseManager] Restored phase from localStorage: ${savedPhase}`);
            }
        } catch (error) {
            console.warn('[PhaseManager] Failed to restore phase from localStorage:', error);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // UTILITY METHODS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Dispatch phase change event to notify other modules
     *
     * @param {string} phase - New phase identifier
     * @private
     */
    #dispatchPhaseChangeEvent(phase) {
        const event = new CustomEvent('phaseChanged', {
            detail: { phase }
        });
        window.dispatchEvent(event);
    }
}
