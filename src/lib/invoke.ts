// Wrapper tipado para os comandos Tauri (invoke) do backend Rust.

import { invoke } from "@tauri-apps/api/core";
import type {
  ActionKind,
  ActiveSchedule,
  ScheduleRequest,
  Settings,
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

  scheduleStart: (request: ScheduleRequest) =>
    invokeSafe<ActiveSchedule>("schedule_start", { request }),

  scheduleCancel: () => invokeSafe<boolean>("schedule_cancel"),

  scheduleCurrent: () => invokeSafe<ActiveSchedule | null>("schedule_current"),

  getSettings: () => invokeSafe<Settings>("get_settings"),

  saveSettings: (s: Settings) =>
    invokeSafe<void>("save_settings", { s }),

  setAutostart: (enabled: boolean) =>
    invokeSafe<void>("set_autostart", { enabled }),

  isAutostartEnabled: () => invokeSafe<boolean>("is_autostart_enabled"),

  registerHotkeys: (hotkeys: Partial<Record<ActionKind, string>>) =>
    invokeSafe<void>("register_hotkeys", { hotkeys }),

  testNotification: () => invokeSafe<void>("test_notification"),

  checkHibernate: () => invokeSafe<string>("check_hibernate"),

  getAppVersion: () => invokeSafe<string>("get_app_version"),
} as const;
