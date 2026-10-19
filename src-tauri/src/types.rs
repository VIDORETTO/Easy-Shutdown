use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Tipos de ação de energia disponíveis no app.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Hash)]
#[serde(rename_all = "snake_case")]
pub enum ActionKind {
    Shutdown,
    Restart,
    Hibernate,
    Sleep,
    Lock,
    Logoff,
    MonitorOff,
}

impl ActionKind {
    pub const ALL: [ActionKind; 7] = [
        ActionKind::Shutdown,
        ActionKind::Restart,
        ActionKind::Sleep,
        ActionKind::Hibernate,
        ActionKind::Lock,
        ActionKind::Logoff,
        ActionKind::MonitorOff,
    ];

    pub fn label_pt(self) -> &'static str {
        match self {
            ActionKind::Shutdown => "Desligar",
            ActionKind::Restart => "Reiniciar",
            ActionKind::Hibernate => "Hibernar",
            ActionKind::Sleep => "Suspender",
            ActionKind::Lock => "Bloquear",
            ActionKind::Logoff => "Encerrar sessão",
            ActionKind::MonitorOff => "Desligar tela",
        }
    }

    /// Chave usada no frontend e no settings.json ("shutdown", "monitor_off"...).
    pub fn key(self) -> &'static str {
        match self {
            ActionKind::Shutdown => "shutdown",
            ActionKind::Restart => "restart",
            ActionKind::Hibernate => "hibernate",
            ActionKind::Sleep => "sleep",
            ActionKind::Lock => "lock",
            ActionKind::Logoff => "logoff",
            ActionKind::MonitorOff => "monitor_off",
        }
    }

    pub fn from_key(s: &str) -> Option<ActionKind> {
        Self::ALL.into_iter().find(|a| a.key() == s)
    }

    /// Ações em que "forçar" muda algo (fecha programas sem perguntar).
    pub fn supports_force(self) -> bool {
        matches!(
            self,
            ActionKind::Shutdown | ActionKind::Restart | ActionKind::Logoff
        )
    }
}

/// O que um atalho global dispara.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HotkeyTarget {
    Action(ActionKind),
    CancelNext,
}

impl HotkeyTarget {
    pub fn all() -> Vec<HotkeyTarget> {
        let mut v: Vec<HotkeyTarget> = ActionKind::ALL.into_iter().map(HotkeyTarget::Action).collect();
        v.push(HotkeyTarget::CancelNext);
        v
    }

    pub fn key(self) -> &'static str {
        match self {
            HotkeyTarget::Action(a) => a.key(),
            HotkeyTarget::CancelNext => "cancel_next",
        }
    }
}

/// Gatilho de uma tarefa agendada (forma persistida).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Trigger {
    /// Uma única vez, no timestamp (ms desde epoch).
    Once { target_ts_ms: i64 },
    /// Toda semana nos dias indicados (0 = domingo … 6 = sábado), às HH:MM.
    Weekly { hh_mm: String, days: Vec<u8> },
    /// Quando o PC ficar N minutos sem teclado/mouse.
    Idle { minutes: u32 },
}

/// Gatilho como o frontend pede (convertido em `Trigger` no backend).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TriggerRequest {
    /// Daqui a N segundos.
    Timer { seconds: u64 },
    /// Em uma data (YYYY-MM-DD) e horário (HH:MM) locais.
    At { date: String, hh_mm: String },
    Weekly { hh_mm: String, days: Vec<u8> },
    Idle { minutes: u32 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskRequest {
    pub action: ActionKind,
    #[serde(default)]
    pub force: bool,
    /// Minutos antes para lembrete (0 = sem lembrete).
    #[serde(default)]
    pub reminder_minutes: u32,
    pub trigger: TriggerRequest,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub action: ActionKind,
    pub force: bool,
    pub reminder_minutes: u32,
    pub trigger: Trigger,
    pub enabled: bool,
    pub created_ts_ms: i64,
    /// Referência para calcular a próxima ocorrência recorrente
    /// (criação, última execução, "pular" ou ocorrência perdida).
    pub anchor_ts_ms: i64,
    /// Próxima ocorrência definida manualmente (adiar) ou pelo período de graça.
    #[serde(default)]
    pub override_next_ms: Option<i64>,
}

/// Tarefa + próxima ocorrência calculada, para a UI.
#[derive(Debug, Clone, Serialize)]
pub struct TaskView {
    #[serde(flatten)]
    pub task: Task,
    pub next_ts_ms: Option<i64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum NextKind {
    Time,
    Idle,
}

/// Próxima tarefa a disparar (a mais próxima entre todas as ativas).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct NextInfo {
    pub task_id: String,
    pub action: ActionKind,
    pub target_ts_ms: i64,
    pub remaining_seconds: u64,
    pub kind: NextKind,
    pub recurring: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Source {
    App,
    Tray,
    Hotkey,
    Task,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HistoryStatus {
    Ok,
    Error,
    Missed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub ts_ms: i64,
    pub action: ActionKind,
    pub source: Source,
    pub status: HistoryStatus,
    #[serde(default)]
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct HotkeyStatus {
    pub target: String,
    pub keys: String,
    pub registered: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ActionRequest {
    pub action: ActionKind,
    pub source: Source,
}

#[derive(Debug, Clone, Serialize)]
pub struct UiInfo {
    pub mica: bool,
    pub version: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    /// Versão do formato; ausente (0) em arquivos antigos → dispara migração.
    #[serde(default)]
    pub settings_version: u32,
    pub autostart: bool,
    pub minimize_to_tray: bool,
    pub theme: ThemeMode,
    pub hotkeys: HashMap<String, String>,
    pub hotkeys_enabled: bool,
    pub default_reminder_minutes: u32,
    pub confirm_before_action: bool,
    /// Segundos de aviso em tela cheia antes de executar (0 = desativado).
    pub final_warning_seconds: u32,
    /// Impede a suspensão automática enquanto houver tarefa única pendente.
    pub keep_awake_during_tasks: bool,
    /// Já avisamos que o app continua na bandeja ao fechar?
    pub tray_hint_shown: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ThemeMode {
    System,
    Light,
    Dark,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            settings_version: crate::settings::CURRENT_VERSION,
            autostart: false,
            minimize_to_tray: true,
            theme: ThemeMode::System,
            // Sem atalhos por padrão: um toque acidental não pode desligar o PC.
            hotkeys: HashMap::new(),
            hotkeys_enabled: true,
            default_reminder_minutes: 5,
            confirm_before_action: true,
            final_warning_seconds: 60,
            keep_awake_during_tasks: true,
            tray_hint_shown: false,
        }
    }
}
