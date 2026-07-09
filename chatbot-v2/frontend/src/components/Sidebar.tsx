import { useLanguage } from '../context/LanguageContext';
import { useChatContext } from '../context/ChatContext';
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
} from 'lucide-react';

interface QuestionItem {
  title?: string;
  text?: string;
  icon?: string;
  action?: string;
  questions?: QuestionItem[];
  steps?: QuestionItem[];
}

// Map the locale icon names to lucide components. Numbered markers (looks_*) are
// handled separately as the step index, so they are not in this map.
const ICONS: Record<string, LucideIcon> = {
  build: Wrench,
  event: Calendar,
  group: Users,
  help: CircleHelp,
  person: User,
  shield_person: ShieldUser,
  syringe: Syringe,
  usb: Usb,
  warning: TriangleAlert,
};

const NUMBERED = new Set(['looks_one', 'looks_two', 'looks_3', 'looks_4', 'looks_5']);

export default function Sidebar({ phase }: { phase: string }) {
  const { t } = useLanguage();
  const { sendMessage, status } = useChatContext();

  const isStreaming = status === 'streaming' || status === 'submitted';
  const questions = t(`questions.${phase}`);
  if (!Array.isArray(questions)) return null;

  const handleClick = (item: QuestionItem) => {
    if (isStreaming) return;
    if (item.action === 'refresh') {
      location.reload();
      return;
    }
    sendMessage({ text: item.text });
  };

  return (
    <aside className="hidden overflow-y-auto border-e bg-card p-5 md:block">
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
    </aside>
  );
}

function QuestionCard({ item, index, onClick }: { item: QuestionItem; index?: number; onClick: (i: QuestionItem) => void }) {
  const Icon = item.action === 'refresh' ? RotateCw : (item.icon ? ICONS[item.icon] : undefined);
  const numbered = item.icon && NUMBERED.has(item.icon) && index != null;

  return (
    <button
      title={item.text}
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
    </button>
  );
}
