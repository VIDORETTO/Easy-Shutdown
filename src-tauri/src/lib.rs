//! Wise Auto Shutdown — lib principal (builder do Tauri).

mod commands;
mod power;
mod schedule;
mod settings;
mod shortcuts;
mod state;
mod tray;
mod types;

use shortcuts::HotkeyMap;
use state::AppState;
use tauri::{Manager, WindowEvent};
use tauri_plugin_autostart::ManagerExt;
use types::ActionKind;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .try_init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            } else {
                tracing::warn!("single-instance: janela 'main' não encontrada");
            }
        }))
        .manage(AppState::new())
        .manage(shortcuts::new_map())
        .setup(|app| {
            // Tray icon (não-fatal)
            let tray_result = tray::build_tray(app.handle());
            if let Err(e) = &tray_result {
                tracing::warn!("falha ao criar tray icon: {e}");
            }

            // Carrega settings, registra hotkeys, sincroniza autostart
            let s = settings::load(app.handle());

            // Atualiza caches de settings
            let app_state: tauri::State<'_, AppState> = app.state();
            app_state.set_minimize_to_tray(s.minimize_to_tray);
            app_state.set_confirm_before_action(s.confirm_before_action);

            let map: HotkeyMap = app.state::<HotkeyMap>().inner().clone();
            {
                let mut guard = map.lock();
                for (action_str, keys) in &s.hotkeys {
                    if let Some(action) = ActionKind::from_kebab(action_str) {
                        guard.insert(keys.clone(), action);
                    }
                }
            }
            let _ = shortcuts::register_all(app.handle(), map);

            // Sincroniza autostart
            if s.autostart {
                let _ = app.autolaunch().enable();
            } else {
                let _ = app.autolaunch().disable();
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                let state: tauri::State<'_, AppState> = app.state();
                let minimize = state.get_minimize_to_tray();
                let tray_ok = state.is_tray_built();
                let has_schedule = schedule::has_active(app);

                // Se há schedule ativo: sempre esconde (não fecha — schedule seria perdido)
                // Se minimize_to_tray e tray_ok: esconde
                // Se minimize_to_tray mas sem tray: não esconde (usuário não conseguiria voltar)
                if has_schedule && !tray_ok {
                    // Schedule ativo mas sem tray — mostra notificação em vez de esconder
                    api.prevent_close();
                    let _ = window.minimize();
                    tracing::warn!("close impedido: schedule ativo sem tray, minimizando");
                } else if (minimize && tray_ok) || has_schedule {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::power_action,
            commands::schedule_start,
            commands::schedule_cancel,
            commands::schedule_current,
            commands::get_settings,
            commands::save_settings,
            commands::set_autostart,
            commands::is_autostart_enabled,
            commands::register_hotkeys,
            commands::test_notification,
            commands::check_hibernate,
            commands::get_app_version,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar Wise Auto Shutdown");
}
