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
     * Debounce function
     */
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
}
