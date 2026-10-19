//! Leitura/escrita de arquivos JSON no diretório de dados do app.

use serde::{de::DeserializeOwned, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

pub fn data_dir(app: &AppHandle) -> PathBuf {
    app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."))
}

pub fn data_file(app: &AppHandle, name: &str) -> PathBuf {
    data_dir(app).join(name)
}

/// `Ok(None)` se o arquivo não existe. Se estiver corrompido, faz backup em `.bak`
/// e devolve `Ok(None)` para o chamador seguir com valores padrão.
pub fn load_json<T: DeserializeOwned>(path: &Path) -> Option<T> {
    match std::fs::read_to_string(path) {
        Ok(s) => match serde_json::from_str::<T>(&s) {
            Ok(v) => Some(v),
            Err(e) => {
                tracing::error!("{path:?} corrompido: {e}");
                let bak = path.with_extension("json.bak");
                let _ = std::fs::rename(path, &bak);
                tracing::info!("backup salvo em {bak:?}");
                None
            }
        },
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
        Err(e) => {
            tracing::error!("erro ao ler {path:?}: {e}");
            None
        }
    }
}

/// Escrita atômica: grava em `.tmp` e renomeia por cima do arquivo final.
pub fn save_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    if let Err(e) = std::fs::write(&tmp, &json) {
        let _ = std::fs::remove_file(&tmp);
        return Err(e.to_string());
    }
    if let Err(e) = std::fs::rename(&tmp, path) {
        let _ = std::fs::remove_file(&tmp);
        return Err(e.to_string());
    }
    Ok(())
}
