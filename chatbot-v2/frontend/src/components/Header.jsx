import { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext.jsx';

const PHASES = ['phase1', 'phase2', 'phase3'];
const THEMES = [
  { value: 'system', icon: 'computer', label: 'System' },
  { value: 'light', icon: 'light_mode', label: 'Light' },
  { value: 'dark', icon: 'dark_mode', label: 'Dark' },
];

export default function Header({ phase, setPhase, theme, setTheme, models, model, setModel }) {
  const { t, language, setLanguage, languages } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  return (
    <header className="header">
      <div className="header-left">
        <i className="otter-icon" />
        <span className="header-brand">{t('app.brand')}</span>
      </div>

      <nav className="phase-nav">
        {PHASES.map(p => (
          <button
            key={p}
            className={`phase-btn ${phase === p ? 'active' : ''}`}
            onClick={() => setPhase(p)}
          >
            <span className="phase-dot" />
            {t(`phases.${p}.label`)}
          </button>
        ))}
      </nav>

      <div className="header-right" ref={menuRef}>
        <button className="user-chip" onClick={() => setMenuOpen(v => !v)}>
          <span className="material-symbols">account_circle</span>
          <span className="user-name">{t('userProfile.name')}</span>
          <span className="material-symbols user-chevron">{menuOpen ? 'expand_less' : 'expand_more'}</span>
        </button>

        {menuOpen && (
          <div className="user-menu">
            {/* Model */}
            {models.length > 0 && (
              <div className="user-menu-section">
                <div className="user-menu-label">
                  <span className="material-symbols">smart_toy</span>Model
                </div>
                <select
                  className="user-menu-select"
                  value={model}
                  onChange={e => setModel(e.target.value)}
                >
                  {models.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.provider ? `${m.provider} — ${m.name}` : m.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Theme */}
            <div className="user-menu-section">
              <div className="user-menu-label">
                <span className="material-symbols">palette</span>Theme
              </div>
              <div className="theme-options">
                {THEMES.map(th => (
                  <button
                    key={th.value}
                    className={`theme-option ${theme === th.value ? 'active' : ''}`}
                    onClick={() => setTheme(th.value)}
                  >
                    <span className="material-symbols">{th.icon}</span>
                    {th.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Language */}
            {languages.length > 1 && (
              <div className="user-menu-section">
                <div className="user-menu-label">
                  <span className="material-symbols">translate</span>Language
                </div>
                <select
                  className="user-menu-select"
                  value={language}
                  onChange={e => setLanguage(e.target.value)}
                >
                  {languages.map(l => (
                    <option key={l.code} value={l.code}>{l.nativeName || l.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
