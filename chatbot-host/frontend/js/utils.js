/**
 * Utility functions for the ChatBot application
 */

export class Utils {
    /**
     * Get query parameter from script src
     */
    static getScriptQueryParam(param) {
        const scripts = document.getElementsByTagName('script');
        for (let script of scripts) {
            if (script.src && script.src.includes('app')) {
                try {
                    const url = new URL(script.src, window.location.origin);
                    return url.searchParams.get(param);
                } catch (error) {
                    console.warn('Error parsing script URL:', error);
                }
            }
        }
        return null;
    }

    /**
     * Escape HTML to prevent XSS
     */
    static escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Format bot response with markdown-like formatting
     */
    static formatBotResponse(responseText) {
        if (!responseText) return '';
        
        // Ensure we have a string to work with
        let textToFormat = responseText;
        
        // Handle array format if it somehow gets here
        if (Array.isArray(responseText)) {
            textToFormat = responseText
                .filter(item => typeof item === 'string' || (item && item.text))
                .map(item => typeof item === 'string' ? item : item.text)
                .join(' ');
        } else if (typeof responseText === 'object' && responseText.text) {
            textToFormat = responseText.text;
        } else if (typeof responseText !== 'string') {
            textToFormat = String(responseText);
        }
        
        return textToFormat
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>');
    }

    /**
     * Get current timestamp
     */
    static getTimestamp(language) {
        return new Intl.DateTimeFormat(language, {
            hour: '2-digit',
            minute: '2-digit'
        }).format(new Date());
    }

    /**
     * Utility delay function
     */
    static delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Get thinking icon mapping - maps text patterns to icon names
     * @returns {Object} Object where keys are pipe-separated keywords and values are icon names
     */
    static getThinkingIconMap() {
        return {
            'Analyzing|🔍': 'search',
            'Checking language|🌐': 'public',
            'Translated|🔄': 'language',
            'Determining|🎯': 'center_focus_strong',
            'Connecting|📡': 'cloud_queue',
            'processing|⏳': 'settings',
            'Response received|✅': 'check_circle',
            'Error|❌': 'cancel'
        };
    }

    /**
     * Get thinking icon HTML based on content
     * Maps text patterns to Material Symbols icons
     * @param {string} text - The text to match against icon patterns
     * @param {Object} options - Configuration options
     * @param {string} options.defaultIcon - Default icon if no pattern matches (default: 'chat')
     * @param {boolean} options.includeIcon - Whether to include icon HTML (default: true)
     * @returns {string} HTML span element with icon
     */
    static getThinkingIcon(text, options = {}) {
        const { defaultIcon = 'chat', includeIcon = true } = options;
        const iconMap = this.getThinkingIconMap();

        // Try to find a matching pattern
        for (const [keywords, iconName] of Object.entries(iconMap)) {
            const patterns = keywords.split('|');
            if (patterns.some(pattern => text.includes(pattern))) {
                if (!includeIcon) return iconName;
                
                // Determine if this is a special icon that needs styling
                const isSuccess = iconName === 'check_circle';
                const isError = iconName === 'cancel';
                const isSpinning = iconName === 'settings';
                
                let classNames = 'material-symbols thinking-icon';
                if (isSuccess) classNames += ' success';
                if (isError) classNames += ' error';
                if (isSpinning) classNames += ' spinning';
                
                return `<span class="${classNames}">${iconName}</span>`;
            }
        }

        // Return default icon
        if (!includeIcon) return defaultIcon;
        return `<span class="material-symbols thinking-icon">${defaultIcon}</span>`;
    }
}
