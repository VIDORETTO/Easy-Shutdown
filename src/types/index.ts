// Tipos TypeScript espelhando os enums/structs do Rust (src-tauri/src/types.rs).

export type ActionKind =
  | "shutdown"
  | "restart"
  | "hibernate"
  | "sleep"
  | "lock"
  | "logoff";

export type ScheduleMode =
  | { timer: { seconds: number } }
  | { at_time: { hh_mm: string } };

export interface ScheduleRequest {
  action: ActionKind;
  mode: ScheduleMode;
  force?: boolean;
  reminder_minutes?: number;
}

export interface ActiveSchedule {
  id: string;
  action: ActionKind;
  force: boolean;
  target_ts_ms: number;
  reminder_minutes: number;
  reminder_fired?: boolean;
}

export type ThemeMode = "system" | "light" | "dark";

export interface Settings {
  autostart: boolean;
  minimize_to_tray: boolean;
  theme: ThemeMode;
  hotkeys: Partial<Record<ActionKind, string>>;
  default_reminder_minutes: number;
  confirm_before_action: boolean;
}

export interface TickPayload {
  remaining_seconds: number;
  action: ActionKind;
  target_ts_ms: number;
}
