//! Registro de atalhos globais (hotkeys) via tauri-plugin-global-shortcut.

use std::collections::HashMap;
use std::sync::Arc;
use parking_lot::Mutex;
use tauri::AppHandle;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_notification::NotificationExt;

use crate::power;
use crate::types::ActionKind;

/// Mapa compartilhado: keys string -> ActionKind
pub type HotkeyMap = Arc<Mutex<HashMap<String, ActionKind>>>;

pub fn new_map() -> HotkeyMap {
    Arc::new(Mutex::new(HashMap::new()))
}

/// Converte string "Ctrl+Alt+D" em `Shortcut { mods, key }`.
pub fn parse(keys: &str) -> Result<Shortcut, String> {
    let mut mods = Modifiers::empty();
    let mut code: Option<Code> = None;

    for part in keys.split('+') {
        let p = part.trim().to_lowercase();
        match p.as_str() {
            "ctrl" | "control" => mods |= Modifiers::CONTROL,
            "alt" | "option" => mods |= Modifiers::ALT,
            "shift" => mods |= Modifiers::SHIFT,
            "win" | "super" | "meta" | "cmd" => mods |= Modifiers::SUPER,
            _ => {
                code = Some(parse_code(&p)?);
            }
        }
    }

    let code = code.ok_or_else(|| format!("nenhuma tecla encontrada em '{keys}'"))?;
    Ok(Shortcut::new(Some(mods), code))
}

fn parse_code(s: &str) -> Result<Code, String> {
    // Letras A-Z
    if s.len() == 1 {
        let c = s.chars().next().unwrap();
        if c.is_ascii_alphabetic() {
            return Ok(match c.to_ascii_uppercase() {
                'A' => Code::KeyA,
                'B' => Code::KeyB,
                'C' => Code::KeyC,
                'D' => Code::KeyD,
                'E' => Code::KeyE,
                'F' => Code::KeyF,
                'G' => Code::KeyG,
                'H' => Code::KeyH,
                'I' => Code::KeyI,
                'J' => Code::KeyJ,
                'K' => Code::KeyK,
                'L' => Code::KeyL,
                'M' => Code::KeyM,
                'N' => Code::KeyN,
                'O' => Code::KeyO,
                'P' => Code::KeyP,
                'Q' => Code::KeyQ,
                'R' => Code::KeyR,
                'S' => Code::KeyS,
                'T' => Code::KeyT,
                'U' => Code::KeyU,
                'V' => Code::KeyV,
                'W' => Code::KeyW,
                'X' => Code::KeyX,
                'Y' => Code::KeyY,
                'Z' => Code::KeyZ,
                _ => return Err(format!("tecla não suportada: '{s}'")),
            });
        }
    }
    // Números 0-9
    if s.len() == 1 && s.chars().next().unwrap().is_ascii_digit() {
        return Ok(match s {
            "0" => Code::Digit0,
            "1" => Code::Digit1,
            "2" => Code::Digit2,
            "3" => Code::Digit3,
            "4" => Code::Digit4,
            "5" => Code::Digit5,
            "6" => Code::Digit6,
            "7" => Code::Digit7,
            "8" => Code::Digit8,
            "9" => Code::Digit9,
            _ => unreachable!(),
        });
    }
    // Teclas especiais comuns
    Ok(match s {
        "f1" => Code::F1,
        "f2" => Code::F2,
        "f3" => Code::F3,
        "f4" => Code::F4,
        "f5" => Code::F5,
        "f6" => Code::F6,
        "f7" => Code::F7,
        "f8" => Code::F8,
        "f9" => Code::F9,
        "f10" => Code::F10,
        "f11" => Code::F11,
        "f12" => Code::F12,
        "space" | "espaco" => Code::Space,
        "enter" | "return" => Code::Enter,
        "esc" | "escape" => Code::Escape,
        "tab" => Code::Tab,
        "home" => Code::Home,
        "end" => Code::End,
        "delete" | "del" => Code::Delete,
        "insert" => Code::Insert,
        "pageup" => Code::PageUp,
        "pagedown" => Code::PageDown,
        "arrowup" | "up" => Code::ArrowUp,
        "arrowdown" | "down" => Code::ArrowDown,
        "arrowleft" | "left" => Code::ArrowLeft,
        "arrowright" | "right" => Code::ArrowRight,
        _ => return Err(format!("tecla não suportada: '{s}'")),
    })
}

/// Registra todos os hotkeys a partir do mapa compartilhado.
/// Limpa registros anteriores primeiro.
pub fn register_all(app: &AppHandle, map: HotkeyMap) -> Result<(), String> {
    // Limpa registros anteriores
    if let Err(e) = app.global_shortcut().unregister_all() {
        tracing::warn!("unregister_all falhou: {e}");
    }

    let snapshot = map.lock().clone();
    for (keys, action) in snapshot {
        let shortcut = match parse(&keys) {
            Ok(s) => s,
            Err(e) => {
                tracing::warn!("atalho inválido '{keys}': {e}");
                continue;
            }
        };
        let action_for_handler = action;
        let result = app.global_shortcut().on_shortcut(shortcut, move |app, _sc, event| {
            if event.state == ShortcutState::Pressed {
                tracing::info!("hotkey disparado: {:?}", action_for_handler);
                if let Err(e) = power::execute(action_for_handler, false) {
                    tracing::error!("erro ao executar ação via hotkey: {e}");
                    let _ = app.notification()
                        .builder()
                        .title("Wise Auto Shutdown — erro")
                        .body(e)
                        .show();
                }
            }
        });
        if let Err(e) = result {
            tracing::warn!("falha ao registrar atalho '{keys}': {e}");
        }
    }
    Ok(())
}
