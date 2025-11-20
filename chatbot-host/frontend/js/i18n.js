/**
 * Frontend I18n Service - Loads translations from backend
 */
export class I18nService {
    constructor(apiService) {
        this.apiService = apiService;
        this.supportedLanguages = null; // Will be fetched during init
        this.currentLanguage = this.detectLanguage(); // Detect on construction
        this.translations = {};
        this.loadPromise = null;
    }

    /**
     * Detect user's preferred language
     * Priority: URL params > localStorage > browser language (if supported) > default (English)
     */
    detectLanguage() {
        // 1. Check URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const urlLang = urlParams.get('lang');
        if (urlLang) return urlLang;

        // 2. Check localStorage
        const savedLang = localStorage.getItem('chatbot-language');
        if (savedLang) return savedLang;

        // 3. Check browser language (if supported languages are loaded)
        // Browser language format is typically 'en-US', we extract the base language code
        const browserLang = navigator.language?.substring(0, 2).toLowerCase();
        if (browserLang && this.supportedLanguages && this.supportedLanguages.includes(browserLang)) {
            return browserLang;
        }

        // 4. Default to English
        return 'en';
    }

    /**
     * Initialize the i18n service and load translations
     * @param {string} language - Language code (optional, uses detected if not provided)
     * @return {Promise}
     */
    async init(language = null) {
        // Fetch supported languages from backend first
        try {
            const data = await this.apiService.get('/api/languages');
            if (data.languages && Array.isArray(data.languages)) {
                this.supportedLanguages = data.languages.map(lang => lang.code);
            }
        } catch (error) {
            console.warn('Failed to fetch supported languages, using defaults:', error);
            // Fallback to common languages
            this.supportedLanguages = ['en', 'es', 'fr', 'de', 'ja'];
        }

        // Now detect language with knowledge of supported languages
        if (language) {
            this.currentLanguage = language;
        } else {
            this.currentLanguage = this.detectLanguage();
        }
        
        await this.loadTranslations(this.currentLanguage);
        
        // Set the HTML lang attribute
        document.documentElement.lang = this.currentLanguage;
        
        // Automatically populate language select if it exists
        const languageSelect = document.getElementById('userMenuLanguageSelect');
        if (languageSelect) {
            await this.populateLanguageSelect(languageSelect);
        }
        
        console.log(`I18n initialized with language: ${this.currentLanguage}`);
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
            const data = await this.apiService.get(`/api/translations/${language}`);
            return data;
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
        
        // Save to localStorage
        localStorage.setItem('chatbot-language', language);

        // Update URL without reload
        const url = new URL(window.location);
        url.searchParams.set('lang', language);
        window.history.replaceState({}, '', url);
        
        // Update API service language
        this.apiService.setLanguage(language);
        
        // Notify backend of language change
        try {
            await this.apiService.post('/api/language', { language });
        } catch (error) {
            console.warn('Failed to notify backend of language change:', error);
        }

        // Trigger a custom event for other components to react
        window.dispatchEvent(new CustomEvent('languageChanged', { 
            detail: { language, translations: this.translations[language] }
        }));

        console.log(`Language changed to: ${language}`);
    }

    /**
     * Get the current language
     * @return {string}
     */
    getCurrentLanguage() {
        return this.currentLanguage;
    }

    /**
     * Update all UI elements based on current language
     * Single entry point for all UI translations
     * Supports both textContent and placeholder attributes via data-i18n-target
     * @return {void}
     */
    updateUI() {
        // Update page title
        document.title = this.t('app.title');

        // Update brand text
        const brandText = document.getElementById('brand-text');
        if (brandText) {
            brandText.textContent = this.t('app.brand');
        }

        // Update all elements with data-i18n attribute
        // Each element can specify target: 'text' (default), 'placeholder', or 'value'
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const target = el.getAttribute('data-i18n-target') || 'text'; // Default to text
            const translation = this.t(key);
            
            if (target === 'placeholder') {
                el.placeholder = translation;
            } else if (target === 'value') {
                el.value = translation;
            } else {
                // target === 'text' or default
                // Check if element contains an icon (for token labels)
                const existingIcon = el.querySelector('i');
                if (existingIcon && el.classList.contains('token-label')) {
                    // Preserve the icon, update text
                    const iconHTML = existingIcon.outerHTML;
                    el.innerHTML = iconHTML + ' ' + translation + ':';
                } else {
                    // Regular text update
                    el.textContent = translation;
                }
            }
        });

        // Update welcome message with user name interpolation
        const welcomeMessage = document.getElementById('welcome-message');
        if (welcomeMessage) {
            const userName = this.t('userProfile.name');
            welcomeMessage.textContent = this.t('chat.greeting', { name: userName });
        }
    }

    /**
     * Fetch and populate language options in a select element
     * @param {HTMLSelectElement} selectElement - The select element to populate
     * @return {Promise<void>}
     */
    async populateLanguageSelect(selectElement) {
        if (!selectElement) return;

        try {
            const data = await this.apiService.get('/api/languages');
            
            if (data.languages && Array.isArray(data.languages)) {
                // Clear existing options
                selectElement.innerHTML = '';
                
                // Add options for each language
                data.languages.forEach(lang => {
                    const option = document.createElement('option');
                    option.value = lang.code;
                    option.textContent = lang.nativeName || lang.name || lang.code;
                    selectElement.appendChild(option);
                });

                // Set current language as selected
                selectElement.value = this.currentLanguage;

                // Setup change listener
                selectElement.addEventListener('change', this.onLanguageSelectChange.bind(this));
            }
        } catch (error) {
            console.error('Error fetching available languages:', error);
        }
    }

    /**
     * Handle language select change event
     */
    async onLanguageSelectChange(event) {
        const selectedLanguage = event.target.value;
        if (selectedLanguage && selectedLanguage !== this.currentLanguage) {
            await this.changeLanguage(selectedLanguage);
        }
    }
}

// Export the class (instance creation happens in app.js with apiService dependency)
// This allows proper dependency injection