// Simple language detection without external dependencies to avoid Jest ES module issues
// const franc = require('franc');
const fs = require('fs');
const path = require('path');
const express = require('express');

class LanguageService {
  constructor() {
    this.defaultLanguage = process.env.DEFAULT_LANGUAGE || 'en'; // Changed to English as default
    this.DEFAULT_LANGUAGES = ['en', 'fr']; // Fallback supported languages
    this.translations = {};
    this.loadTranslations();
    // Auto-detect supported languages from available files
    this.supportedLanguages = this.detectSupportedLanguages();
  }

  /**
   * Auto-detect supported languages by scanning the languages directory
   */
  detectSupportedLanguages() {
    try {
      const languagesDir = path.join(__dirname, '..', 'languages');
      const files = fs.readdirSync(languagesDir);
      
      // Get language codes from .js files
      const languages = files
        .filter(file => file.endsWith('.js'))
        .map(file => file.replace('.js', ''))
        .sort(); // Sort alphabetically for consistency
      
      console.log('Auto-detected supported languages:', languages);
      return languages;
    } catch (error) {
      console.warn('Could not auto-detect languages, using fallback:', error.message);
      return this.DEFAULT_LANGUAGES; // Fallback to basic languages
    }
  }

  /**
   * Load all language translation files dynamically
   */
  loadTranslations() {
    try {
      const languagesDir = path.join(__dirname, '..', 'languages');
      
      // Check if languages directory exists
      if (!fs.existsSync(languagesDir)) {
        throw new Error('Languages directory not found');
      }
      
      const files = fs.readdirSync(languagesDir);
      const jsFiles = files.filter(file => file.endsWith('.js'));
      
      if (jsFiles.length === 0) {
        throw new Error('No language files found');
      }
      
      // Load each language file
      jsFiles.forEach(file => {
        const langCode = file.replace('.js', '');
        try {
          this.translations[langCode] = require(path.join(languagesDir, file));
          console.log(`Loaded language: ${langCode}`);
        } catch (fileError) {
          console.error(`Error loading language file ${file}:`, fileError.message);
        }
      });
      
      console.log(`Language translations loaded successfully. Available: ${Object.keys(this.translations).join(', ')}`);
    } catch (error) {
      console.error('Error loading language files:', error.message);
      // Fallback to basic messages if files can't be loaded
      this.translations = this.getFallbackTranslations();
    }
  }

  /**
   * Get fallback translations in case language files can't be loaded
   */
  getFallbackTranslations() {
    return {
      en: {
        general: {
          error: 'Sorry, an error occurred. Please try again.',
          notFound: 'Information not found.',
        },
        errors: {
          textRequired: 'Text required',
          employeeNotFound: 'Employee not found'
        }
      },
      fr: {
        general: {
          error: 'Désolé, une erreur s\'est produite. Veuillez réessayer.',
          notFound: 'Information non trouvée.',
        },
        errors: {
          textRequired: 'Texte requis',
          employeeNotFound: 'Employé non trouvé'
        }
      }
    };
  }
  
  /**
   * Detect language from text using simple keyword matching
   * @param {string} text - Text to analyze
   * @returns {string} - Detected language code (en or fr)
   */
  detectLanguage(text) {
    if (!text || text.trim().length < 3) {
      return this.defaultLanguage;
    }
    
    try {
      const lowerText = text.toLowerCase();
      
      // Get language indicators from translation files
      const frenchIndicators = this.translations.fr?.languageIndicators || [];
      const englishIndicators = this.translations.en?.languageIndicators || [];
      
      let frenchScore = 0;
      let englishScore = 0;
      
      frenchIndicators.forEach(indicator => {
        if (lowerText.includes(indicator)) {
          frenchScore += indicator.length;
        }
      });
      
      englishIndicators.forEach(indicator => {
        if (lowerText.includes(indicator)) {
          englishScore += indicator.length;
        }
      });
      
      // Return detected language or default
      if (frenchScore > englishScore) {
        return 'fr';
      } else if (englishScore > frenchScore) {
        return 'en';
      } else {
        return this.defaultLanguage;
      }
    } catch (error) {
      console.warn('Language detection error:', error);
      return this.defaultLanguage;
    }
  }
  
  /**
   * Get localized text using dot notation path
   * @param {string} path - Path to the text (e.g., 'general.greeting', 'errors.textRequired')
   * @param {string} language - Language code
   * @param {object} variables - Variables to interpolate in the text
   * @returns {string} - Localized text
   */
  getText(path, language = this.defaultLanguage, variables = {}) {
    const lang = this.supportedLanguages.includes(language) ? language : this.defaultLanguage;
    const translation = this.translations[lang];
    
    if (!translation) {
      console.warn(`Translation not found for language: ${lang}`);
      return path;
    }
    
    // Navigate through the object using dot notation
    const pathArray = path.split('.');
    let result = translation;
    
    for (const key of pathArray) {
      if (result && typeof result === 'object' && key in result) {
        result = result[key];
      } else {
        console.warn(`Translation path not found: ${path} for language: ${lang}`);
        return path;
      }
    }
    
    // If result is not a string, return the path as fallback
    if (typeof result !== 'string') {
      console.warn(`Translation result is not a string for path: ${path}`);
      return path;
    }
    
    // Replace variables in the text
    return this.interpolate(result, variables);
  }

  /**
   * Get localized messages based on language (legacy method for backwards compatibility)
   * @param {string} key - Message key
   * @param {string} language - Language code
   * @returns {string} - Localized message
   */
  getMessage(key, language = this.defaultLanguage) {
    return this.getText(`general.${key}`, language);
  }

  /**
   * Interpolate variables in text
   * @param {string} text - Text with placeholders
   * @param {object} variables - Variables to replace
   * @returns {string} - Interpolated text
   */
  interpolate(text, variables = {}) {
    return text.replace(/{(\w+)}/g, (match, key) => {
      return variables[key] !== undefined ? variables[key] : match;
    });
  }
  
  /**
   * Format response based on detected language
   * @param {string} content - Content to format
   * @param {string} language - Language code
   * @returns {object} - Formatted response
   */
  formatResponse(content, language) {
    return {
      content,
      language,
      timestamp: new Date().toISOString(),
      service: 'HR/IT Assistant'
    };
  }

  /**
   * Get all available languages
   * @returns {Array} - Array of supported language codes
   */
  getSupportedLanguages() {
    return this.supportedLanguages;
  }

  /**
   * Get default language
   * @returns {string} - Default language code
   */
  getDefaultLanguage() {
    return this.defaultLanguage;
  }

  /**
   * Get entire translation object for a language
   * @param {string} language - Language code
   * @returns {object} - Translation object
   */
  getTranslation(language) {
    const lang = this.supportedLanguages.includes(language) ? language : this.defaultLanguage;
    return this.translations[lang];
  }

  /**
   * Get Express router with all language-related routes
   * @returns {express.Router} - Express router instance
   */
  getRoutes() {
    const router = express.Router();
    const serverLanguage = process.env.SERVER_LANGUAGE || this.getDefaultLanguage();

    // Frontend translations endpoint (serves frontend section from unified language files)
    router.get('/translations/:lang', (req, res) => {
      const { lang } = req.params;
      const supportedLanguages = this.getSupportedLanguages();
      
      if (!supportedLanguages.includes(lang)) {
        return res.status(404).json({ 
          error: this.getText('errors.languageNotSupported', serverLanguage) 
        });
      }
      
      try {
        // Load the unified language file and extract only the frontend section
        const languageModule = require(path.join(__dirname, '..', 'languages', `${lang}.js`));
        
        if (languageModule.frontend) {
          res.json(languageModule.frontend);
        } else {
          res.status(404).json({ 
            error: 'Frontend translations not found for this language'
          });
        }
      } catch (error) {
        console.error(`Error loading frontend translations for ${lang}:`, error);
        res.status(500).json({ 
          error: this.getText('errors.fileNotFound', serverLanguage) 
        });
      }
    });

    // Language names endpoint (gets display names from each language file)
    router.get('/names', (req, res) => {
      try {
        const supportedLanguages = this.getSupportedLanguages();
        const languageNames = {};
        
        supportedLanguages.forEach(lang => {
          try {
            const languageModule = require(path.join(__dirname, '..', 'languages', `${lang}.js`));
            
            // Get display name from _meta section
            if (languageModule._meta && languageModule._meta.name) {
              languageNames[lang] = languageModule._meta.name;
            } else {
              // Fallback to uppercase language code if _meta section is missing
              languageNames[lang] = lang.toUpperCase();
            }
          } catch (error) {
            console.warn(`Could not load display name for language ${lang}`);
            languageNames[lang] = lang.toUpperCase();
          }
        });
        
        res.json(languageNames);
      } catch (error) {
        console.error('Error loading language names:', error);
        res.status(500).json({ 
          error: this.getText('errors.internalError', serverLanguage) 
        });
      }
    });

    // Language detection endpoint
    router.post('/detect', (req, res) => {
      const { text } = req.body;
      if (!text) {
        return res.status(400).json({ 
          error: this.getText('errors.textRequired', serverLanguage) 
        });
      }
      
      const detectedLanguage = this.detectLanguage(text);
      res.json({ language: detectedLanguage });
    });

    return router;
  }
}

module.exports = LanguageService;