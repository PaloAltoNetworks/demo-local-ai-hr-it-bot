import { useState, useEffect } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import ChatPanel from './components/ChatPanel';
import WorkflowOverlay from './components/WorkflowOverlay';
import { ChatProvider } from './context/ChatContext';
import { useProviders } from './hooks/useProviders';
import { usePersona } from './hooks/usePersona';

type ThemeChoice = 'system' | 'light' | 'dark';

export default function App() {
  const [phase, setPhase] = useState<string>(() => localStorage.getItem('currentPhase') || 'phase1');
  const [theme, setTheme] = useState<ThemeChoice>(() => (localStorage.getItem('theme') as ThemeChoice) || 'system');
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const { providers, provider, setProvider } = useProviders();
  const { personas, persona, setPersona, userName } = usePersona();

  useEffect(() => {
    localStorage.setItem('currentPhase', phase);
  }, [phase]);

  useEffect(() => {
    localStorage.setItem('theme', theme);
    const root = document.documentElement;
    const applyDark = (dark: boolean) => root.classList.toggle('dark', dark);

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const apply = () => applyDark(mq.matches);
      apply();
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
    applyDark(theme === 'dark');
  }, [theme]);

  return (
    <ChatProvider provider={provider} phase={phase}>
      <div className={`${phase}-active flex h-screen flex-col bg-background text-foreground`}>
        <Header
          phase={phase} setPhase={setPhase}
          theme={theme} setTheme={setTheme}
          onOpenWorkflow={() => setWorkflowOpen(true)}
          personas={personas} persona={persona} setPersona={setPersona}
        />
        <main className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[320px_1fr]">
          <Sidebar phase={phase} onPersona={setPersona} />
          <ChatPanel providers={providers} provider={provider} setProvider={setProvider} phase={phase} userName={userName} />
        </main>
        {workflowOpen && (
          <WorkflowOverlay phase={phase} provider={provider} onClose={() => setWorkflowOpen(false)} />
        )}
      </div>
    </ChatProvider>
  );
}
