import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';

export interface LanguageInfo {
  code: string;
  name?: string;
  nativeName?: string;
}

// t() returns strings for leaf keys, but arrays/objects for structured keys
// (e.g. the sidebar question lists), so the return type is intentionally loose.
export type Translate = (key: string, replacements?: Record<string, string>) => any;

interface LanguageContextValue {
  t: Translate;
  language: string;
  setLanguage: (lang: string) => void;
  languages: LanguageInfo[];
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<string>(() => localStorage.getItem('language') || 'en');
  const [translations, setTranslations] = useState<Record<string, any>>({});
  const [languages, setLanguages] = useState<LanguageInfo[]>([]);

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

  const setLanguage = useCallback((lang: string) => {
    setLanguageState(lang);
    localStorage.setItem('language', lang);
  }, []);

  const t = useCallback<Translate>((key, replacements = {}) => {
    const keys = key.split('.');
    let val: any = translations;
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

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
