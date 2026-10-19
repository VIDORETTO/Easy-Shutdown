//! Easy Shutdown — lib principal (builder do Tauri).

mod actions;
mod commands;
mod hotkey_rules;
mod persist;
mod power;
mod schedule;
mod settings;
mod shortcuts;
mod state;
mod tray;
mod trigger;
mod types;
mod window;

use state::AppState;
use tauri::{AppHandle, Manager, WindowEvent};
use tauri_plugin_autostart::ManagerExt;

/// Argumento usado pelo início automático com o Windows: abre direto na bandeja.
const HIDDEN_ARG: &str = "--hidden";
const LOG_MAX_BYTES: u64 = 2 * 1024 * 1024;

/// Log em arquivo (o app não tem console em produção).
fn init_logging(app: &AppHandle) {
    let file = app.path().app_log_dir().ok().and_then(|dir| {
        std::fs::create_dir_all(&dir).ok()?;
        let path = dir.join("easy-shutdown.log");
        let too_big = std::fs::metadata(&path).map(|m| m.len() > LOG_MAX_BYTES).unwrap_or(false);
        std::fs::OpenOptions::new()
            .create(true)
            .append(!too_big)
            .write(true)
            .truncate(too_big)
            .open(path)
            .ok()
    });
    let builder = tracing_subscriber::fmt().with_max_level(tracing::Level::INFO).with_ansi(false);
    let _ = match file {
        Some(f) => builder.with_writer(std::sync::Mutex::new(f)).try_init(),
        None => builder.try_init(),
    };
}

fn on_close_requested(window: &tauri::Window, api: &tauri::CloseRequestApi) {
    let app = window.app_handle();
    let state = app.state::<AppState>();
    let s = state.settings();
    let pending = schedule::pending_count(app) > 0;
    let tray_ok = state.is_tray_built();

    if tray_ok && (s.minimize_to_tray || pending) {
        api.prevent_close();
        let _ = window.hide();
        if !s.tray_hint_shown {
            let body = if pending && !s.minimize_to_tray {
                "O app continua na bandeja para executar as tarefas agendadas."
            } else {
                "O app continua rodando na bandeja. Clique no ícone para abrir ou use \"Sair\" no menu dele."
            };
            actions::notify(app, "Easy Shutdown", body);
            let _ = settings::save(app, types::Settings { tray_hint_shown: true, ..s });
        }
    } else if pending {
        // Sem bandeja não há como voltar a uma janela escondida: só minimiza.
        api.prevent_close();
        let _ = window.minimize();
        tracing::warn!("fechamento impedido: há tarefas pendentes e a bandeja não existe");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            window::show_main(app);
        }))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![HIDDEN_ARG]),
        ))
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::new())
        .manage(shortcuts::HotkeyRegistry::default())
        .setup(|app| {
            let handle = app.handle();
            init_logging(handle);
            tracing::info!("iniciando v{}", app.package_info().version);

            if persist::migrate_legacy_data(handle) {
                power::remove_legacy_autostart();
            }
            let s = settings::load(handle);
            actions::load_history(handle);
            schedule::load(handle);

            window::apply_mica(handle);
            window::apply_theme(handle, s.theme);

            if let Err(e) = tray::build_tray(handle) {
                tracing::warn!("falha ao criar tray icon: {e}");
            }
            shortcuts::apply(handle);

            // Sincroniza o registro do Windows (também regrava o argumento --hidden).
            let r = if s.autostart { app.autolaunch().enable() } else { app.autolaunch().disable() };
            if let Err(e) = r {
                tracing::warn!("falha ao sincronizar autostart: {e}");
            }

            let hidden = std::env::args().any(|a| a == HIDDEN_ARG);
            if !hidden || !app.state::<AppState>().is_tray_built() {
                window::show_main(handle);
            }

            tauri::async_runtime::spawn(schedule::run_engine(handle.clone()));
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                on_close_requested(window, api);
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::power_action,
            commands::tasks_list,
            commands::task_create,
            commands::task_delete,
            commands::task_set_enabled,
            commands::task_snooze,
            commands::task_skip_next,
            commands::task_run_now,
            commands::next_task,
            commands::history_list,
            commands::history_clear,
            commands::get_settings,
            commands::save_settings,
            commands::reset_settings,
            commands::hotkeys_status,
            commands::hotkeys_suspend,
            commands::hotkeys_resume,
            commands::test_notification,
            commands::check_hibernate,
            commands::keep_awake_get,
            commands::keep_awake_set,
            commands::ui_info,
            commands::open_logs_dir,
            commands::app_quit,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar Easy Shutdown");
}
