/**
 * Frontend I18n Service - Loads translations from backend
 */
import { API_BASE_URL } from './config.js';

export class I18nService {
    constructor() {
        this.currentLanguage = 'en'; // Default to English
        this.translations = {};
        this.loadPromise = null;
    }

    /**
     * Initialize the i18n service and load translations
     * @param {string} language - Language code
     * @return {Promise}
     */
    async init(language = 'en') {
        this.currentLanguage = language;
        await this.loadTranslations(language);
        
        // Set the HTML lang attribute
        document.documentElement.lang = language;
        
        console.log(`🌐 I18n initialized with language: ${language}`);
        return this;
    }

    /**
     * Load translations from backend
     * @param {string} language - Language code
     * @return {Promise}
     */
    async loadTranslations(language) {
        if (this.loadPromise) {
            await this.loadPromise;
        }

        // If translations already loaded for this language, skip
        if (this.translations[language]) {
            return this.translations[language];
        }

        this.loadPromise = this.fetchTranslations(language);
        this.translations[language] = await this.loadPromise;
        this.loadPromise = null;
        
        return this.translations[language];
    }

    /**
     * Fetch translations from backend API
     * @param {string} language - Language code
     * @return {Promise<Object>}
     */
    async fetchTranslations(language) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/translations/${language}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch translations: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`Error fetching translations for ${language}:`, error);
            
            // Fallback to English if current language fails
            if (language !== 'en') {
                console.log('Falling back to English translations');
                return this.fetchTranslations('en');
            }
            
            // Return minimal fallback translations
            return this.getFallbackTranslations();
        }
    }

    /**
     * Get fallback translations when all else fails
     * @return {Object}
     */
    getFallbackTranslations() {
        return {
            app: {
                title: "The Otter - Enterprise Assistant",
                brand: "The Otter"
            },
            phases: {
                phase1: { label: "Normal Usage", status: "NORMAL" },
                phase2: { label: "Risky Usage", status: "RISK" },
                phase3: { label: "Protected Mode", status: "PROTECTED" }
            },
            chat: {
                placeholder: "Type your message here...",
                send: "Send",
                clear: "Clear Chat"
            },
            errors: {
                initError: "Failed to initialize",
                connectionError: "Connection error"
            }
        };
    }

    /**
     * Get translation for a key path (e.g., 'app.title')
     * @param {string} keyPath - Dot-separated key path
     * @param {Object} params - Optional parameters for interpolation
     * @return {string|Object}
     */
    t(keyPath, params = {}) {
        const translations = this.translations[this.currentLanguage];
        if (!translations) {
            console.warn(`No translations loaded for language: ${this.currentLanguage}`);
            return keyPath;
        }

        const keys = keyPath.split('.');
        let value = translations;

        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                console.warn(`Translation key not found: ${keyPath}`);
                return keyPath;
            }
        }

        // Handle parameter substitution if needed
        if (typeof value === 'string' && Object.keys(params).length > 0) {
            return this.interpolate(value, params);
        }

        return value;
    }

    /**
     * Simple parameter interpolation
     * @param {string} template - Template string with {{key}} placeholders
     * @param {Object} params - Parameters to substitute
     * @return {string}
     */
    interpolate(template, params) {
        return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
            return params[key] !== undefined ? params[key] : match;
        });
    }    /**
     * Update UI text based on current language
     */
    async updateUI() {
        const translations = this.translations[this.currentLanguage];
        if (!translations) return;

        // Update page title
        document.title = this.t('app.title');
        
        // Update brand text
        const brandText = document.getElementById('brand-text');
        if (brandText) {
            brandText.textContent = this.t('app.brand');
        }
        
        // Update all elements with data-i18n attributes
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            el.textContent = this.t(key);
        });
        
        // Update placeholders
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            el.placeholder = this.t(key);
        });
        
        // Update welcome message with user name interpolation
        const welcomeMessage = document.getElementById('welcome-message');
        if (welcomeMessage) {
            const userName = this.t('userProfile.name');
            welcomeMessage.textContent = this.t('chat.greeting', { name: userName });
        }
    }

    /**
     * Change the current language
     * @param {string} language - Language code
     * @return {Promise}
     */
    async changeLanguage(language) {
        if (language === this.currentLanguage) {
            return;
        }

        await this.loadTranslations(language);
        this.currentLanguage = language;
        
        // Update HTML lang attribute
        document.documentElement.lang = language;
        
        // Notify backend of language change
        try {
            await fetch(`${API_BASE_URL}/api/language`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ language })
            });
        } catch (error) {
            console.warn('Failed to notify backend of language change:', error);
        }

        // Trigger a custom event for other components to react
        window.dispatchEvent(new CustomEvent('languageChanged', { 
            detail: { language, translations: this.translations[language] }
        }));

        console.log(`🌐 Language changed to: ${language}`);
    }

    /**
     * Get the current language
     * @return {string}
     */
    getCurrentLanguage() {
        return this.currentLanguage;
    }

    /**
     * Get available languages from backend
     * @return {Promise<Array>}
     */
    async getAvailableLanguages() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/languages`);
            const data = await response.json();
            return data.languages?.map(lang => lang.code) || ['en']; // Extract language codes
        } catch (error) {
            console.error('Error fetching available languages:', error);
            return ['en']; // fallback to English only
        }
    }

    /**
     * Get native name for a language without affecting current language state
     * @param {string} langCode - Language code
     * @return {Promise<string>}
     */
    async getLanguageNativeName(langCode) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/languages`);
            if (!response.ok) {
                return langCode; // fallback to code itself
            }
            const data = await response.json();
            const language = data.languages?.find(lang => lang.code === langCode);
            return language?.nativeName || langCode;
        } catch (error) {
            console.error(`Error getting native name for ${langCode}:`, error);
            return langCode; // fallback to code itself
        }
    }
}

// Create a global instance
export const i18n = new I18nService();

// Make it globally available for non-module scripts
window.i18n = i18n;