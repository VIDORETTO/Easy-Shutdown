import { useEffect, type ComponentType } from "react";
import {
  Home as HomeIcon,
  CalendarClock,
  Keyboard,
  Settings as SettingsIcon,
  Info,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";

import Titlebar from "@/components/Titlebar";
import ToastContainer from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import FinalWarning from "@/components/FinalWarning";
import QuitDialog from "@/components/QuitDialog";
import Home from "@/pages/Home";
import Tasks from "@/pages/Tasks";
import Hotkeys from "@/pages/Hotkeys";
import Settings from "@/pages/Settings";
import About from "@/pages/About";
import { useStore, applyTheme, watchSystemTheme, type Tab } from "@/store/useStore";

const TABS: { key: Tab; label: string; icon: LucideIcon; Component: ComponentType }[] = [
  { key: "home", label: "Início", icon: HomeIcon, Component: Home },
  { key: "tasks", label: "Tarefas", icon: CalendarClock, Component: Tasks },
  { key: "hotkeys", label: "Atalhos", icon: Keyboard, Component: Hotkeys },
  { key: "settings", label: "Ajustes", icon: SettingsIcon, Component: Settings },
  { key: "about", label: "Sobre", icon: Info, Component: About },
];

export default function App() {
  const init = useStore((s) => s.init);
  const retryInit = useStore((s) => s.retryInit);
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const theme = useStore((s) => s.settings?.theme);
  const hasSettings = useStore((s) => s.settings !== null);
  const initError = useStore((s) => s.initError);
  const mica = useStore((s) => s.mica);
  const activeTasks = useStore((s) => s.tasks.filter((t) => t.enabled).length);
  const refreshHibernate = useStore((s) => s.refreshHibernate);

  useEffect(() => {
    void init();
  }, [init]);

  // Com Mica o fundo do documento fica transparente; sem ele (Win10) usa cor sólida.
  useEffect(() => {
    document.documentElement.classList.toggle("mica", mica);
  }, [mica]);

  useEffect(() => {
    if (!theme) return;
    applyTheme(theme);
    if (theme === "system") return watchSystemTheme(() => applyTheme("system"));
  }, [theme]);

  // A hibernação pode ser ativada/desativada fora do app: reconsulta ao focar a janela.
  useEffect(() => {
    const onFocus = () => void refreshHibernate();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshHibernate]);

  // Ctrl+1..5 para trocar de aba
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key >= "1" && e.key <= "5") {
        e.preventDefault();
        setTab(TABS[Number(e.key) - 1].key);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setTab]);

  if (!hasSettings) {
    return (
      <div className="window-shell">
        <Titlebar />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
          {initError ? (
            <>
              <p className="text-sm text-danger select-text max-w-md">Não foi possível carregar o app: {initError}</p>
              <button type="button" className="btn-primary" onClick={() => void retryInit()}>
                <RefreshCw size={16} />
                Tentar de novo
              </button>
            </>
          ) : (
            <p className="text-sm text-text-secondary dark:text-text-darkSecondary">Carregando…</p>
          )}
        </div>
        <ToastContainer />
      </div>
    );
  }

  const onTabKeyDown = (e: React.KeyboardEvent, idx: number) => {
    let next: number | null = null;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") next = (idx + 1) % TABS.length;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = (idx - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    if (next === null) return;
    e.preventDefault();
    setTab(TABS[next].key);
    document.getElementById(`tab-${TABS[next].key}`)?.focus();
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
          aria-orientation="vertical"
          aria-label="Navegação principal"
        >
          {TABS.map(({ key, label, icon: Icon }, idx) => (
            <button
              key={key}
              id={`tab-${key}`}
              type="button"
              role="tab"
              aria-selected={tab === key}
              aria-controls={`panel-${key}`}
              tabIndex={tab === key ? 0 : -1}
              onClick={() => setTab(key)}
              onKeyDown={(e) => onTabKeyDown(e, idx)}
              title={`${label} (Ctrl+${idx + 1})`}
              className={`relative w-16 h-14 rounded-xl flex flex-col items-center justify-center gap-1 transition-all
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
                ${
                  tab === key
                    ? "bg-accent/20 text-accent"
                    : "text-[#4A4A4A] dark:text-text-darkSecondary hover:bg-black/[0.08] dark:hover:bg-white/[0.12]"
                }`}
            >
              <Icon size={20} />
              <span className="text-[11px] font-medium">{label}</span>
              {key === "tasks" && activeTasks > 0 && (
                <span
                  className="absolute top-1 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-white text-[10px] font-semibold flex items-center justify-center"
                  aria-label={`${activeTasks} tarefas ativas`}
                >
                  {activeTasks}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Páginas mantidas montadas (preserva o estado dos formulários ao navegar) */}
        <main className="flex-1 min-h-0 min-w-0 relative overflow-hidden">
          {TABS.map(({ key, Component }) => (
            <div
              key={key}
              id={`panel-${key}`}
              role="tabpanel"
              aria-labelledby={`tab-${key}`}
              hidden={tab !== key}
              className={`absolute inset-0 flex-col min-h-0 overflow-hidden ${tab === key ? "flex" : "hidden"}`}
            >
              <Component />
            </div>
          ))}
        </main>
      </div>

      {/* Diálogos globais: aparecem em qualquer aba (bandeja, atalhos, tarefas). */}
      <ConfirmDialog />
      <QuitDialog />
      <FinalWarning />
      <ToastContainer />
    </div>
  );
}
