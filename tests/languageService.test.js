const LanguageService = require('../services/languageService');

describe('LanguageService', () => {
  let languageService;

  beforeEach(() => {
    languageService = new LanguageService();
  });

  describe('detectLanguage', () => {
    test('should detect French text', () => {
      const frenchText = 'Bonjour, comment allez-vous? Je voudrais demander des congés.';
      const result = languageService.detectLanguage(frenchText);
      expect(result).toBe('fr');
    });

    test('should detect English text', () => {
      const englishText = 'Hello, how are you? I would like to request vacation time.';
      const result = languageService.detectLanguage(englishText);
      expect(result).toBe('en');
    });

    test('should return default language for empty text', () => {
      const result = languageService.detectLanguage('');
      expect(result).toBe('fr');
    });

    test('should return default language for very short text', () => {
      const result = languageService.detectLanguage('Hi');
      expect(result).toBe('fr');
    });
  });

  describe('getMessage', () => {
    test('should return French message for French key', () => {
      const message = languageService.getMessage('greeting', 'fr');
      expect(message).toContain('Bonjour');
      expect(message).toContain('La Loutre');
    });

    test('should return English message for English key', () => {
      const message = languageService.getMessage('greeting', 'en');
      expect(message).toContain('Hello');
      expect(message).toContain('La Loutre');
    });

    test('should return French message for unsupported language', () => {
      const message = languageService.getMessage('greeting', 'es');
      expect(message).toContain('Bonjour');
    });

    test('should return key if message not found', () => {
      const result = languageService.getMessage('nonexistent', 'fr');
      expect(result).toBe('nonexistent');
    });
  });

  describe('formatResponse', () => {
    test('should format response with correct structure', () => {
      const content = 'Test content';
      const language = 'fr';
      const result = languageService.formatResponse(content, language);
      
      expect(result).toHaveProperty('content', content);
      expect(result).toHaveProperty('language', language);
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('service', 'La Loutre');
    });
  });
});