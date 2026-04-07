import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => localStorage.getItem('language') || 'en');
  const [translations, setTranslations] = useState({});
  const [languages, setLanguages] = useState([]);

  useEffect(() => {
    fetch('/api/languages')
      .then(r => r.json())
      .then(data => setLanguages(data.languages || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`/api/translations/${language}`)
      .then(r => r.json())
      .then(data => {
        setTranslations(data);
        const dir = data?.language?.dir || 'ltr';
        document.documentElement.setAttribute('dir', dir);
        document.documentElement.setAttribute('lang', language);
      })
      .catch(() => {});
  }, [language]);

  const setLanguage = useCallback((lang) => {
    setLanguageState(lang);
    localStorage.setItem('language', lang);
  }, []);

  const t = useCallback((key, replacements = {}) => {
    const keys = key.split('.');
    let val = translations;
    for (const k of keys) {
      if (val == null) return key;
      val = val[k];
    }
    if (typeof val !== 'string') return val ?? key;
    return Object.entries(replacements).reduce(
      (s, [k, v]) => s.replace(new RegExp(`{{${k}}}`, 'g'), v),
      val
    );
  }, [translations]);

  return (
    <LanguageContext.Provider value={{ t, language, setLanguage, languages }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
