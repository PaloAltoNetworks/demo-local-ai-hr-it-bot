# Language System Documentation

## Overview

The La Loutre HR/IT Assistant uses a comprehensive dual-layer language system:
- **Backend**: Modular language files for server messages, API responses, and AI prompts
- **Frontend**: Dynamic language loading with intelligent browser detection and memory optimization

This system makes it easy to add new languages without modifying any application code - just add a language file and restart!

## File Structure

```
languages/
├── en.js          # English translations
├── fr.js          # French translations
└── [new-lang].js  # Additional languages (automatically detected)

public/js/
└── languageService.js  # Frontend language management

services/
└── languageService.js  # Backend language service
```

## Language Detection & Loading

### Frontend Behavior
1. **Auto-discovery**: Fetches `/api/language/names` to discover available languages
2. **Smart detection**: Checks user preferences in this order:
   - Saved preference in `localStorage.getItem('laloutre-language')`
   - Browser language (`navigator.language`)
   - Fallback to English
3. **Memory optimization**: Only loads one language at a time to minimize memory usage
4. **Cached display**: Uses cached language names for dropdown (no redundant API calls)

### Backend Behavior  
1. **Auto-detection**: Scans `languages/` directory for `.js` files on startup
2. **Dynamic loading**: Loads all available language files into memory
3. **API endpoints**: Provides `/api/language/names` and `/api/language/translations/{lang}`

## Default Language

**English (en)** is now the default language as requested. This can be changed by setting the `DEFAULT_LANGUAGE` environment variable.

## Environment Configuration

The language system is configured through environment variables:

```bash
# Default language for the application (used for language detection fallback)
DEFAULT_LANGUAGE=en

# Server language (used for server logs and API error messages)
SERVER_LANGUAGE=en

# SUPPORTED_LANGUAGES - Auto-detected from languages/ directory (no config needed!)
```

- **DEFAULT_LANGUAGE**: Fallback language when detection fails
- **SERVER_LANGUAGE**: Language for server-side messages, logs, and API errors
- **SUPPORTED_LANGUAGES**: ✨ **Auto-detected** from available `.js` files in `languages/` directory

## Adding a New Language 

Adding a new language is incredibly simple - just create one file and restart! Here's how to add Spanish support:

### Step 1: Copy the English Template
```bash
cp languages/en.js languages/es.js
```

### Step 2: Update Language Metadata
Edit the `_meta` section at the top of `languages/es.js`:

```javascript
// Spanish language file (copy structure from en.js)
module.exports = {
  // Language metadata (REQUIRED)
  _meta: {
    code: 'es',           // ISO 639-1 language code
    name: 'Español',      // Native language name (appears in dropdown)
    englishName: 'Spanish', // English name (for logs and documentation)
    countryCode: 'ES'     // ISO 3166-1 alpha-2 country code
  },

  // Server messages (for backend logs and API responses)
  server: {
    started: 'La Loutre HR/IT Assistant iniciado en el puerto',
    webInterface: 'Interfaz web',
    newConnection: 'Nueva conexión WebSocket',
    // ... translate all server messages
  },
  
  // Error messages (for API error responses)
  errors: {
    textRequired: 'Texto requerido',
    employeeNotFound: 'Empleado no encontrado', 
    queryRequired: 'Consulta requerida',
    // ... translate all error messages
  },
  
  // Frontend translations (loaded dynamically by browser)
  frontend: {
    // Page metadata
    pageTitle: 'La Loutre - Asistente HR/IT',
    pageLanguage: 'es',
    
    // Header
    logoTitle: 'La Loutre',
    currentLang: 'ES',
    
    // ... translate all other frontend strings
  },
  
  // Employee data, knowledge base, etc.
  // ... copy and translate all other sections from en.js
};
```

### Step 3: Translate All Sections
Make sure to translate **all sections** from `en.js`. **Required sections:**
- `_meta` - Language metadata (including `name: 'Español'`)
- `server` - Backend server messages
- `errors` - API error messages  
- `frontend` - Frontend UI text
- `employee` - Employee data templates
- `knowledgeBase` - HR/IT knowledge content
- `intentKeywords` - Keywords for language detection
- `languageIndicators` - Words that identify this language
- `ollama` - AI prompts and responses

**Critical**: The `_meta.name` field determines what appears in the language dropdown!

### Step 4: Restart Server
```bash
npm run dev
```

### That's it! 🎉 

The system will automatically:
- ✅ **Detect** the new `es.js` file
- ✅ **Load** Spanish translations  
- ✅ **Add** Spanish to `/api/language/names`
- ✅ **Show** "Español" in the language dropdown
- ✅ **Enable** Spanish selection for users

### Verification
1. Check server logs: `Auto-detected supported languages: [ 'en', 'es', 'fr' ]`
2. Test API: `curl http://localhost:3000/api/language/names`
   - Should return: `{"en":"English","fr":"Français","es":"Español"}`
3. Check frontend: "Español" should appear in language selector

### How Language Names Work
The language dropdown displays names from `_meta.name` in each language file:
- `en.js` → `_meta.name: 'English'` → Shows "English" 
- `fr.js` → `_meta.name: 'Français'` → Shows "Français"
- `es.js` → `_meta.name: 'Español'` → Shows "Español"

**Fallback logic**: `_meta.name` → Uppercase language code (e.g., "ES")

## Complete Language File Structure

Each language file must contain these sections (copy all from `en.js`):

### Required Sections

#### `_meta` (Language Metadata)
```javascript
_meta: {
  code: 'es',           // ISO 639-1 language code (must match filename)
  name: 'Español',      // Native language name (shown in dropdown)
  englishName: 'Spanish', // English name (for logs and documentation)
  countryCode: 'ES'     // ISO 3166-1 alpha-2 country code
}
```

#### `server` (Backend Messages)
Server startup, connection, and system messages displayed in logs

#### `errors` (API Error Messages)  
Error responses sent to frontend via API endpoints

#### `frontend` (UI Text)
All user interface text loaded by the browser:
- Page titles and headers
- Button labels and navigation
- Form placeholders and validation messages
- Chat interface text
- Sidebar content and quick actions

#### `employee` (Employee Data Templates)
- Department names and descriptions
- Job position titles
- Employee status types
- Work location information

#### `knowledgeBase` (HR/IT Content)
Complete HR/IT policies, procedures, and help content:
- Vacation and leave policies
- IT support procedures
- Security guidelines  
- Company policies and benefits

#### `intentKeywords` (Intent Detection)
Keywords that help identify what users are asking about:
- Vacation-related terms
- Password/security terms
- Equipment request terms
- General help terms

#### `languageIndicators` (Language Detection)
Common words that help identify text written in this language

#### `ollama` (AI Service)
- System prompts for the AI assistant
- Fallback messages when AI is unavailable
- Response templates and formatting

### Section Dependencies
- **Backend sections**: `server`, `errors`, `employee`, `knowledgeBase`, `intentKeywords`, `ollama`
- **Frontend sections**: `frontend` (loaded separately by browser)
- **Detection sections**: `languageIndicators` (used for automatic language detection)

## Text Interpolation

The system supports variable interpolation using `{variableName}` syntax:

```javascript
// In language file:
message: "Hello {firstName} {lastName}, you have {count} messages"

// In code:
this.languageService.getText('path.to.message', 'en', {
  firstName: 'John',
  lastName: 'Doe', 
  count: 5
});
// Result: "Hello John Doe, you have 5 messages"
```

## Usage in Code

### Getting Simple Text
```javascript
const text = this.languageService.getText('errors.textRequired', 'en');
```

### Getting Text with Variables
```javascript
const text = this.languageService.getText('employeeInfo.vacationBalance', 'en', {
  firstName: 'John',
  lastName: 'Doe',
  remaining: 15,
  total: 30
});
```

### Backward Compatibility
The old `getMessage()` method still works for general messages:
```javascript
const text = this.languageService.getMessage('error', 'en');
// Equivalent to: this.languageService.getText('general.error', 'en')
```

## Language Detection

The system automatically detects language based on keywords found in user input. Each language file contains a `languageIndicators` array with common words that help identify that language.

## Important Notes

1. **All backend files have been updated** to use the language service instead of hardcoded strings
2. **English is now the default language** as requested
3. **Service dependencies** have been properly injected (LanguageService → OllamaService → HRITService)
4. **Fallback system** ensures the app works even if language files are missing
5. **Consistent API responses** now use the same bilingual format throughout

## Testing New Languages

### Quick Verification Checklist

After adding a new language file (e.g., `es.js`):

#### 1. Server Startup ✅
```bash
npm run dev
# Look for: "Auto-detected supported languages: [ 'en', 'es', 'fr' ]"
```

#### 2. API Endpoints ✅
```bash
# Test language discovery
curl http://localhost:3000/api/language/names
# Should include: "es": "Español"

# Test translation loading
curl http://localhost:3000/api/language/translations/es
# Should return Spanish frontend translations
```

#### 3. Frontend Integration ✅
- Open browser → Language dropdown should show "Español"
- Select Spanish → UI should switch to Spanish text
- Check browser console → Should show "Successfully loaded translations for: es"

#### 4. Content Verification ✅
Test that all sections work:
- **Frontend**: All UI elements display Spanish text
- **Backend**: API error messages in Spanish (if `SERVER_LANGUAGE=es`)
- **AI Chat**: Spanish prompts and responses work correctly
- **Employee data**: Spanish department/position names appear

#### 5. Memory Optimization ✅
Check browser console:
```javascript
// Should show only current language loaded
languageService.getLoadedLanguages(); // ['es']
```

### Common Issues & Solutions

**❌ Language not appearing in dropdown**
- Check file name matches pattern: `languages/{code}.js`
- Verify `_meta.name` exists and is not empty
- Ensure `_meta.code` matches the filename without `.js`
- Restart server to reload language list

**❌ UI not switching to new language**  
- Check `frontend` section exists and is complete
- Verify all keys from `en.js` frontend section are translated
- Check browser console for missing translation warnings

**❌ API errors in wrong language**
- Set `SERVER_LANGUAGE` environment variable to desired language
- Ensure `errors` section is complete in language file

**❌ Memory issues or slow switching**
- Verify only one language loads at a time
- Check that old language is cleared when switching
- Monitor `languageService.getLoadedLanguages()` output

## API Endpoints

### Language Discovery
```javascript
// Get available languages and their display names
GET /api/language/names
// Response: { "en": "English", "fr": "Français", "es": "Español" }
```

### Language Loading  
```javascript
// Get frontend translations for a specific language
GET /api/language/translations/{langCode}
// Response: { pageTitle: "...", chatTitle: "...", ... } (frontend section only)
```

### System Configuration
```javascript
// Get server language configuration  
GET /api/config
// Response: { 
//   defaultLanguage: "en", 
//   supportedLanguages: ["en", "fr", "es"],
//   serverLanguage: "en" 
// }
```

## Frontend Language Service

The browser-side language service automatically:

### Initialization Sequence
1. **Discovery**: `fetch('/api/language/names')` → Cache supported languages
2. **Detection**: Check localStorage → Check `navigator.language` → Fallback to English  
3. **Loading**: `fetch('/api/language/translations/{lang})` → Load selected language
4. **UI Update**: Populate dropdown and update all `data-i18n` elements

### Memory Optimization
- **Single language**: Only one language loaded in memory at a time
- **Cached names**: Language display names cached after first fetch
- **No redundant calls**: Dropdown population uses cached data

### User Experience
```javascript
// Language switching is seamless
languageService.setLanguage('es'); // Loads Spanish, clears previous
languageService.setLanguage('fr'); // Loads French, clears Spanish

// Smart text retrieval with fallbacks
languageService.getText('chatTitle'); // Gets text in current language
languageService.getText('missing.key'); // Returns key path as fallback
```

## Architecture Overview

### System Components
- **Language Files**: `languages/{code}.js` - Complete translations for each language
- **Backend Service**: `services/languageService.js` - Server-side language management  
- **Frontend Service**: `public/js/languageService.js` - Browser-side language handling
- **API Layer**: RESTful endpoints for language discovery and loading

### Key Features ✨
- **🔄 Auto-detection**: Languages automatically discovered from file system
- **🧠 Smart caching**: Optimized memory usage with single-language loading
- **🌐 Intelligent detection**: Browser language + user preference detection
- **⚡ Zero configuration**: Just add language file and restart server
- **🎯 Performance optimized**: Single API call for discovery, cached display names
- **🛡️ Fallback system**: Graceful degradation when languages missing

### File Organization
```
├── languages/
│   ├── en.js              # English (reference implementation)
│   ├── fr.js              # French (complete translation)
│   └── {new-lang}.js      # Add more languages here
├── services/
│   └── languageService.js # Backend language management
└── public/js/
    └── languageService.js # Frontend language service
```

### Adding Languages: The Complete Flow
1. **Create**: Copy `en.js` → `{code}.js` and translate all sections
2. **Set metadata**: Update `_meta` section with proper country code
3. **Restart**: Server auto-detects new language file
4. **Available**: Language immediately available in dropdown and API
5. **Ready**: Users can select and use new language instantly

### Country Code Benefits
The `_meta` section provides all language/country context in one place:
- **Language code**: `_meta.code` ('en', 'fr') for HTML lang attribute and logic
- **Country context**: `_meta.countryCode` ('US', 'FR') for regional variants
- **Display names**: `_meta.name` and `_meta.englishName` for UI and logs
- **Future extensions**: Date formats, currency, flags, timezone defaults

### Migration Status ✅
- **Backend Services**: All text externalized to language files
- **Frontend Interface**: Dynamic language loading with optimization  
- **API Responses**: Consistent multilingual error handling
- **AI Integration**: Localized prompts and responses
- **Performance**: Optimized for minimal API calls and memory usage

**Result**: Complete internationalization system requiring zero code changes to add languages!