//! Ações de energia via Win32 API direto (sem console, sem locale issues).

use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::{CloseHandle, GetLastError, HANDLE, LUID};
use windows::Win32::Security::{
    AdjustTokenPrivileges, LookupPrivilegeValueW, LUID_AND_ATTRIBUTES, SE_PRIVILEGE_ENABLED,
    TOKEN_ADJUST_PRIVILEGES, TOKEN_PRIVILEGES, TOKEN_QUERY,
};
use windows::Win32::System::Power::{GetPwrCapabilities, SetSuspendState, SYSTEM_POWER_CAPABILITIES};
use windows::Win32::System::Shutdown::{
    ExitWindowsEx, InitiateSystemShutdownExW, LockWorkStation, EWX_LOGOFF, SHUTDOWN_REASON,
};
use windows::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

use crate::types::ActionKind;

const ERROR_NOT_ALL_ASSIGNED: u32 = 1314;
const REASON_PLANNED: u32 = 0x80000000;

fn enable_shutdown_privilege() -> Result<(), String> {
    let mut token: HANDLE = HANDLE::default();
    let result = unsafe {
        OpenProcessToken(
            GetCurrentProcess(),
            TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY,
            &mut token,
        )
    };
    if let Err(e) = result {
        return Err(format!("OpenProcessToken falhou: {e}"));
    }

    let result = (|| -> Result<(), String> {
        let mut luid: LUID = LUID::default();
        unsafe {
            LookupPrivilegeValueW(PCWSTR::null(), w!("SeShutdownPrivilege"), &mut luid)
                .map_err(|e| format!("LookupPrivilegeValueW falhou: {e}"))?;
        }

        let tp = TOKEN_PRIVILEGES {
            PrivilegeCount: 1,
            Privileges: [LUID_AND_ATTRIBUTES {
                Luid: luid,
                Attributes: SE_PRIVILEGE_ENABLED,
            }],
        };

        unsafe {
            AdjustTokenPrivileges(token, false, Some(&tp as *const _), 0, None, None)
                .map_err(|e| format!("AdjustTokenPrivileges falhou: {e}"))?;
        }
        // AdjustTokenPrivileges retorna Ok mesmo se nem todos os privilégios foram atribuídos.
        // Precisa checar GetLastError.
        let last_err = unsafe { GetLastError() };
        if last_err.0 == ERROR_NOT_ALL_ASSIGNED {
            return Err("Privilégio SeShutdownPrivilege não concedido ao processo.".into());
        }
        Ok(())
    })();

    let _ = unsafe { CloseHandle(token) };
    result
}

pub fn execute(action: ActionKind, force: bool) -> Result<(), String> {
    match action {
        ActionKind::Shutdown | ActionKind::Restart => {
            enable_shutdown_privilege()?;
            let reboot = matches!(action, ActionKind::Restart);
            unsafe {
                InitiateSystemShutdownExW(
                    PCWSTR::null(),
                    PCWSTR::null(),
                    0,
                    force,
                    reboot,
                    SHUTDOWN_REASON(REASON_PLANNED),
                )
            }
            .map_err(|e| format!("InitiateSystemShutdownExW falhou: {e}"))?;
            Ok(())
        }
        ActionKind::Hibernate => {
            let ok = unsafe { SetSuspendState(true, force, false) };
            if !ok {
                return Err(
                    "Hibernação falhou. Verifique se está ativada (powercfg /hibernate on) \
                     ou se outro processo não está bloqueando a suspensão."
                        .into(),
                );
            }
            Ok(())
        }
        ActionKind::Sleep => {
            let ok = unsafe { SetSuspendState(false, force, false) };
            if !ok {
                return Err("Suspensão falhou. Outro processo pode estar bloqueando.".into());
            }
            Ok(())
        }
        ActionKind::Lock => {
            unsafe { LockWorkStation() }
                .map_err(|e| format!("LockWorkStation falhou: {e}"))?;
            Ok(())
        }
        ActionKind::Logoff => {
            unsafe { ExitWindowsEx(EWX_LOGOFF, SHUTDOWN_REASON(REASON_PLANNED)) }
                .map_err(|e| format!("ExitWindowsEx(logoff) falhou: {e}"))?;
            Ok(())
        }
    }
}

/// Verifica disponibilidade de hibernação via GetPwrCapabilities (Win32 API).
/// Não depende de locale nem de parsing de strings — sempre correto.
pub fn check_hibernate_available() -> String {
    let mut caps = SYSTEM_POWER_CAPABILITIES::default();
    let ok = unsafe { GetPwrCapabilities(&mut caps) };
    if !ok {
        tracing::error!("GetPwrCapabilities falhou");
        return "erro ao verificar".to_string();
    }
    if caps.HiberFilePresent || caps.SystemS4 {
        "disponível".to_string()
    } else {
        "indisponível".to_string()
    }
}
