//! Ícone da bandeja do sistema com menu de ações rápidas.

use std::sync::atomic::Ordering;
use tauri::{
    menu::{CheckMenuItem, MenuBuilder, MenuItem, PredefinedMenuItem, SubmenuBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Wry,
};

use crate::actions::{self, notify, notify_error};
use crate::power;
use crate::schedule;
use crate::state::AppState;
use crate::types::{ActionKind, Source};
use crate::window;

const TRAY_ID: &str = "wise-tray";
const QUICK_MINUTES: [u64; 5] = [15, 30, 60, 120, 180];

/// Itens do menu que mudam de estado em tempo de execução.
pub struct TrayHandles {
    hibernate: MenuItem<Wry>,
    snooze: MenuItem<Wry>,
    cancel: MenuItem<Wry>,
    keep_awake: CheckMenuItem<Wry>,
}

pub fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let icon = app.default_window_icon().cloned().unwrap_or_else(|| {
        tracing::warn!("ícone padrão não encontrado, usando fallback embedado");
        tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png"))
            .unwrap_or_else(|_| tauri::image::Image::new(&[255, 255, 255, 255], 1, 1))
    });

    let mut menu = MenuBuilder::new(app)
        .item(&MenuItem::with_id(app, "show", "Mostrar", true, None::<&str>)?)
        .separator();

    let mut hibernate_item = None;
    for action in ActionKind::ALL {
        let item = MenuItem::with_id(app, format!("act-{}", action.key()), action.label_pt(), true, None::<&str>)?;
        if action == ActionKind::Hibernate {
            hibernate_item = Some(item.clone());
        }
        menu = menu.item(&item);
    }

    let mut quick = SubmenuBuilder::with_id(app, "quick-schedule", "Agendar desligamento");
    for m in QUICK_MINUTES {
        let label = if m < 60 { format!("em {m} min") } else if m == 60 { "em 1 hora".into() } else { format!("em {} horas", m / 60) };
        quick = quick.item(&MenuItem::with_id(app, format!("qs-{m}"), label, true, None::<&str>)?);
    }
    let quick = quick.build()?;

    let snooze = MenuItem::with_id(app, "next-snooze", "Adiar próxima tarefa (+15 min)", false, None::<&str>)?;
    let cancel = MenuItem::with_id(app, "next-cancel", "Cancelar próxima tarefa", false, None::<&str>)?;
    let keep_awake = CheckMenuItem::with_id(app, "keep-awake", "Manter PC acordado", true, false, None::<&str>)?;

    let menu = menu
        .separator()
        .item(&quick)
        .item(&snooze)
        .item(&cancel)
        .separator()
        .item(&keep_awake)
        .item(&PredefinedMenuItem::separator(app)?)
        .item(&MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?)
        .build()?;

    let hibernate = hibernate_item.expect("item de hibernar criado no loop");
    let _ = hibernate.set_enabled(power::hibernate_available());

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .tooltip("Wise Auto Shutdown")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| on_menu(app, event.id().as_ref()))
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                window::toggle_main(tray.app_handle());
            }
        })
        .build(app)?;

    app.manage(TrayHandles { hibernate, snooze, cancel, keep_awake });
    app.state::<AppState>().tray_built.store(true, Ordering::Relaxed);
    Ok(())
}

fn on_menu(app: &AppHandle, id: &str) {
    if let Some(minutes) = id.strip_prefix("qs-").and_then(|m| m.parse::<u64>().ok()) {
        match schedule::quick_timer(app, ActionKind::Shutdown, minutes) {
            Ok(_) => notify(app, "Wise Auto Shutdown", format!("Desligamento agendado para daqui a {minutes} min.")),
            Err(e) => notify_error(app, e),
        }
        return;
    }
    if let Some(action) = id.strip_prefix("act-").and_then(ActionKind::from_key) {
        actions::request(app, action, Source::Tray);
        return;
    }
    match id {
        "show" => window::show_main(app),
        "next-snooze" => {
            let Some(next) = schedule::next(app) else { return };
            match schedule::snooze(app, &next.task_id, 15) {
                Ok(_) => notify(app, "Wise Auto Shutdown", format!("\"{}\" adiado em 15 min.", next.action.label_pt())),
                Err(e) => notify_error(app, e),
            }
        }
        "next-cancel" => match schedule::cancel_next(app) {
            Ok(Some(msg)) => notify(app, "Wise Auto Shutdown", msg),
            Ok(None) => {}
            Err(e) => notify_error(app, e),
        },
        "keep-awake" => {
            let checked = app
                .try_state::<TrayHandles>()
                .and_then(|h| h.keep_awake.is_checked().ok())
                .unwrap_or(false);
            set_keep_awake_manual(app, checked);
        }
        "quit" => {
            let pending = schedule::pending_count(app);
            if pending > 0 {
                window::show_main(app);
                let _ = app.emit("quit-request", pending);
            } else {
                app.exit(0);
            }
        }
        _ => {}
    }
}

pub fn set_keep_awake_manual(app: &AppHandle, enabled: bool) {
    let state = app.state::<AppState>();
    state.keep_awake_manual.store(enabled, Ordering::Relaxed);
    state.wake_engine();
    let _ = app.emit("keep-awake-changed", enabled);
}

pub fn update_tooltip(app: &AppHandle, text: &str) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_tooltip(Some(text));
    }
}

/// Atualiza itens dinâmicos do menu (chamado pelo motor quando algo muda).
pub fn refresh(app: &AppHandle, has_next: bool, has_next_time: bool, keep_awake: bool) {
    if let Some(h) = app.try_state::<TrayHandles>() {
        let _ = h.cancel.set_enabled(has_next);
        let _ = h.snooze.set_enabled(has_next_time);
        let _ = h.keep_awake.set_checked(keep_awake);
    }
}

pub fn refresh_hibernate(app: &AppHandle, available: bool) {
    if let Some(h) = app.try_state::<TrayHandles>() {
        let _ = h.hibernate.set_enabled(available);
    }
}
