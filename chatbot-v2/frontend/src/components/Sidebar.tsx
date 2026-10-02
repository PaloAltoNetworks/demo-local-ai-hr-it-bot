import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useChatContext } from '../context/ChatContext';
import { MessageResponse } from '@/components/ai-elements/message';
import { Tip } from '@/components/ui/tooltip';
import type { LucideIcon } from 'lucide-react';
import {
  Lightbulb,
  MessageSquare,
  RotateCw,
  Wrench,
  Calendar,
  Users,
  CircleHelp,
  User,
  ShieldUser,
  Syringe,
  Usb,
  TriangleAlert,
  BookCopy,
  IdCard,
  CircleCheck,
  CircleX,
  X,
} from 'lucide-react';

interface QuestionItem {
  title?: string;
  text?: string;
  icon?: string;
  action?: string;
  persona?: string;
  /** Outcome the question demonstrates for its persona: access granted or refused. */
  expect?: 'allow' | 'deny';
  questions?: QuestionItem[];
  steps?: QuestionItem[];
}

// Map the locale icon names to lucide components. Numbered markers (looks_*) are
// handled separately as the step index, so they are not in this map.
const ICONS: Record<string, LucideIcon> = {
  book_copy: BookCopy,
  build: Wrench,
  event: Calendar,
  group: Users,
  help: CircleHelp,
  id_card: IdCard,
  person: User,
  shield_person: ShieldUser,
  syringe: Syringe,
  usb: Usb,
  warning: TriangleAlert,
};

const NUMBERED = new Set(['looks_one', 'looks_two', 'looks_3', 'looks_4', 'looks_5']);

/**
 * Example questions of the current phase. A question that demonstrates a persona's rights names
 * it (`persona`): clicking it switches to that persona first, so the answer shows that persona's
 * access, then sends the question.
 */
export default function Sidebar({ phase, onPersona }: { phase: string; onPersona?: (id: string) => Promise<void> }) {
  const { t } = useLanguage();
  const { sendMessage, status } = useChatContext();

  const isStreaming = status === 'streaming' || status === 'submitted';
  const questions = t(`questions.${phase}`);
  if (!Array.isArray(questions)) return null;

  const handleClick = async (item: QuestionItem) => {
    if (isStreaming) return;
    if (item.action === 'refresh') {
      location.reload();
      return;
    }
    if (item.persona && onPersona) await onPersona(item.persona);
    sendMessage({ text: item.text });
  };

  return (
    <aside className="hidden flex-col overflow-y-auto border-e bg-card p-5 md:flex">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <Lightbulb className="size-5 text-primary" />
        {t('questions.title')}
      </h3>
      <div className="space-y-3">
        {(questions as QuestionItem[]).map((item, i) => {
          const steps = item.questions || item.steps;
          if (steps) {
            const GroupIcon = item.icon ? ICONS[item.icon] : undefined;
            return (
              <div key={i}>
                <div className="mb-1 flex items-center gap-2 py-1 text-sm font-semibold">
                  {GroupIcon ? <GroupIcon className="size-5 shrink-0 text-primary" /> : <MessageSquare className="size-5 shrink-0 text-primary" />}
                  {item.title}
                </div>
                <div className="space-y-1.5 border-s-2 border-primary/40 ps-4">
                  {steps.map((step, j) => (
                    <QuestionCard key={j} item={step} index={j + 1} onClick={handleClick} />
                  ))}
                </div>
              </div>
            );
          }
          return <QuestionCard key={i} item={item} onClick={handleClick} />;
        })}
      </div>
      <VersionLink />
    </aside>
  );
}

/**
 * App version from GET /api/about; clicking it opens the changelog (CHANGELOG.md) in a native
 * modal <dialog>, rendered as Markdown.
 */
function VersionLink() {
  const { t } = useLanguage();
  const [about, setAbout] = useState<{ version: string; changelog: string } | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    fetch('/api/about').then(r => r.json()).then(setAbout).catch(() => {});
  }, []);

  if (!about) return null;
  return (
    <>
      <button
        onClick={() => dialogRef.current?.showModal()}
        className="mt-auto self-start pt-4 text-xs text-muted-foreground hover:text-primary hover:underline"
      >
        v{about.version} · {t('changelog.title')}
      </button>
      <dialog
        ref={dialogRef}
        onClick={e => { if (e.target === e.currentTarget) e.currentTarget.close(); }}
        className="m-auto max-h-[80vh] w-[min(42rem,90vw)] overflow-y-auto rounded-xl border bg-card p-6 text-foreground shadow-xl backdrop:bg-black/50"
      >
        <button
          onClick={() => dialogRef.current?.close()}
          aria-label={t('changelog.close')}
          className="float-end grid size-8 place-items-center rounded-md hover:bg-muted"
        >
          <X className="size-4" />
        </button>
        <MessageResponse>{about.changelog}</MessageResponse>
      </dialog>
    </>
  );
}

function QuestionCard({ item, index, onClick }: { item: QuestionItem; index?: number; onClick: (i: QuestionItem) => void }) {
  const Icon = item.action === 'refresh' ? RotateCw : (item.icon ? ICONS[item.icon] : undefined);
  const numbered = item.icon && NUMBERED.has(item.icon) && index != null;

  return (
    <Tip label={item.text} side="right">
      <button
        onClick={() => onClick(item)}
        className="flex w-full items-start gap-2.5 rounded-md border bg-card p-2.5 text-start transition-colors hover:border-primary/40 hover:bg-primary/5"
      >
        {numbered ? (
          <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">{index}</span>
        ) : Icon ? (
          <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
        ) : (
          <MessageSquare className="mt-0.5 size-4 shrink-0 text-primary" />
        )}
        <span className="text-sm font-medium leading-snug">{item.title}</span>
        {item.expect === 'allow' && <CircleCheck className="ms-auto mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />}
        {item.expect === 'deny' && <CircleX className="ms-auto mt-0.5 size-4 shrink-0 text-destructive" />}
      </button>
    </Tip>
  );
}
