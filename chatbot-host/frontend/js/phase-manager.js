/**
 * Phase Manager for handling phase switching and state management
 */
export class PhaseManager {
    constructor() {
        this.currentPhase = 'phase1';
        this.STORAGE_KEY = 'currentPhase';
    }

    /**
     * Initialize phase manager - called from constructor
     */
    init() {
        // Restore phase from localStorage
        this.restorePhase();

        // Apply the phase UI
        this.switchPhase(this.currentPhase, true);

        // Attach event listeners
        this.attachListeners();
        console.log('PhaseManager initialized');
    }

    /**
     * Attach phase button event listeners
     */
    attachListeners() {
        document.querySelectorAll('.phase-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const phase = e.currentTarget.getAttribute('data-phase');
                if (phase && phase !== this.currentPhase) {
                    this.switchPhase(phase);
                }
            });
        });
    }

    /**
     * Get current phase
     */
    getCurrentPhase() {
        return this.currentPhase;
    }

    /**
     * Switch to a different phase
     */
    switchPhase(newPhase, forceRender = false) {
        if (newPhase === this.currentPhase && !forceRender) {
            return;
        }

        this.currentPhase = newPhase;
        this.savePhase(newPhase);
        this.updatePhaseUI();

        this.dispatchPhaseChangeEvent(newPhase);

        console.log(`Switched to phase: ${newPhase}`);
    }

    /**
     * Dispatch phase change event
     * @param {*} newPhase 
     */
    dispatchPhaseChangeEvent(newPhase) {
        const phaseChangedEvent = new CustomEvent('phaseChanged', {
            detail: { phase: newPhase }
        });
        window.dispatchEvent(phaseChangedEvent);
    }

    /**
     * Update phase UI elements
     */
    updatePhaseUI() {
        // Update phase buttons
        document.querySelectorAll('.phase-btn').forEach(btn => {
            btn.classList.toggle('active',
                btn.getAttribute('data-phase') === this.currentPhase
            );
        });

        // Update body class for styling
        document.body.className = `${this.currentPhase}-active`;
    }

    /**
     * Save phase to localStorage
     */
    savePhase(phase) {
        try {
            localStorage.setItem(this.STORAGE_KEY, phase);
        } catch (error) {
            console.warn('PhaseManager - Failed to save phase to localStorage:', error);
        }
    }

    /**
     * Restore phase from localStorage
     */
    restorePhase() {
        try {
            const currentPhase = localStorage.getItem(this.STORAGE_KEY);

            if (currentPhase) {
                this.currentPhase = currentPhase;
            }
        } catch (error) {
            console.warn('PhaseManager - Failed to restore phase from localStorage:', error);
        }
    }
}
