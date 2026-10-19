// Wrapper tipado para os comandos Tauri (invoke) do backend Rust.

import { invoke } from "@tauri-apps/api/core";
import type {
  ActionKind,
  HistoryEntry,
  HotkeyStatus,
  NextInfo,
  Settings,
  Task,
  TaskRequest,
  UiInfo,
} from "@/types";

/** Normaliza erros do Tauri para string legível. */
function normalizeError(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  return String(e);
}

async function invokeSafe<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw normalizeError(e);
  }
}

export const api = {
  powerAction: (action: ActionKind, force: boolean) =>
    invokeSafe<void>("power_action", { action, force }),

  tasksList: () => invokeSafe<Task[]>("tasks_list"),
  taskCreate: (request: TaskRequest) => invokeSafe<Task>("task_create", { request }),
  taskDelete: (id: string) => invokeSafe<void>("task_delete", { id }),
  taskSetEnabled: (id: string, enabled: boolean) =>
    invokeSafe<void>("task_set_enabled", { id, enabled }),
  taskSnooze: (id: string, minutes: number) =>
    invokeSafe<number>("task_snooze", { id, minutes }),
  taskSkipNext: (id: string) => invokeSafe<void>("task_skip_next", { id }),
  taskRunNow: (id: string) => invokeSafe<void>("task_run_now", { id }),
  nextTask: () => invokeSafe<NextInfo | null>("next_task"),

  historyList: () => invokeSafe<HistoryEntry[]>("history_list"),
  historyClear: () => invokeSafe<void>("history_clear"),

  getSettings: () => invokeSafe<Settings>("get_settings"),
  saveSettings: (s: Settings) => invokeSafe<Settings>("save_settings", { s }),
  resetSettings: () => invokeSafe<Settings>("reset_settings"),

  hotkeysStatus: () => invokeSafe<HotkeyStatus[]>("hotkeys_status"),
  hotkeysSuspend: () => invokeSafe<void>("hotkeys_suspend"),
  hotkeysResume: () => invokeSafe<void>("hotkeys_resume"),

  testNotification: () => invokeSafe<void>("test_notification"),
  checkHibernate: () => invokeSafe<boolean>("check_hibernate"),
  keepAwakeGet: () => invokeSafe<boolean>("keep_awake_get"),
  keepAwakeSet: (enabled: boolean) => invokeSafe<void>("keep_awake_set", { enabled }),
  uiInfo: () => invokeSafe<UiInfo>("ui_info"),
  openLogsDir: () => invokeSafe<void>("open_logs_dir"),
  appQuit: () => invokeSafe<void>("app_quit"),
} as const;
