/**
 * Security Dev Panel - Real-time Prisma AIRS Live Feed
 * Shows security checkpoint data as it's processed in real-time
 * Each checkpoint has a collapsible details section showing request/response JSON
 */

export class SecurityDevPanel {
    constructor(i18n = null) {
        this.panelButton = document.getElementById('security-dev-button');
        this.panelContent = document.getElementById('security-dev-content');
        this.panelClear = document.getElementById('security-dev-clear');
        this.panelResize = document.getElementById('security-dev-resize');
        this.securityBadge = document.getElementById('security-badge');
        this.liveFeedContainer = document.getElementById('security-live-feed');
        this.i18n = i18n;
        
        this.checkpoints = [];
        this.isOpen = false;
        this.currentSize = 'medium'; // medium, large
        
        this.init();
    }

    /**
     * Initialize event listeners
     */
    init() {
        if (this.panelButton) this.panelButton.addEventListener('click', () => this.togglePanel());
        if (this.panelClear) this.panelClear.addEventListener('click', () => this.clearAll());
        if (this.panelResize) this.panelResize.addEventListener('click', () => this.toggleSize());
    }

    /**
     * Toggle panel size between medium and large
     */
    toggleSize() {
        if (!this.panelContent || !this.panelResize) return;
        
        const resizeIcon = this.panelResize.querySelector('.material-symbols');
        
        if (this.currentSize === 'medium') {
            this.currentSize = 'large';
            this.panelContent.classList.add('size-large');
            resizeIcon.textContent = 'unfold_less';
        } else {
            this.currentSize = 'medium';
            this.panelContent.classList.remove('size-large');
            resizeIcon.textContent = 'unfold_more';
        }
    }

    /**
     * Toggle panel visibility
     */
    togglePanel() {
        if (this.isOpen) {
            this.closePanel();
        } else {
            this.openPanel();
        }
    }

    /**
     * Open panel
     */
    openPanel() {
        if (this.panelContent) {
            this.panelContent.classList.add('open');
            this.isOpen = true;
        }
    }

    /**
     * Close panel
     */
    closePanel() {
        if (this.panelContent) {
            this.panelContent.classList.remove('open');
            this.isOpen = false;
        }
    }

    /**
     * Add a security checkpoint to the dev panel (called in real-time)
     */
    addCheckpoint(checkpoint) {
        // Add timestamp if not present
        if (!checkpoint.timestamp) {
            checkpoint.timestamp = new Date().toISOString();
        }
        
        this.checkpoints.push(checkpoint);
        
        // Update badge
        this.updateBadge();
        
        // Add to live feed
        this.addToLiveFeed(checkpoint);
    }

    /**
     * Update the badge count - shows total checkpoints (all, whether success or blocked)
     */
    updateBadge() {
        if (!this.securityBadge) return;
        
        // Count all checkpoints to notify user of activity
        const totalCount = this.checkpoints.length;
        
        if (totalCount > 0) {
            this.securityBadge.textContent = totalCount;
            this.securityBadge.classList.remove('hidden');
        } else {
            this.securityBadge.classList.add('hidden');
        }
    }

    /**
     * Add item to live feed - shows all checkpoints with collapsible JSON
     */
    addToLiveFeed(checkpoint) {
        if (!this.liveFeedContainer) return;
        
        // Clear "Waiting" message if this is the first item
        if (this.checkpoints.length === 1) {
            this.liveFeedContainer.innerHTML = '';
        }
        
        // Determine approval status from action field (Prisma AIRS native field)
        const action = checkpoint.output?.action;
        const isApproved = action === 'allow';
        const statusIcon = isApproved ? '✅' : '🚫';
        const actionText = action ? action.toUpperCase() : 'UNKNOWN';
        const timestamp = new Date(checkpoint.timestamp).toLocaleTimeString();
        const category = checkpoint.output?.category ? ` (${checkpoint.output.category})` : '';
        
        const item = document.createElement('div');
        item.className = `security-live-item ${isApproved ? 'approved' : 'blocked'}`;
        
        item.innerHTML = `
            <div class="checkpoint-timestamp">${timestamp}</div>
            <div class="checkpoint-header">
                <span class="checkpoint-icon">${statusIcon}</span>
                <span class="checkpoint-number">${this.i18n.t('security.checkpoint')} ${checkpoint.number}</span>
                <span class="checkpoint-latency">${checkpoint.latency_ms}ms</span>
            </div>
            <div class="checkpoint-label">${checkpoint.label}</div>
            <div class="checkpoint-status ${isApproved ? 'approved' : 'blocked'}">
                ${actionText}${category}
            </div>
            <details class="checkpoint-details">
                <summary>${this.i18n.t('security.viewDetails')}</summary>
                <div class="checkpoint-json-container">
                    <div class="checkpoint-json-section">
                        <div class="checkpoint-json-label">${this.i18n.t('security.inputLabel')}</div>
                        <pre class="checkpoint-json-code"><code>${JSON.stringify(checkpoint.input, null, 2)}</code></pre>
                    </div>
                    <div class="checkpoint-json-section">
                        <div class="checkpoint-json-label">${this.i18n.t('security.outputLabel')}</div>
                        <pre class="checkpoint-json-code"><code>${JSON.stringify(checkpoint.output, null, 2)}</code></pre>
                    </div>
                </div>
            </details>
        `;
        
        this.liveFeedContainer.appendChild(item);
        
        // Auto-scroll to bottom
        this.liveFeedContainer.scrollTop = this.liveFeedContainer.scrollHeight;
    }

    clearAll() {
        this.checkpoints = [];
        this.updateBadge();
        if (this.liveFeedContainer) {
            this.liveFeedContainer.innerHTML = `<p class="no-data">${this.i18n.t('security.waiting')}</p>`;
        }
    }
}
