import { useState, useEffect } from 'react';
import Header from './components/Header.jsx';
import Sidebar from './components/Sidebar.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import { ChatProvider } from './context/ChatContext.jsx';
import { useModels } from './hooks/useModels.js';

export default function App() {
  const [phase, setPhase] = useState(() => localStorage.getItem('currentPhase') || 'phase1');
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'system');
  const { models, model, setModel } = useModels();

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
    <ChatProvider model={model} phase={phase}>
      <div className={`app ${phase}-active`}>
        <Header
          phase={phase} setPhase={setPhase}
          theme={theme} setTheme={setTheme}
          models={models} model={model} setModel={setModel}
        />
        <main className="main">
          <Sidebar phase={phase} />
          <ChatPanel />
        </main>
      </div>
    </ChatProvider>
  );
}
