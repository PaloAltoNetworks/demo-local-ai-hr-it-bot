const i18next = require('i18next');
const Backend = require('i18next-fs-backend');
const path = require('path');
const fs = require('fs');

/**
 * Auto-detect available languages from locales directory
 * @return {string[]} Array of language codes
 */
function getAvailableLanguagesFromFs() {
    try {
        const localesDir = path.join(process.cwd(), 'locales');
        const items = fs.readdirSync(localesDir, { withFileTypes: true });
        return items
            .filter(item => item.isDirectory())
            .map(item => item.name)
            .filter(name => {
                // Ensure both backend.json and frontend.json exist
                const backendFile = path.join(localesDir, name, 'backend.json');
                const frontendFile = path.join(localesDir, name, 'frontend.json');
                return fs.existsSync(backendFile) && fs.existsSync(frontendFile);
            })
            .sort();
    } catch (error) {
        console.error('Error reading locales directory:', error);
        return ['en']; // fallback
    }
}

// Initialize i18next with promise-based approach
const initI18n = async () => {
  console.log('Initializing i18next with available languages:', getAvailableLanguagesFromFs());
  
  return i18next
    .use(Backend)
    .init({
      lng: 'en', // default language
      fallbackLng: 'en', // fallback language
      debug: false, // set to true for debugging
      preload: getAvailableLanguagesFromFs(), // Preload all available languages
      
      backend: {
        // Load backend translation files from locales directory
        loadPath: path.join(process.cwd(), 'locales', '{{lng}}', 'backend.json'),
      },
      
      // Default namespace
      defaultNS: 'translation',
      ns: ['translation'],
      
      interpolation: {
        escapeValue: false // not needed for server-side
      }
    });
};

// Keep track of initialization status
let i18nInitialized = false;

// Initialize and track completion
initI18n()
  .then(() => {
    i18nInitialized = true;
    console.log('i18next initialized successfully with languages:', Object.keys(i18next.store.data));
  })
  .catch((error) => {
    console.error('❌ Failed to initialize i18next:', error);
    i18nInitialized = false;
  });

/**
 * Change the current language
 * @param {string} language - The language code (e.g., 'en', 'es')
 */
function changeLanguage(language) {
  return i18next.changeLanguage(language);
}

/**
 * Get translation for a key
 * @param {string} key - Translation key (e.g., 'systemPrompt.intro')
 * @param {Object|string} options - Options object or language string
 * @return {string} Translated text
 */
function t(key, options = null) {
  try {
    // Check if i18n is initialized
    if (!i18nInitialized || !i18next.isInitialized) {
      console.warn(`⚠️ i18next not fully initialized, falling back to key: ${key}`);
      return key;
    }
    
    // Handle different parameter formats
    let targetLanguage = null;
    let interpolationOptions = {};
    
    if (typeof options === 'string') {
      // Legacy format: t(key, 'en')
      targetLanguage = options;
    } else if (options && typeof options === 'object') {
      // Modern format: t(key, { lng: 'en', ... })
      targetLanguage = options.lng;
      interpolationOptions = options;
    }
    
    // Use target language if specified and different from current
    if (targetLanguage && targetLanguage !== i18next.language) {
      // Ensure the language is available
      if (!i18next.hasResourceBundle(targetLanguage, 'translation')) {
        console.warn(`Language '${targetLanguage}' not available, falling back to current language`);
        return i18next.t(key, interpolationOptions);
      }
      return i18next.getFixedT(targetLanguage)(key, interpolationOptions);
    }
    
    return i18next.t(key, interpolationOptions);
  } catch (error) {
    console.error(`Translation error for key '${key}':`, error);
    // Return the key itself as fallback
    return key;
  }
}

/**
 * Get current language
 * @return {string} Current language code
 */
function getCurrentLanguage() {
  return i18next.language;
}

/**
 * Get all available languages
 * @return {string[]} Array of language codes
 */
function getAvailableLanguages() {
  return getAvailableLanguagesFromFs();
}

/**
 * Load frontend translations for a specific language
 * @param {string} language - Language code
 * @return {Object} Frontend translations
 */
function loadFrontendTranslations(language) {
    try {
        const frontendPath = path.join(process.cwd(), 'locales', language, 'frontend.json');
        if (fs.existsSync(frontendPath)) {
            delete require.cache[require.resolve(frontendPath)]; // Clear cache
            return require(frontendPath);
        }
        throw new Error(`Frontend translations not found for language: ${language}`);
    } catch (error) {
        console.error(`Error loading frontend translations for ${language}:`, error);
        
        // Fallback to English if available
        if (language !== 'en') {
            return loadFrontendTranslations('en');
        }
        
        // Return minimal fallback
        return {
            app: { title: "The Otter", brand: "The Otter" },
            phases: { phase1: { label: "Normal Usage", status: "NORMAL" } },
            chat: { placeholder: "Type your message here...", send: "Send" },
            errors: { initError: "Failed to initialize" }
        };
    }
}

module.exports = {
  i18next,
  t,
  changeLanguage,
  getCurrentLanguage,
  getAvailableLanguages,
  loadFrontendTranslations
};