/**
 * Phase Manager for handling phase switching and state management
 */
export class PhaseManager {

    currentPhase = 'phase1';
    STORAGE_KEY = 'currentPhase';
    element = document.querySelectorAll('.phase-btn');

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
        this.element.forEach(btn => {
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

        console.debug(`Switched to phase: ${newPhase}`);
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
        this.element.forEach(btn => {
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
                console.debug(`Restored phase from localStorage: ${currentPhase}`);
            }
        } catch (error) {
            console.warn('PhaseManager - Failed to restore phase from localStorage:', error);
        }
    }
}
