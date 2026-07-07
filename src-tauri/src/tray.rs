//! Ícone da bandeja do sistema com menu de ações rápidas.

use tauri::{
    menu::{MenuBuilder, MenuItem, PredefinedMenuItem, SubmenuBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};
use tauri_plugin_notification::NotificationExt;

use crate::power;
use crate::state::AppState;
use crate::types::ActionKind;

pub fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let icon = app
        .default_window_icon()
        .cloned()
        .unwrap_or_else(|| {
            tracing::warn!("ícone padrão não encontrado, usando fallback embedado");
            tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png"))
                .unwrap_or_else(|_| tauri::image::Image::new(&[255, 255, 255, 255], 1, 1))
        });

    let show = MenuItem::with_id(app, "tray-show", "Mostrar", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let shutdown = MenuItem::with_id(app, "tray-shutdown", "Desligar", true, None::<&str>)?;
    let restart = MenuItem::with_id(app, "tray-restart", "Reiniciar", true, None::<&str>)?;
    let sleep = MenuItem::with_id(app, "tray-sleep", "Suspender", true, None::<&str>)?;
    let hibernate = MenuItem::with_id(app, "tray-hibernate", "Hibernar", true, None::<&str>)?;
    let lock = MenuItem::with_id(app, "tray-lock", "Bloquear", true, None::<&str>)?;
    let logoff = MenuItem::with_id(app, "tray-logoff", "Encerrar sessão", true, None::<&str>)?;
    let sep2 = PredefinedMenuItem::separator(app)?;

    // Submenu: quick-schedule presets
    let quick_schedule = SubmenuBuilder::with_id(app, "quick-schedule", "Agendar desligamento")
        .item(&MenuItem::with_id(app, "qs-15", "em 15 min", true, None::<&str>)?)
        .item(&MenuItem::with_id(app, "qs-30", "em 30 min", true, None::<&str>)?)
        .item(&MenuItem::with_id(app, "qs-60", "em 1 hora", true, None::<&str>)?)
        .item(&MenuItem::with_id(app, "qs-120", "em 2 horas", true, None::<&str>)?)
        .build()?;

    let sep3 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "tray-quit", "Sair", true, None::<&str>)?;

    let menu = MenuBuilder::new(app)
        .item(&show)
        .item(&sep1)
        .item(&shutdown)
        .item(&restart)
        .item(&sleep)
        .item(&hibernate)
        .item(&lock)
        .item(&logoff)
        .item(&sep2)
        .item(&quick_schedule)
        .item(&sep3)
        .item(&quit)
        .build()?;

    let _tray = TrayIconBuilder::with_id("wise-tray")
        .icon(icon)
        .tooltip("Wise Auto Shutdown")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            // Quick-schedule presets
            if let Some(minutes_str) = id.strip_prefix("qs-") {
                if let Ok(minutes) = minutes_str.parse::<u64>() {
                    start_quick_schedule(app, ActionKind::Shutdown, minutes);
                }
                return;
            }

            match id {
                "tray-show" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "tray-quit" => {
                    if crate::schedule::has_active(app) {
                        let _ = app.notification().builder()
                            .title("Wise Auto Shutdown")
                            .body("Há um agendamento ativo. Cancele antes de sair.")
                            .show();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    } else {
                        app.exit(0);
                    }
                }
                id_str @ ("tray-shutdown" | "tray-restart" | "tray-sleep" | "tray-hibernate" | "tray-lock" | "tray-logoff") => {
                    let state: tauri::State<'_, AppState> = app.state();
                    let confirm = state.get_confirm_before_action();
                    let action = match id_str {
                        "tray-shutdown" => ActionKind::Shutdown,
                        "tray-restart" => ActionKind::Restart,
                        "tray-sleep" => ActionKind::Sleep,
                        "tray-hibernate" => ActionKind::Hibernate,
                        "tray-lock" => ActionKind::Lock,
                        "tray-logoff" => ActionKind::Logoff,
                        _ => return,
                    };
                    if confirm {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                            if let Err(e) = app.emit("tray-action-request", action) {
                                tracing::error!("emit tray-action-request falhou: {e}");
                            }
                        } else {
                            tracing::error!("janela não encontrada, executando sem confirmação");
                            execute_with_notification(app, action, false);
                        }
                    } else {
                        execute_with_notification(app, action, false);
                    }
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        })
        .build(app)?;

    let state: tauri::State<'_, AppState> = app.state();
    state.set_tray_built(true);

    Ok(())
}

/// Atualiza o tooltip do tray dinamicamente.
pub fn update_tooltip(app: &AppHandle, text: Option<&str>) -> tauri::Result<()> {
    if let Some(tray) = app.tray_by_id("wise-tray") {
        let tooltip = text.unwrap_or("Wise Auto Shutdown");
        tray.set_tooltip(Some(tooltip))?;
    }
    Ok(())
}

fn start_quick_schedule(app: &AppHandle, action: ActionKind, minutes: u64) {
    use crate::schedule;
    use crate::types::ScheduleMode;
    use crate::types::ScheduleRequest;

    let req = ScheduleRequest {
        action,
        mode: ScheduleMode::Timer { seconds: minutes * 60 },
        force: false,
        reminder_minutes: 1,
    };

    match schedule::start(app, req) {
        Ok(_) => {
            let _ = app.notification().builder()
                .title("Wise Auto Shutdown")
                .body(format!("{} agendado em {} min.", action.label_pt(), minutes))
                .show();
        }
        Err(e) => {
            let _ = app.notification().builder()
                .title("Wise Auto Shutdown — erro")
                .body(e)
                .show();
        }
    }
}

fn execute_with_notification(app: &AppHandle, action: ActionKind, force: bool) {
    if let Err(e) = power::execute(action, force) {
        let _ = app
            .notification()
            .builder()
            .title("Wise Auto Shutdown — erro")
            .body(e)
            .show();
    }
}
