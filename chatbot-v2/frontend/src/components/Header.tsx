import { useLanguage } from '../context/LanguageContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Check, Languages, SunMoon, Moon, Sun } from 'lucide-react';

type ThemeChoice = 'system' | 'light' | 'dark';

const PHASES = ['phase1', 'phase2', 'phase3'];
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

      <nav className="flex gap-1 rounded-xl bg-secondary p-1">
        {PHASES.map(p => {
          const active = phase === p;
          return (
            <button
              key={p}
              onClick={() => setPhase(p)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
                active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className={`size-2 rounded-full transition-colors ${active ? 'bg-primary' : 'bg-muted-foreground/50'}`} />
              {t(`phases.${p}.label`)}
            </button>
          );
        })}
      </nav>

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
