import i18next from 'i18next';
import Backend from 'i18next-fs-backend';
import path from 'path';
import fs from 'fs';
import { getLogger } from './logger.js';

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
        console.error('Error reading locales directory:', error.message);
        return ['en']; // fallback
    }
}

// Initialize i18next with promise-based approach
const initI18n = async () => {
  try {
    getLogger().info('Initializing i18next with available languages: ' + getAvailableLanguagesFromFs().join(', '));
  } catch (e) {
    console.info('Initializing i18next (logger not yet available)');
  }
  
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
let initPromise = null;

/**
 * Initialize i18n module - must be called after logger is initialized
 * @return {Promise} Promise that resolves when initialization is complete
 */
export function initializeI18n() {
  if (initPromise) {
    return initPromise;
  }

  // Initialize and track completion
  initPromise = initI18n()
    .then(() => {
      i18nInitialized = true;
      try {
        getLogger().info('i18next initialized successfully with languages: ' + Object.keys(i18next.store.data).join(', '));
      } catch (e) {
        console.info('i18next initialized successfully');
      }
      return true;
    })
    .catch((error) => {
      try {
        getLogger().error('Failed to initialize i18next: ' + error.message);
      } catch (e) {
        console.error('Failed to initialize i18next:', error.message);
      }
      i18nInitialized = false;
      throw error;
    });

  return initPromise;
}

/**
 * Ensure i18next is initialized before using it
 * @return {Promise} Promise that resolves when initialization is complete
 */
export function ensureI18nInitialized() {
  if (i18nInitialized) {
    return Promise.resolve();
  }
  if (initPromise) {
    return initPromise;
  }
  return initializeI18n();
}

/**
 * Change the current language
 * @param {string} language - The language code (e.g., 'en', 'es')
 */
export async function changeLanguage(language) {
  // Ensure i18next is initialized first
  await ensureI18nInitialized();
  
  if (!i18next.isInitialized) {
    getLogger().warn('i18next not fully initialized, cannot change language to: ' + language);
    return Promise.resolve();
  }
  return i18next.changeLanguage(language);
}

/**
 * Get translation for a key
 * @param {string} key - Translation key (e.g., 'systemPrompt.intro')
 * @param {Object|string} options - Options object or language string
 * @return {string|Promise} Translated text or promise if not yet initialized
 */
export async function t(key, options = null) {
  try {
    // Ensure i18next is initialized first
    await ensureI18nInitialized();
    
    // Check if i18n is initialized
    if (!i18next.isInitialized) {
      getLogger().warn('i18next not fully initialized, falling back to key: ' + key);
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
        getLogger().warn('Language ' + targetLanguage + ' not available, falling back to current language');
        return i18next.t(key, interpolationOptions);
      }
      return i18next.getFixedT(targetLanguage)(key, interpolationOptions);
    }
    
    return i18next.t(key, interpolationOptions);
  } catch (error) {
    getLogger().error('Translation error for key ' + key + ': ' + error.message);
    // Return the key itself as fallback
    return key;
  }
}

/**
 * Get current language
 * @return {string} Current language code
 */
export function getCurrentLanguage() {
  return i18next.language;
}

/**
 * Get all available languages
 * @return {string[]} Array of language codes
 */
export function getAvailableLanguages() {
  return getAvailableLanguagesFromFs();
}

/**
 * Load frontend translations for a specific language
 * @param {string} language - Language code
 * @return {Object} Frontend translations
 */
export function loadFrontendTranslations(language) {
    try {
        const frontendPath = path.join(process.cwd(), 'locales', language, 'frontend.json');
        if (fs.existsSync(frontendPath)) {
            const data = fs.readFileSync(frontendPath, 'utf-8');
            return JSON.parse(data);
        }
        throw new Error('Frontend translations not found for language: ' + language);
    } catch (error) {
        getLogger().error('Error loading frontend translations for ' + language + ': ' + error.message);
        
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

export { i18next };
