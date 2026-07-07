//! Comandos Tauri expostos ao frontend via `invoke`.

use std::collections::HashMap;
use tauri::{AppHandle, Manager};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_notification::NotificationExt;

use crate::power;
use crate::schedule;
use crate::settings;
use crate::shortcuts::{self, HotkeyMap};
use crate::types::{ActionKind, ActiveSchedule, ScheduleRequest, Settings};

#[tauri::command]
pub fn power_action(action: ActionKind, force: bool) -> Result<(), String> {
    power::execute(action, force)
}

#[tauri::command]
pub fn schedule_start(app: AppHandle, request: ScheduleRequest) -> Result<ActiveSchedule, String> {
    schedule::start(&app, request)
}

#[tauri::command]
pub fn schedule_cancel(app: AppHandle) -> Result<bool, String> {
    Ok(schedule::cancel(&app))
}

#[tauri::command]
pub fn schedule_current(app: AppHandle) -> Option<ActiveSchedule> {
    schedule::current(&app)
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Settings {
    settings::load(&app)
}

#[tauri::command]
pub fn save_settings(app: AppHandle, s: Settings) -> Result<(), String> {
    settings::save(&app, &s)
}

#[tauri::command]
pub fn set_autostart(app: AppHandle, enabled: bool) -> Result<(), String> {
    if enabled {
        app.autolaunch().enable().map_err(|e| e.to_string())?;
    } else {
        app.autolaunch().disable().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn is_autostart_enabled(app: AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn register_hotkeys(
    app: AppHandle,
    hotkeys: HashMap<String, String>,
) -> Result<(), String> {
    let map: HotkeyMap = app.state::<HotkeyMap>().inner().clone();
    {
        let mut guard = map.lock();
        guard.clear();
        let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
        for (action_str, keys) in &hotkeys {
            if keys.is_empty() {
                continue;
            }
            let keys_norm = keys.to_lowercase().replace(' ', "");
            // Detecção de conflito: pula se já vimos esta combinação
            if !seen.insert(keys_norm) {
                tracing::warn!("conflito de atalho: '{}' duplicado, ignorando", keys);
                continue;
            }
            if let Some(action) = ActionKind::from_kebab(action_str) {
                guard.insert(keys.clone(), action);
            }
        }
    }
    shortcuts::register_all(&app, map)
}

#[tauri::command]
pub fn test_notification(app: AppHandle) -> Result<(), String> {
    app.notification()
        .builder()
        .title("Wise Auto Shutdown")
        .body("Notificação de teste — funcionando!")
        .show()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn check_hibernate() -> String {
    power::check_hibernate_available()
}

#[tauri::command]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
