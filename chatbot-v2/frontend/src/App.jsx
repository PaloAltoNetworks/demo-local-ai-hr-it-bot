import { useState, useEffect } from 'react';
import Header from './components/Header.jsx';
import Sidebar from './components/Sidebar.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import { ChatProvider } from './context/ChatContext.jsx';
import { useModels } from './hooks/useModels.js';

export default function App() {
  const [phase, setPhase] = useState(() => localStorage.getItem('currentPhase') || 'phase1');
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const { models, model, setModel } = useModels();

  useEffect(() => {
    localStorage.setItem('currentPhase', phase);
  }, [phase]);

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  return (
    <ChatProvider model={model} phase={phase}>
      <div className={`app ${phase}-active`}>
        <Header
          phase={phase} setPhase={setPhase}
          toggleTheme={toggleTheme}
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
