// Store global (zustand): settings, tarefas, próxima execução, histórico, diálogos e toasts.

import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { api } from "@/lib/invoke";
import { getActionLabel } from "@/lib/actions";
import type {
  ActionKind,
  ActionRequest,
  HistoryEntry,
  HotkeyStatus,
  NextInfo,
  Settings,
  Task,
  TaskRequest,
  ThemeMode,
} from "@/types";

export type Tab = "home" | "tasks" | "hotkeys" | "settings" | "about";

export interface Toast {
  id: string;
  type: "success" | "error" | "info";
  message: string;
}

const MAX_TOASTS = 5;

interface StoreState {
  initialized: boolean;
  initError: string | null;
  settings: Settings | null;
  tasks: Task[];
  next: NextInfo | null;
  history: HistoryEntry[];
  hotkeyStatus: HotkeyStatus[];
  hibernateAvailable: boolean;
  keepAwake: boolean;
  mica: boolean;
  version: string;
  toasts: Toast[];
  tab: Tab;
  confirmRequest: ActionRequest | null;
  quitRequest: number | null;

  init: () => Promise<void>;
  retryInit: () => Promise<void>;
  setTab: (tab: Tab) => void;
  updateSettings: (patch: Partial<Settings>) => Promise<boolean>;
  resetSettings: () => Promise<void>;
  /** Clique numa ação na UI: confirma (se configurado) ou executa direto. */
  requestAction: (action: ActionKind) => void;
  executeAction: (action: ActionKind, force: boolean) => Promise<boolean>;
  closeConfirm: () => void;
  closeQuit: () => void;
  createTask: (req: TaskRequest) => Promise<boolean>;
  deleteTask: (id: string) => Promise<void>;
  setTaskEnabled: (id: string, enabled: boolean) => Promise<void>;
  snoozeTask: (id: string, minutes: number) => Promise<void>;
  skipTask: (id: string) => Promise<void>;
  runTaskNow: (id: string) => Promise<void>;
  refreshHibernate: () => Promise<void>;
  setKeepAwake: (enabled: boolean) => Promise<void>;
  clearHistory: () => Promise<void>;
  addToast: (type: Toast["type"], message: string) => void;
  removeToast: (id: string) => void;
}

// Promise única: o StrictMode monta o App duas vezes, mas listeners e carga ocorrem uma vez.
let initPromise: Promise<void> | null = null;
let listenersRegistered = false;
// Salvamentos de settings em série — cada um parte do estado otimista mais recente.
let saveChain: Promise<unknown> = Promise.resolve();

export const useStore = create<StoreState>((set, get) => {
  const toastError = (prefix: string) => (e: unknown) => get().addToast("error", `${prefix}: ${e}`);

  async function load() {
    const settings = await api.getSettings();
    const [tasks, next, history, hotkeyStatus, hibernateAvailable, keepAwake, ui] = await Promise.all([
      api.tasksList(),
      api.nextTask(),
      api.historyList(),
      api.hotkeysStatus(),
      api.checkHibernate().catch(() => true),
      api.keepAwakeGet().catch(() => false),
      api.uiInfo().catch(() => ({ mica: false, version: "" })),
    ]);
    set({
      settings,
      tasks,
      next,
      history,
      hotkeyStatus,
      hibernateAvailable,
      keepAwake,
      mica: ui.mica,
      version: ui.version,
      initialized: true,
      initError: null,
    });
  }

  async function registerListeners() {
    if (listenersRegistered) return;
    listenersRegistered = true;
    await Promise.all([
      listen<NextInfo | null>("schedule-tick", (e) => set({ next: e.payload })),
      listen<Task[]>("tasks-changed", (e) => set({ tasks: e.payload })),
      listen<HistoryEntry[]>("history-changed", (e) => set({ history: e.payload })),
      listen<HotkeyStatus[]>("hotkeys-status", (e) => set({ hotkeyStatus: e.payload })),
      listen<boolean>("keep-awake-changed", (e) => set({ keepAwake: e.payload })),
      listen<ActionRequest>("action-request", (e) => set({ confirmRequest: e.payload })),
      listen<number>("quit-request", (e) => set({ quitRequest: e.payload })),
      listen<HistoryEntry>("action-executed", (e) => {
        // Ações disparadas pela própria UI já mostram feedback no clique.
        if (e.payload.source !== "task") return;
        const label = getActionLabel(e.payload.action);
        if (e.payload.status === "ok") get().addToast("success", `Tarefa executada: ${label}.`);
        else get().addToast("error", `Falha na tarefa "${label}": ${e.payload.detail ?? ""}`);
      }),
    ]);
  }

  return {
    initialized: false,
    initError: null,
    settings: null,
    tasks: [],
    next: null,
    history: [],
    hotkeyStatus: [],
    hibernateAvailable: true,
    keepAwake: false,
    mica: false,
    version: "",
    toasts: [],
    tab: "home",
    confirmRequest: null,
    quitRequest: null,

    init: () => {
      if (!initPromise) {
        initPromise = (async () => {
          try {
            await registerListeners();
            await load();
          } catch (e) {
            set({ initError: String(e), initialized: true });
          }
        })();
      }
      return initPromise;
    },

    retryInit: () => {
      initPromise = null;
      set({ initError: null, initialized: false });
      return get().init();
    },

    setTab: (tab) => set({ tab }),

    updateSettings: (patch) => {
      const current = get().settings;
      if (!current) return Promise.resolve(false);
      const next = { ...current, ...patch };
      set({ settings: next });
      const p = saveChain
        .then(() => api.saveSettings(next))
        .then((saved) => {
          if (get().settings === next) set({ settings: saved });
          return true;
        })
        .catch(async (e) => {
          get().addToast("error", `Erro ao salvar: ${e}`);
          try {
            set({ settings: await api.getSettings() });
          } catch {
            /* mantém estado atual */
          }
          return false;
        });
      saveChain = p;
      return p;
    },

    resetSettings: async () => {
      try {
        const s = await api.resetSettings();
        set({ settings: s });
        get().addToast("success", "Configurações restauradas para o padrão.");
      } catch (e) {
        toastError("Erro ao restaurar")(e);
      }
    },

    requestAction: (action) => {
      if (get().settings?.confirm_before_action ?? true) {
        set({ confirmRequest: { action, source: "app" } });
      } else {
        void get().executeAction(action, false);
      }
    },

    executeAction: async (action, force) => {
      try {
        await api.powerAction(action, force);
        get().addToast("success", `"${getActionLabel(action)}" enviado ao Windows.`);
        return true;
      } catch (e) {
        toastError(`Falha em "${getActionLabel(action)}"`)(e);
        return false;
      }
    },

    closeConfirm: () => set({ confirmRequest: null }),
    closeQuit: () => set({ quitRequest: null }),

    createTask: async (req) => {
      try {
        await api.taskCreate(req);
        get().addToast("success", "Tarefa agendada.");
        return true;
      } catch (e) {
        toastError("Não foi possível agendar")(e);
        return false;
      }
    },

    deleteTask: async (id) => {
      try {
        await api.taskDelete(id);
        get().addToast("info", "Tarefa removida.");
      } catch (e) {
        toastError("Erro ao remover")(e);
      }
    },

    setTaskEnabled: async (id, enabled) => {
      try {
        await api.taskSetEnabled(id, enabled);
      } catch (e) {
        toastError("Erro")(e);
      }
    },

    snoozeTask: async (id, minutes) => {
      try {
        await api.taskSnooze(id, minutes);
        get().addToast("info", `Adiado em ${minutes} min.`);
      } catch (e) {
        toastError("Erro ao adiar")(e);
      }
    },

    skipTask: async (id) => {
      try {
        await api.taskSkipNext(id);
        get().addToast("info", "Próxima ocorrência pulada.");
      } catch (e) {
        toastError("Erro ao pular")(e);
      }
    },

    runTaskNow: async (id) => {
      try {
        await api.taskRunNow(id);
      } catch (e) {
        toastError("Falha ao executar")(e);
      }
    },

    refreshHibernate: async () => {
      try {
        set({ hibernateAvailable: await api.checkHibernate() });
      } catch {
        /* mantém o último valor */
      }
    },

    setKeepAwake: async (enabled) => {
      try {
        await api.keepAwakeSet(enabled);
        set({ keepAwake: enabled });
      } catch (e) {
        toastError("Erro")(e);
      }
    },

    clearHistory: async () => {
      try {
        await api.historyClear();
      } catch (e) {
        toastError("Erro ao limpar histórico")(e);
      }
    },

    addToast: (type, message) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      set((s) => ({ toasts: [...s.toasts, { id, type, message }].slice(-MAX_TOASTS) }));
    },

    removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  };
});

// Helper para aplicar o tema no documentElement.
export function applyTheme(theme: ThemeMode) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = theme === "dark" || (theme === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", dark);
}

// Helper para registrar listener de mudança de tema do sistema.
export function watchSystemTheme(onChange: () => void): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
