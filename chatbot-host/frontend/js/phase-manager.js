/**
 * Phase Manager for handling phase switching and state management
 */
export class PhaseManager {
    constructor(i18n) {
        this.i18n = i18n;
        this.currentPhase = 'phase1';
        this.isInitialized = false;
        
        // Initialize in constructor
        this.init();
    }

    /**
     * Initialize phase manager - called from constructor
     */
    init() {
        if (this.isInitialized) return;
        
        // Restore phase from localStorage
        this.restorePhase();
        
        // Attach event listeners
        this.attachListeners();
        
        this.isInitialized = true;
        console.log('✅ PhaseManager initialized');
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

        // Dispatch phase change event
        const phaseChangedEvent = new CustomEvent('phaseChanged', {
            detail: { phase: newPhase }
        });
        window.dispatchEvent(phaseChangedEvent);

        console.log(`Switched to phase: ${newPhase}`);
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

        console.log(`UI updated for phase: ${this.currentPhase}`);
    }

    /**
     * Save phase to localStorage
     */
    savePhase(phase) {
        localStorage.setItem('currentPhase', phase);
    }

    /**
     * Restore phase from localStorage
     */
    restorePhase() {
        const currentPhase = localStorage.getItem('currentPhase');
        
        if (currentPhase) {
            this.currentPhase = currentPhase;
        }
    }
}
