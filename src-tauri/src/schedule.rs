//! Engine de agendamento: dispara uma ação após contagem regressiva ou horário fixo.

use std::time::{Duration, SystemTime, UNIX_EPOCH};
use chrono::Timelike;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;
use tokio::time::sleep;

use crate::power;
use crate::state::{AppState, ScheduleHandle};
use crate::tray;
use crate::types::{ActionKind, ActiveSchedule, ScheduleMode, ScheduleRequest};

#[derive(serde::Serialize, Clone)]
pub struct TickPayload {
    pub remaining_seconds: u64,
    pub action: ActionKind,
    pub target_ts_ms: u64,
}

#[derive(serde::Serialize, Clone)]
pub struct FailedPayload {
    pub action: ActionKind,
    pub error: String,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn compute_target_ms(mode: &ScheduleMode) -> Result<u64, String> {
    let now = now_ms();
    match mode {
        ScheduleMode::Timer { seconds } => {
            if *seconds == 0 {
                return Err("timer não pode ser zero".into());
            }
            if *seconds > 86400 * 7 {
                return Err("timer não pode exceder 7 dias".into());
            }
            Ok(now + seconds.saturating_mul(1000))
        }
        ScheduleMode::AtTime { hh_mm } => {
            let (h, m) = parse_hhmm(hh_mm)?;
            let now_local = chrono::Local::now();
            let target = now_local
                .with_hour(h)
                .ok_or("hora inválida")?
                .with_minute(m)
                .ok_or("minuto inválido")?
                .with_second(0)
                .ok_or("segundo inválido")?
                .with_nanosecond(0)
                .ok_or("nano inválido")?;
            let target_ms = target.timestamp_millis() as u64;
            if target_ms <= now {
                // Próxima ocorrência: mesmo HH:MM amanhã, respeitando DST.
                // Constrói a data de amanhã e o horário, deixando chrono resolver o fuso.
                let next_date = target.date_naive().succ_opt().ok_or("data inválida")?;
                let next_naive = next_date
                    .and_hms_opt(h, m, 0)
                    .ok_or("hora inválida")?;
                match next_naive.and_local_timezone(chrono::Local) {
                    chrono::LocalResult::Single(dt) => Ok(dt.timestamp_millis() as u64),
                    chrono::LocalResult::Ambiguous(_, dt2) => Ok(dt2.timestamp_millis() as u64),
                    // Horário não existe (spring-forward): avança 1h
                    chrono::LocalResult::None => {
                        let alt = next_date.and_hms_opt((h + 1) % 24, m, 0).ok_or("hora inválida")?;
                        Ok(alt.and_local_timezone(chrono::Local)
                            .unwrap()
                            .timestamp_millis() as u64)
                    }
                }
            } else {
                Ok(target_ms)
            }
        }
    }
}

fn parse_hhmm(s: &str) -> Result<(u32, u32), String> {
    let parts: Vec<&str> = s.split(':').collect();
    if parts.len() != 2 {
        return Err(format!("formato inválido: '{s}', use HH:MM"));
    }
    let h: u32 = parts[0].trim().parse().map_err(|_| "hora não numérica")?;
    let m: u32 = parts[1].trim().parse().map_err(|_| "minuto não numérico")?;
    if h > 23 || m > 59 {
        return Err("hora/minuto fora do intervalo".into());
    }
    Ok((h, m))
}

/// Inicia um agendamento. Cancela qualquer schedule anterior.
pub fn start(app: &AppHandle, req: ScheduleRequest) -> Result<ActiveSchedule, String> {
    let target_ts_ms = compute_target_ms(&req.mode)?;
    let info = ActiveSchedule {
        id: format!("sched-{}-{}", now_ms(), rand::random::<u16>()),
        action: req.action,
        force: req.force,
        target_ts_ms,
        reminder_minutes: req.reminder_minutes,
        reminder_fired: false,
    };

    let cancel = tokio_util::sync::CancellationToken::new();
    let cancel_token = cancel.clone();
    let app_handle = app.clone();
    let info_for_task = info.clone();

    let task = tauri::async_runtime::spawn(async move {
        run_tick_loop(app_handle, info_for_task, cancel_token).await;
    });

    let handle = ScheduleHandle {
        info: info.clone(),
        cancel,
        task,
    };

    // Cancela schedule anterior
    let state: tauri::State<'_, AppState> = app.state();
    let mut guard = state.schedule.lock();
    if let Some(old) = guard.take() {
        old.cancel.cancel();
        old.task.abort();
    }
    *guard = Some(handle);

    Ok(info)
}

async fn run_tick_loop(app: AppHandle, info: ActiveSchedule, cancel: tokio_util::sync::CancellationToken) {
    let mut reminder_fired = false;

    loop {
        if cancel.is_cancelled() {
            break;
        }
        let now = now_ms();
        let remaining_ms = info.target_ts_ms.saturating_sub(now) as i64;
        let remaining_seconds = remaining_ms / 1000;

        // Atualiza tooltip do tray com countdown
        update_tray_tooltip(&app, &info, remaining_seconds);

        if let Err(e) = app.emit(
            "schedule-tick",
            TickPayload {
                remaining_seconds: remaining_seconds.max(0) as u64,
                action: info.action,
                target_ts_ms: info.target_ts_ms,
            },
        ) {
            tracing::warn!("emit schedule-tick falhou: {e}");
        }

        // Lembrete: dispara UMA VEZ
        if !reminder_fired
            && info.reminder_minutes > 0
            && remaining_ms <= (info.reminder_minutes as i64) * 60_000
            && remaining_ms > 0
        {
            reminder_fired = true;
            let _ = app
                .notification()
                .builder()
                .title("Wise Auto Shutdown")
                .body(format!(
                    "Ação '{}' será executada em {} min.",
                    info.action.label_pt(),
                    info.reminder_minutes
                ))
                .show();
        }

        if remaining_ms <= 1000 {
            // Grace period: se o target passou há mais de 5s (PC estava dormindo),
            // notifica e espera 10s antes de executar, dando chance de cancelar.
            if remaining_ms < -5000 {
                let _ = app
                    .notification()
                    .builder()
                    .title("Wise Auto Shutdown — ação iminente")
                    .body(format!(
                        "'{}' vai disparar em 10s (o horário alvo já passou). Cancele agora se necessário.",
                        info.action.label_pt()
                    ))
                    .show();
                // Espera 10s antes de executar (cancellation-aware)
                for _ in 0..10 {
                    if cancel.is_cancelled() {
                        break;
                    }
                    sleep(Duration::from_secs(1)).await;
                }
                if cancel.is_cancelled() {
                    break;
                }
            }

            // Executa a ação
            match power::execute(info.action, info.force) {
                Ok(()) => {
                    if let Err(e) = app.emit("schedule-completed", &info) {
                        tracing::warn!("emit schedule-completed falhou: {e}");
                    }
                }
                Err(e) => {
                    if let Err(emit_err) = app.emit(
                        "schedule-failed",
                        FailedPayload {
                            action: info.action,
                            error: e.clone(),
                        },
                    ) {
                        tracing::warn!("emit schedule-failed falhou: {emit_err}");
                    }
                    let _ = app
                        .notification()
                        .builder()
                        .title("Wise Auto Shutdown — erro")
                        .body(e)
                        .show();
                }
            }
            // Só limpa state se o ID ainda é deste task (evita sobrescrever schedule novo)
            let state: tauri::State<'_, AppState> = app.state();
            let mut guard = state.schedule.lock();
            let should_clear = guard
                .as_ref()
                .map(|h| h.info.id == info.id)
                .unwrap_or(false);
            if should_clear {
                *guard = None;
            }
            // Reseta tooltip do tray
            let _ = tray::update_tooltip(&app, None);
            break;
        }

        tokio::select! {
            _ = sleep(Duration::from_secs(1)) => {}
            _ = cancel.cancelled() => break,
        }
    }
}

fn update_tray_tooltip(app: &AppHandle, info: &ActiveSchedule, remaining_seconds: i64) {
    let text = if remaining_seconds > 0 {
        format!(
            "Wise Auto Shutdown — {} em {}",
            info.action.label_pt(),
            format_remaining(remaining_seconds)
        )
    } else {
        "Wise Auto Shutdown".to_string()
    };
    let _ = tray::update_tooltip(app, Some(&text));
}

fn format_remaining(seconds: i64) -> String {
    let s = seconds.max(0) as u64;
    let h = s / 3600;
    let m = (s % 3600) / 60;
    let sec = s % 60;
    if h > 0 {
        format!("{}h{}min", h, m)
    } else if m > 0 {
        format!("{}min{}s", m, sec)
    } else {
        format!("{}s", sec)
    }
}

pub fn cancel(app: &AppHandle) -> bool {
    let state: tauri::State<'_, AppState> = app.state();
    let mut guard = state.schedule.lock();
    if let Some(handle) = guard.take() {
        handle.cancel.cancel();
        handle.task.abort();
        let _ = tray::update_tooltip(app, None);
        true
    } else {
        false
    }
}

pub fn current(app: &AppHandle) -> Option<ActiveSchedule> {
    let state: tauri::State<'_, AppState> = app.state();
    let guard = state.schedule.lock();
    let info = guard.as_ref().map(|h| h.info.clone());
    drop(guard);
    info
}

pub fn has_active(app: &AppHandle) -> bool {
    let state: tauri::State<'_, AppState> = app.state();
    let guard = state.schedule.lock();
    let result = guard.is_some();
    drop(guard);
    result
}
