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

/// Identificador usado até a v0.2, quando o app se chamava "Wise Auto Shutdown".
const LEGACY_IDENTIFIER: &str = "com.wise.autoshutdown";
const LEGACY_FILES: [&str; 3] = ["settings.json", "tasks.json", "history.json"];

/// Na primeira execução com o nome novo, copia configurações, tarefas e histórico da
/// pasta antiga. Retorna `true` se migrou algo.
pub fn migrate_legacy_data(app: &AppHandle) -> bool {
    let new_dir = data_dir(app);
    if new_dir.join("settings.json").exists() {
        return false;
    }
    let Some(old_dir) = new_dir.parent().map(|p| p.join(LEGACY_IDENTIFIER)) else {
        return false;
    };
    if !old_dir.is_dir() {
        return false;
    }
    if let Err(e) = std::fs::create_dir_all(&new_dir) {
        tracing::error!("migração: não foi possível criar {new_dir:?}: {e}");
        return false;
    }
    let mut migrated = false;
    for name in LEGACY_FILES {
        let from = old_dir.join(name);
        if !from.exists() {
            continue;
        }
        match std::fs::copy(&from, new_dir.join(name)) {
            Ok(_) => migrated = true,
            Err(e) => tracing::error!("migração: falha ao copiar {from:?}: {e}"),
        }
    }
    if migrated {
        tracing::info!("migração: dados copiados de {old_dir:?}");
    }
    migrated
}
