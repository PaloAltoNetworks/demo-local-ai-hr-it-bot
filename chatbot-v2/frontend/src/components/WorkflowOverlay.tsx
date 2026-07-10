import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import WorkflowReplay, { type Phase, type ProviderId } from './WorkflowReplay';

// The diagram knows three cloud lanes; map whatever provider the app is on onto one of them.
function toDiagramProvider(id: string): ProviderId {
  const p = id.toLowerCase();
  if (p.includes('gcp') || p.includes('vertex') || p.includes('google') || p.includes('gemini')) return 'gcp';
  if (p.includes('azure') || p.includes('foundry')) return 'azure';
  return 'aws'; // aws / bedrock / anything else
}

export default function WorkflowOverlay({ phase, provider, onClose }: { phase: string; provider: string; onClose: () => void }) {
  const { t } = useLanguage();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const initialPhase = (['phase1', 'phase2', 'phase3'].includes(phase) ? phase : 'phase1') as Phase;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background/95 backdrop-blur">
      <div className="flex items-center justify-between border-b bg-card px-5 py-3">
        <div className="flex items-center gap-2 text-lg font-semibold">{t('workflow.title')}</div>
        <button onClick={onClose} className="grid size-9 place-items-center rounded-lg border hover:bg-muted" aria-label={t('workflow.close')}>
          <X className="size-5" />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <WorkflowReplay initialPhase={initialPhase} initialProvider={toDiagramProvider(provider)} t={t} />
      </div>
    </div>
  );
}
