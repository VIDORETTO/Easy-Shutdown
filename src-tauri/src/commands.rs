//! Comandos Tauri expostos ao frontend via `invoke`.

use std::sync::atomic::Ordering;
use tauri::{AppHandle, Manager};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_opener::OpenerExt;

use crate::actions::{self, notify};
use crate::power;
use crate::schedule;
use crate::settings;
use crate::shortcuts;
use crate::state::AppState;
use crate::tray;
use crate::types::{
    ActionKind, HistoryEntry, HotkeyStatus, NextInfo, Settings, Source, TaskRequest, TaskView, UiInfo,
};

#[tauri::command]
pub fn power_action(app: AppHandle, action: ActionKind, force: bool) -> Result<(), String> {
    actions::execute(&app, action, force, Source::App)
}

// ------------------------------------------------------------ tarefas

#[tauri::command]
pub fn tasks_list(app: AppHandle) -> Vec<TaskView> {
    schedule::list(&app)
}

#[tauri::command]
pub fn task_create(app: AppHandle, request: TaskRequest) -> Result<TaskView, String> {
    schedule::create(&app, request)
}

#[tauri::command]
pub fn task_delete(app: AppHandle, id: String) -> Result<(), String> {
    schedule::delete(&app, &id)
}

#[tauri::command]
pub fn task_set_enabled(app: AppHandle, id: String, enabled: bool) -> Result<(), String> {
    schedule::set_enabled(&app, &id, enabled)
}

#[tauri::command]
pub fn task_snooze(app: AppHandle, id: String, minutes: u32) -> Result<i64, String> {
    schedule::snooze(&app, &id, minutes)
}

#[tauri::command]
pub fn task_skip_next(app: AppHandle, id: String) -> Result<(), String> {
    schedule::skip_next(&app, &id)
}

#[tauri::command]
pub fn task_run_now(app: AppHandle, id: String) -> Result<(), String> {
    schedule::run_now(&app, &id)
}

#[tauri::command]
pub fn next_task(app: AppHandle) -> Option<NextInfo> {
    schedule::next(&app)
}

// ------------------------------------------------------------ histórico

#[tauri::command]
pub fn history_list(app: AppHandle) -> Vec<HistoryEntry> {
    actions::history(&app)
}

#[tauri::command]
pub fn history_clear(app: AppHandle) -> Result<(), String> {
    actions::clear_history(&app)
}

// ------------------------------------------------------------ configurações

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Settings {
    let mut s = settings::get(&app);
    // Reflete o estado real do registro (pode ter sido alterado fora do app).
    if let Ok(enabled) = app.autolaunch().is_enabled() {
        s.autostart = enabled;
    }
    s
}

#[tauri::command]
pub fn save_settings(app: AppHandle, s: Settings) -> Result<Settings, String> {
    settings::save(&app, s)
}

#[tauri::command]
pub fn reset_settings(app: AppHandle) -> Result<Settings, String> {
    settings::reset(&app)
}

// ------------------------------------------------------------ atalhos

#[tauri::command]
pub fn hotkeys_status(app: AppHandle) -> Vec<HotkeyStatus> {
    shortcuts::status(&app)
}

#[tauri::command]
pub fn hotkeys_suspend(app: AppHandle) {
    shortcuts::suspend(&app)
}

#[tauri::command]
pub fn hotkeys_resume(app: AppHandle) {
    shortcuts::resume(&app)
}

// ------------------------------------------------------------ sistema

#[tauri::command]
pub fn test_notification(app: AppHandle) {
    notify(&app, "Easy Shutdown", "Notificação de teste — funcionando!");
}

#[tauri::command]
pub fn check_hibernate(app: AppHandle) -> bool {
    let available = power::hibernate_available();
    tray::refresh_hibernate(&app, available);
    available
}

#[tauri::command]
pub fn keep_awake_get(app: AppHandle) -> bool {
    app.state::<AppState>().keep_awake_manual.load(Ordering::Relaxed)
}

#[tauri::command]
pub fn keep_awake_set(app: AppHandle, enabled: bool) {
    tray::set_keep_awake_manual(&app, enabled);
}

#[tauri::command]
pub fn ui_info(app: AppHandle) -> UiInfo {
    UiInfo {
        mica: app.state::<AppState>().mica.load(Ordering::Relaxed),
        version: app.package_info().version.to_string(),
    }
}

#[tauri::command]
pub fn open_logs_dir(app: AppHandle) -> Result<(), String> {
    let dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    app.opener()
        .open_path(dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn app_quit(app: AppHandle) {
    app.exit(0);
}
