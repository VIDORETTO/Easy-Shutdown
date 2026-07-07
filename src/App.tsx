import { useEffect, useState, type ComponentType } from "react";
import { getCurrentWindow, Effect, EffectState } from "@tauri-apps/api/window";
import {
  Home as HomeIcon,
  Clock,
  Keyboard,
  Settings as SettingsIcon,
  Info,
  type LucideIcon,
} from "lucide-react";

import Titlebar from "@/components/Titlebar";
import ToastContainer from "@/components/Toast";
import Home from "@/pages/Home";
import Scheduler from "@/pages/Scheduler";
import Hotkeys from "@/pages/Hotkeys";
import Settings from "@/pages/Settings";
import About from "@/pages/About";
import { useStore, applyTheme, watchSystemTheme } from "@/store/useStore";

type Tab = "home" | "scheduler" | "hotkeys" | "settings" | "about";

const TABS: { key: Tab; label: string; icon: LucideIcon }[] = [
  { key: "home", label: "Início", icon: HomeIcon },
  { key: "scheduler", label: "Agendar", icon: Clock },
  { key: "hotkeys", label: "Atalhos", icon: Keyboard },
  { key: "settings", label: "Config", icon: SettingsIcon },
  { key: "about", label: "Sobre", icon: Info },
];

const PANELS: { key: Tab; Component: ComponentType }[] = [
  { key: "home", Component: Home },
  { key: "scheduler", Component: Scheduler },
  { key: "hotkeys", Component: Hotkeys },
  { key: "settings", Component: Settings },
  { key: "about", Component: About },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("home");
  const init = useStore((s) => s.init);
  const cleanup = useStore((s) => s.cleanup);
  const settings = useStore((s) => s.settings);
  const initError = useStore((s) => s.initError);
  const hasActiveSchedule = useStore((s) => s.activeSchedule !== null);

  useEffect(() => {
    init();
    return () => cleanup();
  }, [init, cleanup]);

  // Tema + Mica — dep narrow para só reagir a theme, não a qualquer settings change
  const theme = settings?.theme;
  useEffect(() => {
    if (!settings) return;
    applyTheme(settings.theme);
    getCurrentWindow()
      .setEffects({ effects: [Effect.Mica], state: EffectState.Active })
      .catch(() => {});

    if (settings.theme === "system") {
      const unwatch = watchSystemTheme(() => applyTheme("system"));
      return unwatch;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  // Ctrl+1..5 para trocar de aba
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key >= "1" && e.key <= "5") {
        e.preventDefault();
        const idx = Number(e.key) - 1;
        if (idx < TABS.length) setTab(TABS[idx].key);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!settings) {
    return (
      <>
        <div className="window-shell items-center justify-center">
          <p className="text-sm text-text-secondary">
            {initError ? `Erro: ${initError}` : "Carregando…"}
          </p>
        </div>
        <ToastContainer />
      </>
    );
  }

  const onTabKeyDown = (e: React.KeyboardEvent, currentIdx: number) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = TABS[(currentIdx + 1) % TABS.length];
      setTab(next.key);
      document.getElementById(`tab-${next.key}`)?.focus();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const prev = TABS[(currentIdx - 1 + TABS.length) % TABS.length];
      setTab(prev.key);
      document.getElementById(`tab-${prev.key}`)?.focus();
    }
  };

  return (
    <div className="window-shell">
      <Titlebar />

      <div className="flex flex-1 min-h-0">
        <nav
          className="w-20 flex flex-col items-center gap-1.5 py-4 shrink-0
                     border-r border-stroke dark:border-stroke-dark
                     bg-white/40 dark:bg-black/20 backdrop-blur-md"
          role="tablist"
          aria-label="Navegação principal"
        >
          {TABS.map(({ key, label, icon: Icon }, idx) => (
            <button
              key={key}
              id={`tab-${key}`}
              role="tab"
              aria-selected={tab === key}
              aria-controls={`panel-${key}`}
              tabIndex={tab === key ? 0 : -1}
              onClick={() => setTab(key)}
              onKeyDown={(e) => onTabKeyDown(e, idx)}
              title={label}
              className={`relative w-16 h-14 rounded-xl flex flex-col items-center justify-center gap-1 transition-all
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
                ${
                  tab === key
                    ? "bg-accent/20 text-accent"
                    : "text-[#4A4A4A] dark:text-text-darkSecondary hover:bg-black/8 dark:hover:bg-white/12"
                }`}
            >
              <Icon size={20} />
              <span className="text-[11px] font-medium">{label}</span>
              {key === "home" && hasActiveSchedule && (
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-accent ring-2 ring-white/50 dark:ring-black/30" />
              )}
            </button>
          ))}
        </nav>

        {/* Páginas mantidas montadas (preserva state ao navegar) */}
        <main
          className="flex-1 min-h-0 min-w-0 relative overflow-hidden"
          role="tabpanel"
          id={`panel-${tab}`}
        >
          {PANELS.map(({ key, Component }) => {
            const isActive = tab === key;
            return (
              <div
                key={key}
                className={`absolute inset-0 flex flex-col min-h-0 overflow-hidden ${
                  isActive
                    ? "visible pointer-events-auto"
                    : "invisible pointer-events-none"
                }`}
                aria-hidden={!isActive}
              >
                <Component />
              </div>
            );
          })}
        </main>
      </div>

      <ToastContainer />
    </div>
  );
}
