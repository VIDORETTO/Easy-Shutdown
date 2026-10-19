//! Ações de energia e consultas ao sistema via Win32 API direto (sem console, sem locale).

use std::sync::mpsc;
use std::time::Duration;

use windows::core::{w, PCWSTR};
use windows::Wdk::System::SystemServices::RtlGetVersion;
use windows::Win32::Foundation::{CloseHandle, GetLastError, HANDLE, LPARAM, LUID, WPARAM};
use windows::Win32::Security::{
    AdjustTokenPrivileges, LookupPrivilegeValueW, LUID_AND_ATTRIBUTES, SE_PRIVILEGE_ENABLED,
    TOKEN_ADJUST_PRIVILEGES, TOKEN_PRIVILEGES, TOKEN_QUERY,
};
use windows::Win32::System::Registry::{RegDeleteKeyValueW, HKEY_CURRENT_USER};
use windows::Win32::System::Power::{
    GetPwrCapabilities, SetSuspendState, SetThreadExecutionState, ES_CONTINUOUS,
    ES_SYSTEM_REQUIRED, SYSTEM_POWER_CAPABILITIES,
};
use windows::Win32::System::Shutdown::{
    ExitWindowsEx, LockWorkStation, EWX_FORCE, EWX_FORCEIFHUNG, EWX_LOGOFF, EWX_POWEROFF,
    EWX_REBOOT, EWX_SHUTDOWN, EXIT_WINDOWS_FLAGS, SHTDN_REASON_FLAG_PLANNED,
    SHTDN_REASON_MAJOR_OTHER, SHTDN_REASON_MINOR_OTHER, SHUTDOWN_REASON,
};
use windows::Win32::System::SystemInformation::{GetTickCount, OSVERSIONINFOW};
use windows::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};
use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
use windows::Win32::UI::WindowsAndMessaging::{
    PostMessageW, HWND_BROADCAST, SC_MONITORPOWER, WM_SYSCOMMAND,
};

use crate::types::ActionKind;

const ERROR_NOT_ALL_ASSIGNED: u32 = 1314;

fn enable_shutdown_privilege() -> Result<(), String> {
    let mut token: HANDLE = HANDLE::default();
    unsafe { OpenProcessToken(GetCurrentProcess(), TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY, &mut token) }
        .map_err(|e| format!("OpenProcessToken falhou: {e}"))?;

    let result = (|| -> Result<(), String> {
        let mut luid: LUID = LUID::default();
        unsafe { LookupPrivilegeValueW(PCWSTR::null(), w!("SeShutdownPrivilege"), &mut luid) }
            .map_err(|e| format!("LookupPrivilegeValueW falhou: {e}"))?;

        let tp = TOKEN_PRIVILEGES {
            PrivilegeCount: 1,
            Privileges: [LUID_AND_ATTRIBUTES { Luid: luid, Attributes: SE_PRIVILEGE_ENABLED }],
        };
        unsafe { AdjustTokenPrivileges(token, false, Some(&tp as *const _), 0, None, None) }
            .map_err(|e| format!("AdjustTokenPrivileges falhou: {e}"))?;
        // AdjustTokenPrivileges retorna Ok mesmo se nem todos os privilégios foram atribuídos.
        if unsafe { GetLastError() }.0 == ERROR_NOT_ALL_ASSIGNED {
            return Err("Privilégio SeShutdownPrivilege não concedido ao processo.".into());
        }
        Ok(())
    })();

    let _ = unsafe { CloseHandle(token) };
    result
}

fn exit_windows(flags: EXIT_WINDOWS_FLAGS, force: bool) -> Result<(), String> {
    // Sem "forçar", programas travados são encerrados (FORCEIFHUNG), mas um programa
    // pedindo para salvar ainda pode cancelar a ação — o Windows mostra a tela de bloqueio.
    let flags = flags | if force { EWX_FORCE } else { EWX_FORCEIFHUNG };
    let reason = SHUTDOWN_REASON(
        SHTDN_REASON_MAJOR_OTHER.0 | SHTDN_REASON_MINOR_OTHER.0 | SHTDN_REASON_FLAG_PLANNED.0,
    );
    unsafe { ExitWindowsEx(flags, reason) }.map_err(|e| format!("ExitWindowsEx falhou: {e}"))
}

pub fn execute(action: ActionKind, force: bool) -> Result<(), String> {
    match action {
        ActionKind::Shutdown => {
            enable_shutdown_privilege()?;
            exit_windows(EWX_SHUTDOWN | EWX_POWEROFF, force)
        }
        ActionKind::Restart => {
            enable_shutdown_privilege()?;
            exit_windows(EWX_REBOOT, force)
        }
        ActionKind::Logoff => exit_windows(EWX_LOGOFF, force),
        ActionKind::Hibernate => {
            if !hibernate_available() {
                return Err(
                    "Hibernação está desativada neste PC. Ative com 'powercfg /hibernate on' \
                     num terminal de administrador."
                        .into(),
                );
            }
            if !unsafe { SetSuspendState(true, false, false) } {
                return Err("Hibernação falhou. Outro processo pode estar bloqueando.".into());
            }
            Ok(())
        }
        ActionKind::Sleep => {
            if !unsafe { SetSuspendState(false, false, false) } {
                return Err("Suspensão falhou. Outro processo pode estar bloqueando.".into());
            }
            Ok(())
        }
        ActionKind::Lock => {
            unsafe { LockWorkStation() }.map_err(|e| format!("LockWorkStation falhou: {e}"))
        }
        ActionKind::MonitorOff => {
            // Pequeno atraso: soltar a tecla/clique logo após religaria a tela.
            std::thread::spawn(|| {
                std::thread::sleep(Duration::from_millis(700));
                let r = unsafe {
                    PostMessageW(
                        Some(HWND_BROADCAST),
                        WM_SYSCOMMAND,
                        WPARAM(SC_MONITORPOWER as usize),
                        LPARAM(2),
                    )
                };
                if let Err(e) = r {
                    tracing::error!("desligar tela falhou: {e}");
                }
            });
            Ok(())
        }
    }
}

/// Hibernação só está disponível com hardware compatível (S4) E arquivo de hibernação
/// presente (desativado por `powercfg /hibernate off`).
pub fn hibernate_available() -> bool {
    let mut caps = SYSTEM_POWER_CAPABILITIES::default();
    if !unsafe { GetPwrCapabilities(&mut caps) } {
        tracing::error!("GetPwrCapabilities falhou");
        return false;
    }
    caps.SystemS4 && caps.HiberFilePresent
}

/// Milissegundos desde a última entrada de teclado/mouse.
pub fn idle_ms() -> u64 {
    let mut info = LASTINPUTINFO { cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
    if !unsafe { GetLastInputInfo(&mut info) }.as_bool() {
        return 0;
    }
    let now = unsafe { GetTickCount() };
    now.wrapping_sub(info.dwTime) as u64
}

/// Número de build do Windows (22000+ = Windows 11).
pub fn windows_build() -> u32 {
    let mut info = OSVERSIONINFOW {
        dwOSVersionInfoSize: std::mem::size_of::<OSVERSIONINFOW>() as u32,
        ..Default::default()
    };
    if unsafe { RtlGetVersion(&mut info) }.is_ok() {
        info.dwBuildNumber
    } else {
        0
    }
}

/// Remove a entrada de início automático do nome antigo ("Wise Auto Shutdown"),
/// para o Windows não tentar abrir o executável da versão anterior.
pub fn remove_legacy_autostart() {
    let r = unsafe {
        RegDeleteKeyValueW(
            HKEY_CURRENT_USER,
            w!("Software\\Microsoft\\Windows\\CurrentVersion\\Run"),
            w!("Wise Auto Shutdown"),
        )
    };
    if r.is_ok() {
        tracing::info!("migração: início automático do nome antigo removido");
    }
}

/// Impede a suspensão automática enquanto existir. O estado de execução do Windows é
/// por thread, então usamos uma thread dedicada que vive até o `drop`.
pub struct KeepAwake {
    stop: Option<mpsc::Sender<()>>,
}

impl KeepAwake {
    pub fn start() -> Self {
        let (tx, rx) = mpsc::channel::<()>();
        std::thread::spawn(move || {
            unsafe { SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED) };
            let _ = rx.recv();
            unsafe { SetThreadExecutionState(ES_CONTINUOUS) };
        });
        Self { stop: Some(tx) }
    }
}

impl Drop for KeepAwake {
    fn drop(&mut self) {
        if let Some(tx) = self.stop.take() {
            let _ = tx.send(());
        }
    }
}
