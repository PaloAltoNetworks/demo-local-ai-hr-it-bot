import { useLanguage } from '../context/LanguageContext.jsx';

const PHASES = ['phase1', 'phase2', 'phase3'];

export default function Header({ phase, setPhase, toggleTheme }) {
  const { t, language, setLanguage, languages } = useLanguage();

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

      <div className="header-right">
        <button className="icon-btn" onClick={toggleTheme} title="Toggle theme">
          <span className="material-symbols">dark_mode</span>
        </button>

        {languages.length > 1 && (
          <select
            className="lang-select"
            value={language}
            onChange={e => setLanguage(e.target.value)}
          >
            {languages.map(l => (
              <option key={l.code} value={l.code}>{l.nativeName || l.name}</option>
            ))}
          </select>
        )}

        <div className="user-chip">
          <span className="material-symbols">account_circle</span>
          <span className="user-name">{t('userProfile.name')}</span>
        </div>
      </div>
    </header>
  );
}
