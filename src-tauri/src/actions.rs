//! Execução centralizada das ações (com histórico) e fluxo de confirmação.

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::persist;
use crate::power;
use crate::state::AppState;
use crate::types::{ActionKind, ActionRequest, HistoryEntry, HistoryStatus, Source};
use crate::window;

const HISTORY_FILE: &str = "history.json";
const HISTORY_MAX: usize = 100;

pub fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

pub fn notify(app: &AppHandle, title: &str, body: impl Into<String>) {
    if let Err(e) = app.notification().builder().title(title).body(body.into()).show() {
        tracing::warn!("notificação falhou: {e}");
    }
}

pub fn notify_error(app: &AppHandle, body: impl Into<String>) {
    notify(app, "Easy Shutdown — erro", body);
}

// ---------------------------------------------------------------- histórico

pub fn load_history(app: &AppHandle) {
    let list: Vec<HistoryEntry> =
        persist::load_json(&persist::data_file(app, HISTORY_FILE)).unwrap_or_default();
    *app.state::<AppState>().history.lock() = list;
}

pub fn history(app: &AppHandle) -> Vec<HistoryEntry> {
    app.state::<AppState>().history.lock().clone()
}

pub fn record(app: &AppHandle, action: ActionKind, source: Source, status: HistoryStatus, detail: Option<String>) {
    let entry = HistoryEntry { ts_ms: now_ms(), action, source, status, detail };
    let snapshot = {
        let state = app.state::<AppState>();
        let mut list = state.history.lock();
        list.insert(0, entry.clone());
        list.truncate(HISTORY_MAX);
        list.clone()
    };
    if let Err(e) = persist::save_json(&persist::data_file(app, HISTORY_FILE), &snapshot) {
        tracing::error!("falha ao salvar histórico: {e}");
    }
    let _ = app.emit("history-changed", &snapshot);
    if status != HistoryStatus::Missed {
        let _ = app.emit("action-executed", &entry);
    }
}

pub fn clear_history(app: &AppHandle) -> Result<(), String> {
    app.state::<AppState>().history.lock().clear();
    persist::save_json(&persist::data_file(app, HISTORY_FILE), &Vec::<HistoryEntry>::new())?;
    let _ = app.emit("history-changed", Vec::<HistoryEntry>::new());
    Ok(())
}

// ---------------------------------------------------------------- execução

/// Executa a ação agora e registra no histórico.
pub fn execute(app: &AppHandle, action: ActionKind, force: bool, source: Source) -> Result<(), String> {
    let force = force && action.supports_force();
    tracing::info!("executando {action:?} (force={force}, origem={source:?})");
    let result = power::execute(action, force);
    match &result {
        Ok(()) => record(app, action, source, HistoryStatus::Ok, None),
        Err(e) => {
            tracing::error!("falha ao executar {action:?}: {e}");
            record(app, action, source, HistoryStatus::Error, Some(e.clone()));
        }
    }
    result
}

/// Pedido vindo da bandeja ou de atalho: respeita "Sempre pedir confirmação".
pub fn request(app: &AppHandle, action: ActionKind, source: Source) {
    let confirm = app.state::<AppState>().settings.read().confirm_before_action;
    if !confirm {
        if let Err(e) = execute(app, action, false, source) {
            notify_error(app, e);
        }
        return;
    }
    if window::main_window(app).is_none() {
        // Sem janela não há como confirmar — nunca executa às cegas.
        notify_error(app, "Não foi possível abrir a confirmação. Abra o app e tente de novo.");
        return;
    }
    window::show_main(app);
    if let Err(e) = app.emit("action-request", ActionRequest { action, source }) {
        tracing::error!("emit action-request falhou: {e}");
    }
}
