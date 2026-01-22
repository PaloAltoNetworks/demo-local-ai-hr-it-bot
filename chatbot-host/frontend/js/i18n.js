/**
 * @fileoverview Frontend I18n Service - Loads translations from backend
 *
 * @responsibilities
 * - Detect and manage user's preferred language
 * - Fetch and cache translations from backend API
 * - Provide translation lookup with interpolation support
 * - Update UI elements with translated content
 * - Handle RTL/LTR text direction
 * - Render phase-based example questions
 * - Manage language selector dropdown
 *
 * @dependencies
 * - apiService: API communication service for fetching translations
 *
 * @events
 * - Listens: 'phaseChanged' - Re-renders questions for new phase
 * - Dispatches: 'languageChanged' - When user changes language
 *
 * @version 1.0.0
 */

// ═══════════════════════════════════════════════════════════════════════════
// MODULE CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/** @type {string} LocalStorage key for persisting language preference */
const STORAGE_KEY = 'currentLanguage';

/** @type {string} Default fallback language code */
const DEFAULT_LANGUAGE = 'en';

// ═══════════════════════════════════════════════════════════════════════════
// CLASS DEFINITION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @class I18nService
 * @description Manages internationalization including language detection, translation loading,
 * UI updates, and question rendering. Supports RTL languages and parameter interpolation.
 *
 * @pattern Service/Manager
 *
 * @example
 * const i18n = new I18nService(apiService);
 * await i18n.init();
 * const greeting = i18n.t('chat.greeting', { name: 'John' });
 * await i18n.changeLanguage('es');
 */
class I18nService {

    // ═══════════════════════════════════════════════════════════════════════════
    // PRIVATE INSTANCE PROPERTIES
    // ═══════════════════════════════════════════════════════════════════════════

    /** @type {Object|null} API service for backend communication */
    #apiService;

    /** @type {string|null} Currently active language code */
    #currentLanguage;

    /** @type {Object} Cached translations keyed by language code */
    #translations;

    /** @type {Object|null} Cached languages API response */
    #cachedLanguagesData;

    /** @type {string|null} Current phase for question rendering */
    #currentPhase;

    /** @type {Object} Cached DOM element references */
    #elements;

    /** @type {Object} Bound event handler references for cleanup */
    #boundHandlers;

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Creates a new I18nService instance
     * @param {Object} apiService - API service for backend communication
     */
    constructor(apiService) {
        this.#apiService = apiService;
        this.#currentLanguage = null;
        this.#translations = {};
        this.#cachedLanguagesData = null;
        this.#currentPhase = null;
        this.#elements = {};
        this.#boundHandlers = {};
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // LIFECYCLE METHODS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Initializes the i18n service and loads translations
     * @async
     * @returns {Promise<I18nService>} This instance for chaining
     */
    async init() {
        this.#cacheElements();
        this.#bindEventHandlers();

        await this.#fetchSupportedLanguages();
        this.#currentLanguage = this.#detectLanguage();

        this.#populateLanguageSelect();
        await this.changeLanguage(this.#currentLanguage, true);

        this.#attachListeners();

        console.log(`[I18nService] Initialized with language: ${this.#currentLanguage}`);
        return this;
    }

    /**
     * Destroys the service and cleans up resources
     * @returns {void}
     */
    destroy() {
        this.#detachListeners();

        this.#currentLanguage = null;
        this.#translations = {};
        this.#cachedLanguagesData = null;
        this.#currentPhase = null;
        this.#elements = {};
        this.#boundHandlers = {};

        console.log('[I18nService] Destroyed');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PUBLIC API METHODS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Gets translation for a key path with optional interpolation
     * @param {string} keyPath - Dot-separated key path (e.g., 'app.title')
     * @param {Object} params - Optional parameters for interpolation
     * @returns {string|Object} Translated value or keyPath if not found
     * @example
     * i18n.t('chat.greeting', { name: 'John' }); // "Hello, John!"
     */
    t(keyPath, params = {}) {
        const translations = this.#translations[this.#currentLanguage];

        if (!translations) {
            console.warn(`[I18nService] No translations loaded for language: ${this.#currentLanguage}`);
            return keyPath;
        }

        const keys = keyPath.split('.');
        let value = translations;

        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                console.warn(`[I18nService] Translation key not found: ${keyPath}`);
                return keyPath;
            }
        }

        if (typeof value === 'string' && Object.keys(params).length > 0) {
            return this.#interpolate(value, params);
        }

        return value;
    }

    /**
     * Changes the current language and updates UI
     * @async
     * @param {string} language - Language code to switch to
     * @param {boolean} forceRender - Force UI update even if same language
     * @returns {Promise<void>}
     */
    async changeLanguage(language, forceRender = false) {
        if (language === this.#currentLanguage && !forceRender) {
            return;
        }

        this.#currentLanguage = language;
        await this.#loadTranslations(language);

        document.documentElement.lang = language;
        this.#updateTextDirection();
        this.#saveLangToLocalStorage();
        this.#updateUI();
        this.#emitLanguageChanged();
        this.#updateURLLanguageParam(language);

        console.log(`[I18nService] Language changed to: ${language}`);
    }

    /**
     * Re-applies current language settings and updates UI
     * Useful for refreshing translations after dynamic content changes
     * @async
     * @returns {Promise<void>}
     */
    async reapply() {
        if (!this.#currentLanguage) {
            console.warn('[I18nService] No language set to reapply');
            return;
        }

        await this.changeLanguage(this.#currentLanguage, true);
    }

    /**
     * Gets the current language code
     * @returns {string} Current language code
     */
    getCurrentLanguage() {
        return this.#currentLanguage;
    }

    /**
     * Gets questions for a specific phase
     * @param {string} phase - The phase to get questions for
     * @returns {Array} Array of question objects
     */
    getQuestions(phase) {
        try {
            const questions = this.t(`questions.${phase}`);

            if (!questions || !Array.isArray(questions)) {
                console.warn(`[I18nService] No questions found for phase: ${phase}`);
                return [];
            }

            return questions;
        } catch (error) {
            console.error(`[I18nService] Error getting questions for phase ${phase}:`, error);
            return [];
        }
    }

    /**
     * Renders example questions for a phase into a container
     * @param {string} phase - The phase to render questions for
     * @param {HTMLElement} container - The container element to render into
     * @param {Function} onQuestionClick - Callback when a question is clicked
     * @returns {void}
     */
    renderQuestions(phase, container, onQuestionClick) {
        if (!container) return;

        const questions = this.getQuestions(phase);
        container.innerHTML = '';

        if (questions.length === 0) {
            console.warn(`[I18nService] No questions available for phase ${phase}`);
            return;
        }

        const fragment = document.createDocumentFragment();

        questions.forEach(question => {
            if (question.questions && Array.isArray(question.questions)) {
                const subgroupElement = this.#createSubgroupElement(question, phase, onQuestionClick);
                fragment.appendChild(subgroupElement);
            } else {
                const questionElement = this.#createQuestionElement(question, phase, onQuestionClick);
                fragment.appendChild(questionElement);
            }
        });

        container.appendChild(fragment);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENT HANDLERS (PRIVATE)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Handles phase change event for question rendering
     * @private
     * @param {CustomEvent} event - Phase change event
     * @returns {void}
     */
    #onPhaseChanged(event) {
        const { phase } = event.detail;
        this.#currentPhase = phase;
        this.renderQuestions(phase, this.#elements.questionsContainer, (text) => this.#handleQuestionClick(text));
    }

    /**
     * Handles language change event for question re-rendering
     * @private
     * @returns {void}
     */
    #onLanguageChangedForQuestions() {
        if (this.#currentPhase && this.#elements.questionsContainer) {
            this.renderQuestions(this.#currentPhase, this.#elements.questionsContainer, (text) => this.#handleQuestionClick(text));
        }
    }

    /**
     * Handles language select dropdown change
     * @private
     * @param {Event} event - Change event from select element
     * @returns {Promise<void>}
     */
    async #onLanguageSelectChange(event) {
        const selectedLanguage = event.target.value;

        if (selectedLanguage && selectedLanguage !== this.#currentLanguage) {
            await this.changeLanguage(selectedLanguage);
        }
    }

    /**
     * Handles question click - sets input value and focuses
     * @private
     * @param {string} questionText - The question text to set
     * @returns {void}
     */
    #handleQuestionClick(questionText) {
        if (this.#elements.chatInput) {
            this.#elements.chatInput.value = questionText;
            this.#elements.chatInput.focus();
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DOM OPERATIONS (PRIVATE)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Caches DOM element references
     * @private
     * @returns {void}
     */
    #cacheElements() {
        this.#elements = {
            welcomeMessage: document.getElementById('welcome-message'),
            languageSelect: document.getElementById('userMenuLanguageSelect'),
            questionsContainer: document.getElementById('questions-container'),
            chatInput: document.getElementById('chatInput')
        };
    }

    /**
     * Updates document direction based on language translations
     * @private
     * @returns {void}
     */
    #updateTextDirection() {
        const translations = this.#translations[this.#currentLanguage];
        const direction = translations?.language?.dir || 'ltr';
        document.documentElement.dir = direction;
        document.body.dir = direction;
    }

    /**
     * Updates all UI elements with current translations
     * @private
     * @returns {void}
     */
    #updateUI() {
        document.title = this.t('app.title');

        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const target = el.getAttribute('data-i18n-target') || 'text';
            const translation = this.t(key);

            if (target === 'placeholder') {
                el.placeholder = translation;
            } else if (target === 'value') {
                el.value = translation;
            } else {
                const existingIcon = el.querySelector('i');

                if (existingIcon && el.classList.contains('token-label')) {
                    const iconHTML = existingIcon.outerHTML;
                    el.innerHTML = iconHTML + ' ' + translation + ':';
                } else {
                    el.textContent = translation;
                }
            }
        });

        if (this.#elements.welcomeMessage) {
            const userName = this.t('userProfile.name');
            this.#elements.welcomeMessage.textContent = this.t('chat.greeting', { name: userName });
        }
    }

    /**
     * Populates language selector dropdown with available languages
     * @private
     * @returns {void}
     */
    #populateLanguageSelect() {
        if (!this.#elements.languageSelect || !this.#cachedLanguagesData?.languages) return;

        const languages = this.#cachedLanguagesData.languages;
        this.#elements.languageSelect.innerHTML = '';

        const fragment = document.createDocumentFragment();

        languages.forEach(lang => {
            const option = document.createElement('option');
            option.value = lang.code;
            option.textContent = lang.nativeName || lang.name || lang.code;
            fragment.appendChild(option);
        });

        this.#elements.languageSelect.appendChild(fragment);
        this.#elements.languageSelect.value = this.#currentLanguage;
    }

    /**
     * Creates a subgroup element with nested questions
     * @private
     * @param {Object} subgroup - Subgroup data with title, icon, and questions array
     * @param {string} phase - Current phase
     * @param {Function} onQuestionClick - Callback when a question is clicked
     * @returns {HTMLElement} The subgroup element
     */
    #createSubgroupElement(subgroup, phase, onQuestionClick) {
        const subgroupDiv = document.createElement('div');
        subgroupDiv.className = 'questions-subgroup';

        const header = document.createElement('div');
        header.className = 'subgroup-header';
        header.innerHTML = `<h3>${this.#getIconHTML(subgroup.icon)}${subgroup.title}</h3>`;
        subgroupDiv.appendChild(header);

        const questionsContainer = document.createElement('div');
        questionsContainer.className = 'subgroup-questions';

        subgroup.questions.forEach(question => {
            const questionElement = this.#createQuestionElement(question, phase, onQuestionClick);
            questionsContainer.appendChild(questionElement);
        });

        subgroupDiv.appendChild(questionsContainer);
        return subgroupDiv;
    }

    /**
     * Creates a question element with click handler
     * @private
     * @param {Object} question - Question data with title, text, icon, and optional action
     * @param {string} phase - Current phase
     * @param {Function} onQuestionClick - Callback when a question is clicked
     * @returns {HTMLElement} The question element
     */
    #createQuestionElement(question, phase, onQuestionClick) {
        const questionDiv = document.createElement('div');
        questionDiv.className = 'example-question';

        if (question.action === 'refresh') {
            questionDiv.classList.add('action-question');
            questionDiv.setAttribute('data-action', 'refresh');
        } else {
            questionDiv.setAttribute('data-question', question.text);
        }

        questionDiv.innerHTML = `
            <h4>${this.#getIconHTML(question.icon)}${question.title}</h4>
            <p>${question.text}</p>
        `;

        questionDiv.addEventListener('click', () => {
            if (question.action === 'refresh') {
                if (phase) {
                    localStorage.setItem('currentPhase', phase);
                }
                window.location.reload();
            } else if (onQuestionClick) {
                onQuestionClick(question.text);
            }
        });

        return questionDiv;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENT LISTENER MANAGEMENT (PRIVATE)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Binds event handlers to preserve context
     * @private
     * @returns {void}
     */
    #bindEventHandlers() {
        this.#boundHandlers = {
            phaseChanged: this.#onPhaseChanged.bind(this),
            languageChangedForQuestions: this.#onLanguageChangedForQuestions.bind(this),
            languageSelectChange: this.#onLanguageSelectChange.bind(this)
        };
    }

    /**
     * Attaches all event listeners
     * @private
     * @returns {void}
     */
    #attachListeners() {
        window.addEventListener('phaseChanged', this.#boundHandlers.phaseChanged);
        window.addEventListener('languageChanged', this.#boundHandlers.languageChangedForQuestions);
        this.#elements.languageSelect?.addEventListener('change', this.#boundHandlers.languageSelectChange);
    }

    /**
     * Detaches all event listeners
     * @private
     * @returns {void}
     */
    #detachListeners() {
        window.removeEventListener('phaseChanged', this.#boundHandlers.phaseChanged);
        window.removeEventListener('languageChanged', this.#boundHandlers.languageChangedForQuestions);
        this.#elements.languageSelect?.removeEventListener('change', this.#boundHandlers.languageSelectChange);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PRIVATE HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Detects user's preferred language from various sources
     * @private
     * @returns {string} Detected language code
     */
    #detectLanguage() {
        const supportedCodes = this.#cachedLanguagesData?.languages?.map(l => l.code) || [DEFAULT_LANGUAGE];

        const urlParams = new URLSearchParams(window.location.search);
        const urlLang = urlParams.get('lang');
        if (urlLang && supportedCodes.includes(urlLang)) {
            return urlLang;
        }

        const savedLang = this.#loadLangFromLocalStorage();
        if (savedLang && supportedCodes.includes(savedLang)) {
            return savedLang;
        }

        const browserLang = navigator.language?.substring(0, 2).toLowerCase();
        if (browserLang && supportedCodes.includes(browserLang)) {
            return browserLang;
        }

        return supportedCodes.includes(DEFAULT_LANGUAGE) ? DEFAULT_LANGUAGE : supportedCodes[0];
    }

    /**
     * Fetches supported languages from backend API (cached)
     * @private
     * @async
     * @returns {Promise<Object>} Languages data from API
     * @throws {Error} When API request fails
     */
    async #fetchSupportedLanguages() {
        if (this.#cachedLanguagesData) {
            return this.#cachedLanguagesData;
        }

        try {
            this.#cachedLanguagesData = await this.#apiService.get('/api/languages');
            return this.#cachedLanguagesData;
        } catch (error) {
            console.error('[I18nService] Error fetching supported languages:', error);
            throw error;
        }
    }

    /**
     * Loads translations for a specific language
     * @private
     * @async
     * @param {string} language - Language code to load
     * @returns {Promise<Object>} Translations object
     */
    async #loadTranslations(language) {
        if (this.#translations[language]) {
            return this.#translations[language];
        }

        this.#translations[language] = await this.#fetchTranslations(language);
        return this.#translations[language];
    }

    /**
     * Fetches translations from backend API
     * @private
     * @async
     * @param {string} language - Language code to fetch
     * @returns {Promise<Object>} Translations data
     * @throws {Error} When API request fails and no fallback available
     */
    async #fetchTranslations(language) {
        try {
            return await this.#apiService.get(`/api/translations/${language}`);
        } catch (error) {
            console.error(`[I18nService] Error fetching translations for ${language}:`, error);

            if (language !== DEFAULT_LANGUAGE) {
                console.log(`[I18nService] Falling back to ${DEFAULT_LANGUAGE} translations`);
                return this.#fetchTranslations(DEFAULT_LANGUAGE);
            }

            throw error;
        }
    }

    /**
     * Saves current language to localStorage
     * @private
     * @returns {void}
     */
    #saveLangToLocalStorage() {
        try {
            if (!this.#currentLanguage) {
                throw new Error('[I18nService] Cannot save language: currentLanguage is not set');
            }
            localStorage.setItem(STORAGE_KEY, this.#currentLanguage);
        } catch (error) {
            console.error('[I18nService] Error saving language to localStorage:', error);
        }
    }

    /**
     * Loads language from localStorage
     * @private
     * @returns {string|null} Saved language code or null
     */
    #loadLangFromLocalStorage() {
        try {
            return localStorage.getItem(STORAGE_KEY);
        } catch (error) {
            console.error('[I18nService] Error loading language from localStorage:', error);
            return null;
        }
    }

    /**
     * Emits language changed event to notify other components
     * @private
     * @returns {void}
     */
    #emitLanguageChanged() {
        window.dispatchEvent(new CustomEvent('languageChanged', {
            detail: { language: this.#currentLanguage }
        }));
    }

    /**
     * Updates URL with current language parameter
     * @private
     * @param {string} language - Language code to set in URL
     * @returns {void}
     */
    #updateURLLanguageParam(language) {
        const url = new URL(window.location);
        url.searchParams.set('lang', language);
        window.history.replaceState({}, '', url);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // UTILITY METHODS (PRIVATE)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Interpolates parameters into a template string
     * @private
     * @param {string} template - Template with {{key}} placeholders
     * @param {Object} params - Parameters to substitute
     * @returns {string} Interpolated string
     */
    #interpolate(template, params) {
        return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
            return params[key] !== undefined ? params[key] : match;
        });
    }

    /**
     * Parses icon string and returns HTML
     * @private
     * @param {string} iconString - Icon string (e.g., "material-symbols:icon_name")
     * @returns {string} HTML string for the icon
     */
    #getIconHTML(iconString) {
        if (!iconString) return '';

        if (iconString.includes(':')) {
            const [className, iconName] = iconString.split(':');
            return `<span class="${className}">${iconName}</span>`;
        }

        return `<span class="material-symbols">${iconString}</span>`;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export { I18nService };