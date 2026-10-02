import type { CSSProperties } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tip } from '@/components/ui/tooltip';
import type { Persona } from '../hooks/usePersona';
import {
  Check, Languages, SunMoon, Moon, Sun, ShieldQuestionMark, ShieldAlert, ShieldCheck, Route,
  UserRound, UserStar, HeartHandshake, Globe,
} from 'lucide-react';

type ThemeChoice = 'system' | 'light' | 'dark';

const PHASES: { id: string; icon: typeof ShieldCheck; color: string }[] = [
  { id: 'phase1', icon: ShieldQuestionMark, color: 'var(--brand-green)' },
  { id: 'phase2', icon: ShieldAlert, color: 'var(--brand-red)' },
  { id: 'phase3', icon: ShieldCheck, color: 'var(--brand-blue)' },
];
const THEMES: { value: ThemeChoice; icon: typeof SunMoon; label: string }[] = [
  { value: 'system', icon: SunMoon, label: 'System' },
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
];

/** Icon and colour per access level, so the four personas tell apart at a glance. */
const PERSONA_LOOKS: Record<Persona['access'], { icon: typeof UserRound; color: string }> = {
  employee: { icon: UserRound, color: 'text-sky-600 dark:text-sky-400' },
  manager: { icon: UserStar, color: 'text-amber-600 dark:text-amber-400' },
  hr: { icon: HeartHandshake, color: 'text-violet-600 dark:text-violet-400' },
  external: { icon: Globe, color: 'text-orange-600 dark:text-orange-400' },
};

interface HeaderProps {
  phase: string;
  setPhase: (p: string) => void;
  theme: ThemeChoice;
  setTheme: (t: ThemeChoice) => void;
  onOpenWorkflow: () => void;
  personas: Persona[];
  persona: Persona | null;
  setPersona: (id: string) => void;
}

export default function Header({ phase, setPhase, theme, setTheme, onOpenWorkflow, personas, persona, setPersona }: HeaderProps) {
  const { t, language, setLanguage, languages } = useLanguage();

  const ThemeIcon = (THEMES.find(x => x.value === theme) || THEMES[0]).icon;
  const currentLang = languages.find(l => l.code === language);
  const PersonaIcon = persona ? PERSONA_LOOKS[persona.access].icon : UserRound;

  return (
    <header
      className="sticky top-0 z-50 flex h-20 items-center justify-between gap-4 border-b bg-card px-5"
      style={{ '--spacing': '0.3rem' } as CSSProperties}
    >
      <div className="flex items-center gap-3">
        <i className="otter-icon text-5xl text-primary transition-colors" />
        <span className="text-2xl font-semibold tracking-tight">{t('app.brand')}</span>
      </div>

      <nav className="flex gap-1 rounded-xl bg-secondary p-1">
        {PHASES.map(({ id, icon: Icon, color }) => {
          const active = phase === id;
          return (
            <Tip key={id} label={t(`phases.${id}.label`)}>
              <button
                onClick={() => setPhase(id)}
                aria-label={t(`phases.${id}.label`)}
                style={{ '--phase': color } as CSSProperties}
                className={`flex size-10 items-center justify-center rounded-lg border transition-colors ${
                  active
                    ? 'border-[var(--phase)] bg-card text-[var(--phase)] shadow-sm'
                    : 'border-transparent text-muted-foreground hover:border-[var(--phase)] hover:text-[var(--phase)]'
                }`}
              >
                <Icon className="size-5" />
              </button>
            </Tip>
          );
        })}
      </nav>

      <div className="flex items-center gap-2">
        {persona && (
          <DropdownMenu>
            <Tip label={`${t('persona.title')}: ${persona.name}, ${t(`persona.${persona.access}`)}`}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="size-10" aria-label={t('persona.title')}>
                  <PersonaIcon className={`size-5 ${PERSONA_LOOKS[persona.access].color}`} />
                </Button>
              </DropdownMenuTrigger>
            </Tip>
            <DropdownMenuContent align="end" className="min-w-80">
              {personas.map(p => {
                const { icon: Icon, color } = PERSONA_LOOKS[p.access];
                return (
                <DropdownMenuItem key={p.id} onClick={() => setPersona(p.id)}>
                  <Icon className={`size-5 ${color}`} />
                  <div className="flex flex-col">
                    <span>{p.name}</span>
                    <span className="text-xs text-muted-foreground">{t(`persona.${p.access}`)} · {p.id}</span>
                  </div>
                  {p.id === persona.id && <Check className="ms-auto size-4 text-primary" />}
                </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Workflow replay — opens the AI Gateway pipeline visualizer */}
        <Tip label={t('workflow.title')}>
          <Button variant="outline" size="icon" className="size-10" onClick={onOpenWorkflow} aria-label={t('workflow.title')}>
            <Route className="size-5" />
          </Button>
        </Tip>

        {/* Theme — icon only when collapsed, icon + label on open */}
        <DropdownMenu>
          <Tip label="Theme">
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="size-10" aria-label="Theme">
                <ThemeIcon className="size-5" />
              </Button>
            </DropdownMenuTrigger>
          </Tip>
          <DropdownMenuContent align="end">
            {THEMES.map(({ value, icon: Icon, label }) => (
              <DropdownMenuItem key={value} onClick={() => setTheme(value)}>
                <Icon className="size-4" />
                <span>{label}</span>
                {theme === value && <Check className="ms-auto size-4 text-primary" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Language — icon only when collapsed, label list on open */}
        {languages.length > 1 && (
          <DropdownMenu>
            <Tip label={currentLang?.nativeName || currentLang?.name || 'Language'}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="size-10" aria-label="Language">
                  <Languages className="size-5" />
                </Button>
              </DropdownMenuTrigger>
            </Tip>
            <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
              {languages.map(l => (
                <DropdownMenuItem key={l.code} onClick={() => setLanguage(l.code)}>
                  <span>{l.nativeName || l.name}</span>
                  {l.code === language && <Check className="ms-auto size-4 text-primary" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
