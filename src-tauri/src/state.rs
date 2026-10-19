//! Estado global compartilhado entre os módulos.

use parking_lot::{Mutex, RwLock};
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::Notify;

use crate::power::KeepAwake;
use crate::types::{HistoryEntry, NextInfo, Settings, Task};

pub struct AppState {
    /// Cache das configurações (fonte da verdade em memória; persistido em settings.json).
    pub settings: RwLock<Settings>,
    pub tasks: Mutex<Vec<Task>>,
    pub history: Mutex<Vec<HistoryEntry>>,
    /// Última "próxima tarefa" calculada pelo motor.
    pub next: Mutex<Option<NextInfo>>,
    /// Acorda o motor de agendamento imediatamente (após mudar tarefas/configurações).
    pub engine_wake: Notify,
    pub tray_built: AtomicBool,
    pub mica: AtomicBool,
    /// "Manter PC acordado" ligado manualmente pelo usuário.
    pub keep_awake_manual: AtomicBool,
    pub keep_awake: Mutex<Option<KeepAwake>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            settings: RwLock::new(Settings::default()),
            tasks: Mutex::new(Vec::new()),
            history: Mutex::new(Vec::new()),
            next: Mutex::new(None),
            engine_wake: Notify::new(),
            tray_built: AtomicBool::new(false),
            mica: AtomicBool::new(false),
            keep_awake_manual: AtomicBool::new(false),
            keep_awake: Mutex::new(None),
        }
    }

    pub fn settings(&self) -> Settings {
        self.settings.read().clone()
    }

    pub fn is_tray_built(&self) -> bool {
        self.tray_built.load(Ordering::Relaxed)
    }

    pub fn wake_engine(&self) {
        self.engine_wake.notify_one();
    }
}
