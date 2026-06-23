import { useState, useEffect } from 'react';
import Header from './components/Header.jsx';
import Sidebar from './components/Sidebar.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import { ChatProvider } from './context/ChatContext.jsx';
import { useProviders } from './hooks/useProviders.js';

export default function App() {
  const [phase, setPhase] = useState(() => localStorage.getItem('currentPhase') || 'phase1');
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'system');
  const { providers, provider, setProvider } = useProviders();

  useEffect(() => {
    localStorage.setItem('currentPhase', phase);
  }, [phase]);

  useEffect(() => {
    localStorage.setItem('theme', theme);
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const apply = () => document.body.setAttribute('data-theme', mq.matches ? 'dark' : 'light');
      apply();
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <ChatProvider provider={provider} phase={phase}>
      <div className={`app ${phase}-active`}>
        <Header
          phase={phase} setPhase={setPhase}
          theme={theme} setTheme={setTheme}
          providers={providers} provider={provider} setProvider={setProvider}
        />
        <main className="main">
          <Sidebar phase={phase} />
          <ChatPanel />
        </main>
      </div>
    </ChatProvider>
  );
}
