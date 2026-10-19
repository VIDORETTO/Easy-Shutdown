// Tipos TypeScript espelhando os enums/structs do Rust (src-tauri/src/types.rs).

export type ActionKind =
  | "shutdown"
  | "restart"
  | "hibernate"
  | "sleep"
  | "lock"
  | "logoff"
  | "monitor_off";

/** O que um atalho global dispara. */
export type HotkeyTarget = ActionKind | "cancel_next";

export type Trigger =
  | { once: { target_ts_ms: number } }
  | { weekly: { hh_mm: string; days: number[] } }
  | { idle: { minutes: number } };

export type TriggerRequest =
  | { timer: { seconds: number } }
  | { at: { date: string; hh_mm: string } }
  | { weekly: { hh_mm: string; days: number[] } }
  | { idle: { minutes: number } };

export interface TaskRequest {
  action: ActionKind;
  force: boolean;
  reminder_minutes: number;
  trigger: TriggerRequest;
}

export interface Task {
  id: string;
  action: ActionKind;
  force: boolean;
  reminder_minutes: number;
  trigger: Trigger;
  enabled: boolean;
  created_ts_ms: number;
  anchor_ts_ms: number;
  override_next_ms: number | null;
  /** Próxima execução calculada (null para tarefas por inatividade). */
  next_ts_ms: number | null;
}

export interface NextInfo {
  task_id: string;
  action: ActionKind;
  target_ts_ms: number;
  remaining_seconds: number;
  kind: "time" | "idle";
  recurring: boolean;
}

export type Source = "app" | "tray" | "hotkey" | "task";

export interface HistoryEntry {
  ts_ms: number;
  action: ActionKind;
  source: Source;
  status: "ok" | "error" | "missed";
  detail: string | null;
}

export interface HotkeyStatus {
  target: HotkeyTarget;
  keys: string;
  registered: boolean;
  error: string | null;
}

export interface ActionRequest {
  action: ActionKind;
  source: Source;
}

export interface UiInfo {
  mica: boolean;
  version: string;
}

export type ThemeMode = "system" | "light" | "dark";

export interface Settings {
  settings_version: number;
  autostart: boolean;
  minimize_to_tray: boolean;
  theme: ThemeMode;
  hotkeys: Partial<Record<HotkeyTarget, string>>;
  hotkeys_enabled: boolean;
  default_reminder_minutes: number;
  confirm_before_action: boolean;
  final_warning_seconds: number;
  keep_awake_during_tasks: boolean;
  tray_hint_shown: boolean;
}
