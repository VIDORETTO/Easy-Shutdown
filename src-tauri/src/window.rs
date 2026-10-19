//! Helpers da janela principal (mostrar, tema, Mica, sempre no topo).

use std::sync::atomic::Ordering;
use tauri::window::{Effect, EffectsBuilder};
use tauri::{AppHandle, Manager, Theme, WebviewWindow};

use crate::power;
use crate::state::AppState;
use crate::types::ThemeMode;

pub fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    let w = app.get_webview_window("main");
    if w.is_none() {
        tracing::warn!("janela 'main' não encontrada");
    }
    w
}

/// Mostra, restaura (se minimizada) e foca a janela.
pub fn show_main(app: &AppHandle) {
    if let Some(w) = main_window(app) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// Clique no ícone da bandeja: esconde se estiver à vista, senão mostra.
pub fn toggle_main(app: &AppHandle) {
    if let Some(w) = main_window(app) {
        let visible = w.is_visible().unwrap_or(false);
        let minimized = w.is_minimized().unwrap_or(false);
        if visible && !minimized {
            let _ = w.hide();
        } else {
            show_main(app);
        }
    }
}

pub fn set_on_top(app: &AppHandle, on_top: bool) {
    if let Some(w) = main_window(app) {
        let _ = w.set_always_on_top(on_top);
    }
}

pub fn apply_theme(app: &AppHandle, theme: ThemeMode) {
    if let Some(w) = main_window(app) {
        let t = match theme {
            ThemeMode::System => None,
            ThemeMode::Light => Some(Theme::Light),
            ThemeMode::Dark => Some(Theme::Dark),
        };
        if let Err(e) = w.set_theme(t) {
            tracing::warn!("set_theme falhou: {e}");
        }
    }
}

/// Aplica Mica apenas no Windows 11 (build 22000+). Retorna se aplicou.
pub fn apply_mica(app: &AppHandle) -> bool {
    let ok = power::windows_build() >= 22000
        && main_window(app)
            .map(|w| w.set_effects(EffectsBuilder::new().effect(Effect::Mica).build()).is_ok())
            .unwrap_or(false);
    app.state::<AppState>().mica.store(ok, Ordering::Relaxed);
    ok
}
