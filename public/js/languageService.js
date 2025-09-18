/**
 * Frontend Language Service
 * Manages translations and language switching for the client-side application
 */
class FrontendLanguageService {
  constructor() {
    this.currentLanguage = 'en'; // Default to English
    this.supportedLanguages = ['en']; // Start with minimal fallback until server config loads
    this.languageNames = { 'en': 'English' }; // Cache for language display names
    this.serverConfig = null;
    this.translations = window.translations || {};
    this.isInitialized = false;
    
    this.init();
  }

  /**
   * Initialize the language service
   */
  async init() {
    try {
      // First, discover available languages from server
      await this.discoverSupportedLanguages();
      
      console.log('Dynamically discovered languages:', this.supportedLanguages);
      
      // Then detect and load preferred language (now with correct supported languages)
      this.currentLanguage = this.detectBrowserLanguage();
      
      // Load the preferred language, fallback to English if it fails
      const loadSuccess = await this.loadLanguageFile(this.currentLanguage);
      if (!loadSuccess && this.currentLanguage !== 'en') {
        console.warn(`Failed to load ${this.currentLanguage}, falling back to English`);
        this.currentLanguage = 'en';
        await this.loadLanguageFile('en');
      }
      
      // Finally, populate selector with the loaded language selected
      this.populateLanguageSelector();
      this.updateUI();
      this.isInitialized = true;
    } catch (error) {
      console.error('Error initializing language service:', error);
    }
  }

  /**
   * Discover supported languages from server without UI updates
   */
  async discoverSupportedLanguages() {
    try {
      const response = await fetch('/api/language/names');
      if (response.ok) {
        const languageNames = await response.json();
        const availableLanguages = Object.keys(languageNames);
        if (availableLanguages.length > 0) {
          this.supportedLanguages = availableLanguages;
          this.languageNames = languageNames; // Cache the display names
        }
      }
    } catch (error) {
      console.warn('Failed to discover supported languages, using fallback:', error);
      // Keep the default ['en'] fallback
    }
  }



  /**
   * Detect browser language and return supported one or fallback
   */
  detectBrowserLanguage() {
    // Check localStorage first
    const savedLang = localStorage.getItem('laloutre-language');
    if (savedLang && this.supportedLanguages.includes(savedLang)) {
      return savedLang;
    }

    // Check browser language
    const browserLang = (navigator.language || navigator.userLanguage || 'en')
      .substring(0, 2).toLowerCase();
    
    return this.supportedLanguages.includes(browserLang) ? browserLang : 'en';
  }



  /**
   * Dynamically load translations for a language from the unified backend files
   * Clears previous translations to keep only one language in memory
   */
  async loadLanguageFile(langCode) {
    try {
      const response = await fetch(`/api/language/translations/${langCode}`);
      if (!response.ok) {
        throw new Error(`Failed to load translations: ${langCode}`);
      }
      
      // Get the JSON translations (frontend section from unified language files)
      const translations = await response.json();
      
      // Clear all previous translations and store only the current one
      window.translations = {
        [langCode]: translations
      };
      
      console.log(`Successfully loaded translations for: ${langCode} (cleared previous)`);
      return true;
    } catch (error) {
      console.warn(`Failed to load translations for ${langCode}:`, error);
      return false;
    }
  }



  /**
   * Set the current language and update the UI
   */
  async setLanguage(langCode) {
    if (!this.supportedLanguages.includes(langCode)) {
      console.warn(`Language ${langCode} not supported, falling back to ${this.currentLanguage}`);
      return false;
    }

    const previousLanguage = this.currentLanguage;
    this.currentLanguage = langCode;

    // Save to localStorage
    localStorage.setItem('laloutre-language', langCode);

    // Update UI if language actually changed
    if (previousLanguage !== langCode) {
      await this.loadLanguageFile(langCode); // Load new language (clears previous)
      this.populateLanguageSelector(); // Update selector with proper display names
      this.updateUI();
      
      console.log(`Language switched: ${previousLanguage} → ${langCode}. Loaded in memory:`, this.getLoadedLanguages());
      
      // Dispatch language change event
      window.dispatchEvent(new CustomEvent('languageChanged', {
        detail: { 
          previousLanguage, 
          currentLanguage: langCode,
          translations: this.getTranslations()
        }
      }));
    }

    return true;
  }



  /**
   * Get text for a key path with optional variable interpolation
   */
  getText(keyPath, variables = {}) {
    const translations = this.getTranslations();
    
    // Navigate through object using dot notation
    const keys = keyPath.split('.');
    let result = translations;
    
    for (const key of keys) {
      if (result && typeof result === 'object' && key in result) {
        result = result[key];
      } else {
        console.warn(`Translation key not found: ${keyPath} for language ${this.currentLanguage}`);
        return keyPath; // Return the key path as fallback
      }
    }
    
    // If result is not a string, return the key path
    if (typeof result !== 'string') {
      console.warn(`Translation result is not a string for: ${keyPath}`);
      return keyPath;
    }
    
    // Replace variables using {variable} syntax
    return this.interpolate(result, variables);
  }

  /**
   * Interpolate variables in text
   */
  interpolate(text, variables = {}) {
    return text.replace(/{(\w+)}/g, (match, key) => {
      return variables[key] !== undefined ? variables[key] : match;
    });
  }

  /**
   * Get current translations object
   */
  getTranslations() {
    // Since we only keep one language loaded at a time, return the current one
    if (!window.translations) {
      window.translations = {};
    }
    
    return window.translations[this.currentLanguage] || {};
  }

  /**
   * Debug method to show loaded languages in memory
   */
  getLoadedLanguages() {
    if (!window.translations) return [];
    return Object.keys(window.translations);
  }

  /**
   * Get current language code
   */
  getCurrentLanguage() {
    return this.currentLanguage;
  }

  /**
   * Get list of supported languages
   */
  getSupportedLanguages() {
    return [...this.supportedLanguages];
  }

  /**
   * Update UI elements with current language
   */
  updateUI() {
    this.updateDocumentLanguage();
    this.updateTextElements();
    this.updatePlaceholders();
    this.updateAriaLabels();
  }

  /**
   * Update document language attribute
   */
  updateDocumentLanguage() {
    document.documentElement.lang = this.currentLanguage;
    document.title = this.getText('pageTitle');
  }

  /**
   * Update all text elements that have data-i18n attribute
   */
  updateTextElements() {
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(element => {
      const key = element.getAttribute('data-i18n');
      if (key) {
        element.textContent = this.getText(key);
      }
    });
  }

  /**
   * Update placeholder texts
   */
  updatePlaceholders() {
    const elements = document.querySelectorAll('[data-i18n-placeholder]');
    elements.forEach(element => {
      const key = element.getAttribute('data-i18n-placeholder');
      if (key) {
        element.placeholder = this.getText(key);
      }
    });
  }

  /**
   * Update ARIA labels for accessibility
   */
  updateAriaLabels() {
    const elements = document.querySelectorAll('[data-i18n-aria-label]');
    elements.forEach(element => {
      const key = element.getAttribute('data-i18n-aria-label');
      if (key) {
        element.setAttribute('aria-label', this.getText(key));
      }
    });
  }

  /**
   * Populate the language selector with available languages using cached data
   */
  populateLanguageSelector() {
    const selector = document.getElementById('language-selector');
    if (!selector) return;

    // Clear existing options
    selector.innerHTML = '';

    // Add option for each supported language using cached names
    this.supportedLanguages.forEach(langCode => {
      const option = document.createElement('option');
      option.value = langCode;
      option.textContent = this.languageNames[langCode] || langCode.toUpperCase();
      
      // Mark current language as selected
      if (langCode === this.currentLanguage) {
        option.selected = true;
      }
      
      selector.appendChild(option);
    });
  }




}

// Create global instance
window.languageService = new FrontendLanguageService();