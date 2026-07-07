//! Estado global compartilhado entre os módulos.

use parking_lot::Mutex;
use tauri::async_runtime::JoinHandle;
use tokio_util::sync::CancellationToken;

use crate::types::ActiveSchedule;

pub struct AppState {
    /// Scheduler ativo (no máximo 1 simultâneo no MVP).
    pub schedule: Mutex<Option<ScheduleHandle>>,
    /// Se o tray icon foi criado com sucesso.
    pub tray_built: std::sync::atomic::AtomicBool,
    /// Cache de minimize_to_tray para evitar I/O no close handler.
    pub minimize_to_tray: parking_lot::RwLock<bool>,
    /// Cache de confirm_before_action.
    pub confirm_before_action: parking_lot::RwLock<bool>,
}

pub struct ScheduleHandle {
    pub info: ActiveSchedule,
    pub cancel: CancellationToken,
    pub task: JoinHandle<()>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            schedule: Mutex::new(None),
            tray_built: std::sync::atomic::AtomicBool::new(false),
            minimize_to_tray: parking_lot::RwLock::new(true),
            confirm_before_action: parking_lot::RwLock::new(true),
        }
    }

    pub fn set_tray_built(&self, v: bool) {
        self.tray_built.store(v, std::sync::atomic::Ordering::Relaxed);
    }

    pub fn is_tray_built(&self) -> bool {
        self.tray_built.load(std::sync::atomic::Ordering::Relaxed)
    }

    pub fn set_minimize_to_tray(&self, v: bool) {
        *self.minimize_to_tray.write() = v;
    }

    pub fn get_minimize_to_tray(&self) -> bool {
        *self.minimize_to_tray.read()
    }

    pub fn set_confirm_before_action(&self, v: bool) {
        *self.confirm_before_action.write() = v;
    }

    pub fn get_confirm_before_action(&self) -> bool {
        *self.confirm_before_action.read()
    }
}
