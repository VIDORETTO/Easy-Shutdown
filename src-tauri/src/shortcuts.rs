//! Registro de atalhos globais (hotkeys) via tauri-plugin-global-shortcut.

use parking_lot::Mutex;
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

use crate::actions::{self, notify};
use crate::hotkey_rules::{self, Combo};
use crate::schedule;
use crate::state::AppState;
use crate::types::{HotkeyStatus, HotkeyTarget, Source};

#[derive(Default)]
pub struct HotkeyRegistry {
    status: Mutex<Vec<HotkeyStatus>>,
    /// Durante a captura de um novo atalho tudo fica desregistrado — senão apertar
    /// uma combinação já em uso executaria a ação.
    suspended: AtomicBool,
}

fn to_code(key: &str) -> Option<Code> {
    const LETTERS: [Code; 26] = [
        Code::KeyA, Code::KeyB, Code::KeyC, Code::KeyD, Code::KeyE, Code::KeyF, Code::KeyG,
        Code::KeyH, Code::KeyI, Code::KeyJ, Code::KeyK, Code::KeyL, Code::KeyM, Code::KeyN,
        Code::KeyO, Code::KeyP, Code::KeyQ, Code::KeyR, Code::KeyS, Code::KeyT, Code::KeyU,
        Code::KeyV, Code::KeyW, Code::KeyX, Code::KeyY, Code::KeyZ,
    ];
    const DIGITS: [Code; 10] = [
        Code::Digit0, Code::Digit1, Code::Digit2, Code::Digit3, Code::Digit4, Code::Digit5,
        Code::Digit6, Code::Digit7, Code::Digit8, Code::Digit9,
    ];
    const NUMPAD: [Code; 10] = [
        Code::Numpad0, Code::Numpad1, Code::Numpad2, Code::Numpad3, Code::Numpad4,
        Code::Numpad5, Code::Numpad6, Code::Numpad7, Code::Numpad8, Code::Numpad9,
    ];
    const FKEYS: [Code; 24] = [
        Code::F1, Code::F2, Code::F3, Code::F4, Code::F5, Code::F6, Code::F7, Code::F8,
        Code::F9, Code::F10, Code::F11, Code::F12, Code::F13, Code::F14, Code::F15, Code::F16,
        Code::F17, Code::F18, Code::F19, Code::F20, Code::F21, Code::F22, Code::F23, Code::F24,
    ];

    let c = key.chars().next()?;
    if key.len() == 1 && c.is_ascii_lowercase() {
        return Some(LETTERS[(c as u8 - b'a') as usize]);
    }
    if key.len() == 1 && c.is_ascii_digit() {
        return Some(DIGITS[(c as u8 - b'0') as usize]);
    }
    if let Some(d) = key.strip_prefix("num").and_then(|d| d.parse::<usize>().ok()) {
        return NUMPAD.get(d).copied();
    }
    if let Some(n) = key.strip_prefix('f').and_then(|n| n.parse::<usize>().ok()) {
        return FKEYS.get(n.wrapping_sub(1)).copied();
    }
    Some(match key {
        "space" => Code::Space,
        "enter" => Code::Enter,
        "tab" => Code::Tab,
        "esc" => Code::Escape,
        "home" => Code::Home,
        "end" => Code::End,
        "delete" => Code::Delete,
        "insert" => Code::Insert,
        "pageup" => Code::PageUp,
        "pagedown" => Code::PageDown,
        "up" => Code::ArrowUp,
        "down" => Code::ArrowDown,
        "left" => Code::ArrowLeft,
        "right" => Code::ArrowRight,
        _ => return None,
    })
}

fn to_shortcut(c: &Combo) -> Result<Shortcut, String> {
    let mut mods = Modifiers::empty();
    if c.ctrl {
        mods |= Modifiers::CONTROL;
    }
    if c.alt {
        mods |= Modifiers::ALT;
    }
    if c.shift {
        mods |= Modifiers::SHIFT;
    }
    if c.win {
        mods |= Modifiers::SUPER;
    }
    let code = to_code(&c.key).ok_or_else(|| format!("tecla não suportada: '{}'", c.key))?;
    Ok(Shortcut::new(Some(mods), code))
}

fn on_pressed(app: &AppHandle, target: HotkeyTarget) {
    tracing::info!("atalho disparado: {target:?}");
    match target {
        HotkeyTarget::Action(action) => actions::request(app, action, Source::Hotkey),
        HotkeyTarget::CancelNext => match schedule::cancel_next(app) {
            Ok(Some(msg)) => notify(app, "Wise Auto Shutdown", msg),
            Ok(None) => notify(app, "Wise Auto Shutdown", "Nenhuma tarefa pendente."),
            Err(e) => actions::notify_error(app, e),
        },
    }
}

/// (Re)registra todos os atalhos a partir das configurações e publica o status.
pub fn apply(app: &AppHandle) {
    let registry = app.state::<HotkeyRegistry>();
    if registry.suspended.load(Ordering::Relaxed) {
        return;
    }
    if let Err(e) = app.global_shortcut().unregister_all() {
        tracing::warn!("unregister_all falhou: {e}");
    }

    let settings = app.state::<AppState>().settings();
    let mut seen: HashSet<Combo> = HashSet::new();
    let mut statuses = Vec::new();

    // Ordem fixa: em caso de duplicata, o primeiro da lista vence (determinístico).
    for target in HotkeyTarget::all() {
        let Some(keys) = settings.hotkeys.get(target.key()).filter(|k| !k.trim().is_empty()) else {
            continue;
        };
        let mut status =
            HotkeyStatus { target: target.key().into(), keys: keys.clone(), registered: false, error: None };

        let result = (|| -> Result<(), String> {
            if !settings.hotkeys_enabled {
                return Err("Atalhos desativados nas configurações.".into());
            }
            let combo = hotkey_rules::parse_combo(keys)?;
            hotkey_rules::validate(&combo)?;
            status.keys = hotkey_rules::display(&combo);
            if !seen.insert(combo.clone()) {
                return Err("Combinação repetida em outra ação.".into());
            }
            let shortcut = to_shortcut(&combo)?;
            app.global_shortcut()
                .on_shortcut(shortcut, move |app, _sc, event| {
                    if event.state == ShortcutState::Pressed {
                        on_pressed(app, target);
                    }
                })
                .map_err(|e| {
                    tracing::warn!("falha ao registrar '{keys}': {e}");
                    "O Windows recusou: a combinação já está em uso por outro programa.".to_string()
                })
        })();

        match result {
            Ok(()) => status.registered = true,
            Err(e) => status.error = Some(e),
        }
        statuses.push(status);
    }

    *registry.status.lock() = statuses.clone();
    let _ = app.emit("hotkeys-status", &statuses);
}

pub fn status(app: &AppHandle) -> Vec<HotkeyStatus> {
    app.state::<HotkeyRegistry>().status.lock().clone()
}

pub fn suspend(app: &AppHandle) {
    app.state::<HotkeyRegistry>().suspended.store(true, Ordering::Relaxed);
    if let Err(e) = app.global_shortcut().unregister_all() {
        tracing::warn!("unregister_all falhou: {e}");
    }
}

pub fn resume(app: &AppHandle) {
    app.state::<HotkeyRegistry>().suspended.store(false, Ordering::Relaxed);
    apply(app);
}
