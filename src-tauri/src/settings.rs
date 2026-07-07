//! Persistência de configurações em JSON no diretório de dados do app.

use std::path::PathBuf;
use tauri::{AppHandle, Manager};

use crate::types::Settings;

pub fn settings_path(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    dir.join("settings.json")
}

pub fn load(app: &AppHandle) -> Settings {
    let path = settings_path(app);
    match std::fs::read_to_string(&path) {
        Ok(s) => match serde_json::from_str::<Settings>(&s) {
            Ok(v) => v,
            Err(e) => {
                tracing::error!("settings.json corrompido: {e}");
                // Faz backup do arquivo corrompido antes de usar defaults
                let bak = path.with_extension("json.bak");
                let _ = std::fs::rename(&path, &bak);
                tracing::info!("backup salvo em {bak:?}");
                Settings::default()
            }
        },
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Settings::default(),
        Err(e) => {
            tracing::error!("erro ao ler settings: {e}");
            Settings::default()
        }
    }
}

pub fn save(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let path = settings_path(app);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;

    // Escrita atômica: escreve em .tmp e renomeia
    let tmp = path.with_extension("json.tmp");
    if let Err(e) = std::fs::write(&tmp, &json) {
        let _ = std::fs::remove_file(&tmp);
        return Err(e.to_string());
    }
    if let Err(e) = std::fs::rename(&tmp, &path) {
        let _ = std::fs::remove_file(&tmp);
        return Err(e.to_string());
    }

    // Atualiza caches em AppState
    let state: tauri::State<'_, crate::state::AppState> = app.state();
    state.set_minimize_to_tray(settings.minimize_to_tray);
    state.set_confirm_before_action(settings.confirm_before_action);

    Ok(())
}
