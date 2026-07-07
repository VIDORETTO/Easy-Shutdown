// Store global (zustand): settings, scheduler ativo, toasts.

import { create } from "zustand";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { api } from "@/lib/invoke";
import { getActionLabel } from "@/lib/actions";
import type {
  ActiveSchedule,
  ScheduleRequest,
  Settings,
  ThemeMode,
  TickPayload,
  ActionKind,
} from "@/types";

export interface Toast {
  id: string;
  type: "success" | "error" | "info";
  message: string;
}

const MAX_TOASTS = 5;

// Flag síncrona para evitar race no init (StrictMode double-mount)
let initStarted = false;
let initAborted = false;
let unlisteners: UnlistenFn[] = [];

interface StoreState {
  settings: Settings | null;
  activeSchedule: ActiveSchedule | null;
  remainingSeconds: number;
  toasts: Toast[];
  hibernateStatus: string | null;
  initError: string | null;
  initialized: boolean;
  trayActionRequest: ActionKind | null;

  init: () => Promise<void>;
  cleanup: () => void;
  refreshSettings: () => Promise<void>;
  saveSettings: (s: Settings) => Promise<void>;
  startSchedule: (req: ScheduleRequest) => Promise<boolean>;
  cancelSchedule: () => Promise<void>;
  addToast: (type: Toast["type"], message: string) => void;
  removeToast: (id: string) => void;
  clearTrayRequest: () => void;
}

export const useStore = create<StoreState>((set, get) => ({
  settings: null,
  activeSchedule: null,
  remainingSeconds: 0,
  toasts: [],
  hibernateStatus: null,
  initError: null,
  initialized: false,
  trayActionRequest: null,

  init: async () => {
    if (initStarted || get().initialized) return;
    initStarted = true;
    initAborted = false;

    try {
      const settings = await api.getSettings();
      if (initAborted) return; // cleanup foi chamado durante o await
      set({ settings, initialized: true, initError: null });

      // Verifica schedule ativo (não-fatal)
      try {
        const current = await api.scheduleCurrent();
        if (initAborted) return;
        if (current) {
          set({
            activeSchedule: current,
            remainingSeconds: Math.max(
              0,
              Math.floor((current.target_ts_ms - Date.now()) / 1000)
            ),
          });
        }
      } catch {
        // não-fatal — schedule pode não existir
      }

      // Status de hibernação (não-fatal)
      try {
        const status = await api.checkHibernate();
        if (initAborted) return;
        set({ hibernateStatus: status });
      } catch {
        // não-fatal
      }

      // Listeners de eventos do backend
      const un1 = await listen<TickPayload>("schedule-tick", (e) => {
        set({ remainingSeconds: e.payload.remaining_seconds });
      });
      if (initAborted) { un1(); return; }

      const un2 = await listen<ActiveSchedule>("schedule-completed", (e) => {
        set({ activeSchedule: null, remainingSeconds: 0 });
        get().addToast(
          "success",
          `Ação "${getActionLabel(e.payload.action)}" executada.`
        );
      });
      if (initAborted) { un2(); return; }

      const un3 = await listen<{ action: ActionKind; error: string }>(
        "schedule-failed",
        (e) => {
          set({ activeSchedule: null, remainingSeconds: 0 });
          get().addToast(
            "error",
            `Falha ao executar "${getActionLabel(e.payload.action)}": ${e.payload.error}`
          );
        }
      );
      if (initAborted) { un3(); return; }

      const un4 = await listen<ActionKind>("tray-action-request", (e) => {
        set({ trayActionRequest: e.payload });
      });

      unlisteners = [un1, un2, un3, un4];
    } catch (e) {
      if (!initAborted) {
        set({ initError: String(e), initialized: true });
      }
    }
  },

  cleanup: () => {
    initAborted = true;
    unlisteners.forEach((fn) => {
      try { fn(); } catch { /* ignora */ }
    });
    unlisteners = [];
    initStarted = false;
  },

  refreshSettings: async () => {
    try {
      const settings = await api.getSettings();
      set({ settings });
    } catch (e) {
      get().addToast("error", `Erro ao carregar configurações: ${e}`);
    }
  },

  saveSettings: async (s) => {
    try {
      await api.saveSettings(s);
      set({ settings: s });
    } catch (e) {
      get().addToast("error", `Erro ao salvar: ${e}`);
      throw e;
    }
  },

  startSchedule: async (req) => {
    try {
      const active = await api.scheduleStart(req);
      set({
        activeSchedule: active,
        remainingSeconds: active
          ? Math.max(0, Math.floor((active.target_ts_ms - Date.now()) / 1000))
          : 0,
      });
      get().addToast("success", "Agendamento iniciado.");
      return true;
    } catch (e) {
      get().addToast("error", `Erro ao agendar: ${e}`);
      return false;
    }
  },

  cancelSchedule: async () => {
    try {
      await api.scheduleCancel();
      set({ activeSchedule: null, remainingSeconds: 0 });
      get().addToast("info", "Agendamento cancelado.");
    } catch (e) {
      get().addToast("error", `Erro ao cancelar: ${e}`);
    }
  },

  addToast: (type, message) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set((s) => {
      const next = [...s.toasts, { id, type, message }];
      // Cap em MAX_TOASTS (mantém os mais recentes)
      return { toasts: next.slice(-MAX_TOASTS) };
    });
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },

  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  clearTrayRequest: () => set({ trayActionRequest: null }),
}));

// Helper para aplicar o tema no documentElement.
export function applyTheme(theme: ThemeMode) {
  const root = document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const shouldUseDark = theme === "dark" || (theme === "system" && prefersDark);
  root.classList.toggle("dark", shouldUseDark);
}

// Helper para registrar listener de mudança de tema do sistema.
export function watchSystemTheme(onChange: () => void): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
