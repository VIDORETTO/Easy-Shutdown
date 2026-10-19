//! Configurações: persistência em settings.json + efeitos colaterais ao salvar.

use tauri::{AppHandle, Manager};
use tauri_plugin_autostart::ManagerExt;

use crate::persist;
use crate::state::AppState;
use crate::types::Settings;
use crate::{shortcuts, window};

pub const CURRENT_VERSION: u32 = 2;
const FILE: &str = "settings.json";

/// Atalhos que a v0.1 registrava por padrão. Todos usam Ctrl+Alt+letra, que dispara
/// ao digitar com AltGr — removidos na migração se o usuário nunca os alterou.
const LEGACY_HOTKEYS: &[(&str, &str)] = &[
    ("shutdown", "Ctrl+Alt+D"),
    ("restart", "Ctrl+Alt+R"),
    ("lock", "Ctrl+Alt+L"),
    ("sleep", "Ctrl+Alt+S"),
    ("hibernate", "Ctrl+Alt+H"),
    ("logoff", "Ctrl+Alt+Q"),
];

fn migrate(s: &mut Settings) -> bool {
    if s.settings_version >= CURRENT_VERSION {
        return false;
    }
    let is_legacy = s.hotkeys.len() == LEGACY_HOTKEYS.len()
        && LEGACY_HOTKEYS.iter().all(|(a, k)| s.hotkeys.get(*a).map(String::as_str) == Some(*k));
    if is_legacy {
        tracing::info!("migração: removendo atalhos padrão antigos (conflitam com AltGr)");
        s.hotkeys.clear();
    }
    if s.default_reminder_minutes > 120 {
        s.default_reminder_minutes = 120;
    }
    s.settings_version = CURRENT_VERSION;
    true
}

/// Lê do disco (aplicando migração) e popula o cache em AppState.
pub fn load(app: &AppHandle) -> Settings {
    let path = persist::data_file(app, FILE);
    let mut s: Settings = persist::load_json(&path).unwrap_or_default();
    if migrate(&mut s) {
        if let Err(e) = persist::save_json(&path, &s) {
            tracing::error!("falha ao salvar settings migrado: {e}");
        }
    }
    *app.state::<AppState>().settings.write() = s.clone();
    s
}

pub fn get(app: &AppHandle) -> Settings {
    app.state::<AppState>().settings()
}

fn sanitize(mut s: Settings) -> Settings {
    s.settings_version = CURRENT_VERSION;
    s.default_reminder_minutes = s.default_reminder_minutes.min(120);
    s.final_warning_seconds = s.final_warning_seconds.min(600);
    s.hotkeys.retain(|_, v| !v.trim().is_empty());
    s
}

/// Salva e aplica o que mudou (atalhos, tema, autostart).
pub fn save(app: &AppHandle, new: Settings) -> Result<Settings, String> {
    let new = sanitize(new);
    let old = get(app);

    if new.autostart != old.autostart {
        let r = if new.autostart { app.autolaunch().enable() } else { app.autolaunch().disable() };
        r.map_err(|e| format!("não foi possível alterar o início com o Windows: {e}"))?;
    }

    persist::save_json(&persist::data_file(app, FILE), &new)?;
    let state = app.state::<AppState>();
    *state.settings.write() = new.clone();

    if new.hotkeys != old.hotkeys || new.hotkeys_enabled != old.hotkeys_enabled {
        shortcuts::apply(app);
    }
    if new.theme != old.theme {
        window::apply_theme(app, new.theme);
    }
    state.wake_engine();
    Ok(new)
}

/// Volta aos padrões, preservando apenas o aviso da bandeja já mostrado.
pub fn reset(app: &AppHandle) -> Result<Settings, String> {
    let old = get(app);
    let s = Settings { tray_hint_shown: old.tray_hint_shown, ..Settings::default() };
    save(app, s)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrates_legacy_hotkeys() {
        let mut s = Settings { settings_version: 0, ..Settings::default() };
        for (a, k) in LEGACY_HOTKEYS {
            s.hotkeys.insert((*a).into(), (*k).into());
        }
        assert!(migrate(&mut s));
        assert!(s.hotkeys.is_empty());
        assert_eq!(s.settings_version, CURRENT_VERSION);
    }

    #[test]
    fn keeps_customized_hotkeys() {
        let mut s = Settings { settings_version: 0, ..Settings::default() };
        s.hotkeys.insert("shutdown".into(), "Ctrl+Alt+F9".into());
        assert!(migrate(&mut s));
        assert_eq!(s.hotkeys.len(), 1);
    }

    #[test]
    fn old_file_without_version_deserializes_as_zero() {
        let s: Settings = serde_json::from_str(r#"{"autostart":true}"#).unwrap();
        assert_eq!(s.settings_version, 0);
        assert!(s.autostart);
        assert!(s.confirm_before_action);
    }
}
