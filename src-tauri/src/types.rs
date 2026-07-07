use serde::{Deserialize, Serialize};

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
}

impl ActionKind {
    pub fn label_pt(self) -> &'static str {
        match self {
            ActionKind::Shutdown => "Desligar",
            ActionKind::Restart => "Reiniciar",
            ActionKind::Hibernate => "Hibernar",
            ActionKind::Sleep => "Suspender",
            ActionKind::Lock => "Bloquear",
            ActionKind::Logoff => "Encerrar sessão",
        }
    }

    pub fn icon_name(self) -> &'static str {
        match self {
            ActionKind::Shutdown => "power",
            ActionKind::Restart => "rotate-cw",
            ActionKind::Hibernate => "moon",
            ActionKind::Sleep => "zap-off",
            ActionKind::Lock => "lock",
            ActionKind::Logoff => "log-out",
        }
    }

    pub fn all() -> [ActionKind; 6] {
        [
            ActionKind::Shutdown,
            ActionKind::Restart,
            ActionKind::Hibernate,
            ActionKind::Sleep,
            ActionKind::Lock,
            ActionKind::Logoff,
        ]
    }

    /// Ações que aceitam flag "forçar" (mata processos teimosos)
    pub fn supports_force(self) -> bool {
        matches!(self, ActionKind::Shutdown | ActionKind::Restart)
    }

    /// Converte string kebab-case ("shutdown") em ActionKind.
    pub fn from_kebab(s: &str) -> Option<ActionKind> {
        match s {
            "shutdown" => Some(ActionKind::Shutdown),
            "restart" => Some(ActionKind::Restart),
            "hibernate" => Some(ActionKind::Hibernate),
            "sleep" => Some(ActionKind::Sleep),
            "lock" => Some(ActionKind::Lock),
            "logoff" => Some(ActionKind::Logoff),
            _ => None,
        }
    }

    pub fn to_kebab(self) -> &'static str {
        match self {
            ActionKind::Shutdown => "shutdown",
            ActionKind::Restart => "restart",
            ActionKind::Hibernate => "hibernate",
            ActionKind::Sleep => "sleep",
            ActionKind::Lock => "lock",
            ActionKind::Logoff => "logoff",
        }
    }
}

/// Modo de agendamento.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScheduleMode {
    /// Contagem regressiva em segundos a partir de agora.
    Timer { seconds: u64 },
    /// Horário fixo do dia (HH:MM).
    AtTime { hh_mm: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleRequest {
    pub action: ActionKind,
    pub mode: ScheduleMode,
    #[serde(default)]
    pub force: bool,
    /// Minutos antes para disparar lembrete (0 = sem lembrete)
    #[serde(default)]
    pub reminder_minutes: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActiveSchedule {
    pub id: String,
    pub action: ActionKind,
    pub force: bool,
    /// Timestamp (ms desde epoch) em que a ação será executada
    pub target_ts_ms: u64,
    pub reminder_minutes: u32,
    /// Já disparou o lembrete?
    #[serde(default)]
    pub reminder_fired: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub autostart: bool,
    pub minimize_to_tray: bool,
    pub theme: ThemeMode,
    pub hotkeys: std::collections::HashMap<String, String>,
    pub default_reminder_minutes: u32,
    pub confirm_before_action: bool,
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
        let mut hotkeys = std::collections::HashMap::new();
        hotkeys.insert("shutdown".into(), "Ctrl+Alt+D".into());
        hotkeys.insert("restart".into(), "Ctrl+Alt+R".into());
        hotkeys.insert("lock".into(), "Ctrl+Alt+L".into());
        hotkeys.insert("sleep".into(), "Ctrl+Alt+S".into());
        hotkeys.insert("hibernate".into(), "Ctrl+Alt+H".into());
        hotkeys.insert("logoff".into(), "Ctrl+Alt+Q".into());

        Self {
            autostart: false,
            minimize_to_tray: true,
            theme: ThemeMode::System,
            hotkeys,
            default_reminder_minutes: 1,
            confirm_before_action: true,
        }
    }
}
