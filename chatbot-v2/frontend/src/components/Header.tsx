import type { CSSProperties } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Check, Languages, SunMoon, Moon, Sun, ShieldQuestionMark, ShieldAlert, ShieldCheck } from 'lucide-react';

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

interface HeaderProps {
  phase: string;
  setPhase: (p: string) => void;
  theme: ThemeChoice;
  setTheme: (t: ThemeChoice) => void;
}

export default function Header({ phase, setPhase, theme, setTheme }: HeaderProps) {
  const { t, language, setLanguage, languages } = useLanguage();

  const ThemeIcon = (THEMES.find(x => x.value === theme) || THEMES[0]).icon;
  const currentLang = languages.find(l => l.code === language);

  return (
    <header className="sticky top-0 z-50 flex h-14 items-center justify-between gap-4 border-b bg-card px-5">
      <div className="flex items-center gap-2.5">
        <i className="otter-icon text-3xl text-primary transition-colors" />
        <span className="text-lg font-semibold tracking-tight">{t('app.brand')}</span>
      </div>

      <TooltipProvider>
        <nav className="flex gap-1 rounded-xl bg-secondary p-1">
          {PHASES.map(({ id, icon: Icon, color }) => {
            const active = phase === id;
            return (
              <Tooltip key={id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setPhase(id)}
                    aria-label={t(`phases.${id}.label`)}
                    style={{ '--phase': color } as CSSProperties}
                    className={`flex size-9 items-center justify-center rounded-lg border transition-colors ${
                      active
                        ? 'border-[var(--phase)] bg-card text-[var(--phase)] shadow-sm'
                        : 'border-transparent text-muted-foreground hover:border-[var(--phase)] hover:text-[var(--phase)]'
                    }`}
                  >
                    <Icon className="size-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t(`phases.${id}.label`)}</TooltipContent>
              </Tooltip>
            );
          })}
        </nav>
      </TooltipProvider>

      <div className="flex items-center gap-2">
        {/* Theme — icon only when collapsed, icon + label on open */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="size-10" title="Theme" aria-label="Theme">
              <ThemeIcon className="size-5" />
            </Button>
          </DropdownMenuTrigger>
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
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="size-10" title={currentLang?.nativeName || currentLang?.name || 'Language'} aria-label="Language">
                <Languages className="size-5" />
              </Button>
            </DropdownMenuTrigger>
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
