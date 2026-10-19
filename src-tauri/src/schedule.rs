//! Motor de tarefas agendadas: várias tarefas (única, semanal ou por inatividade),
//! persistidas em tasks.json e avaliadas por um loop único.

use std::collections::HashSet;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use chrono::{Local, TimeZone};
use tauri::{AppHandle, Emitter, Manager};

use crate::actions::{self, notify, notify_error, now_ms};
use crate::persist;
use crate::power::{self, KeepAwake};
use crate::state::AppState;
use crate::trigger::{at_ms, format_remaining, next_weekly, normalize_days, parse_date, parse_hhmm};
use crate::tray;
use crate::types::{
    ActionKind, HistoryStatus, NextInfo, NextKind, Source, Task, TaskRequest, TaskView, Trigger,
    TriggerRequest,
};
use crate::window;

const FILE: &str = "tasks.json";
const MAX_TASKS: usize = 50;
const MAX_TIMER_SECS: u64 = 7 * 86_400;
const MAX_AHEAD_MS: i64 = 366 * 86_400_000;
/// Atraso acima do normal (PC acordando, app reabrindo): executa só após período de graça.
const LATE_DETECT_MS: i64 = 5_000;
/// Atraso grande demais: a ocorrência é considerada perdida e não executa.
const LATE_TOLERANCE_MS: i64 = 120_000;
const MIN_GRACE_MS: i64 = 30_000;

static COUNTER: AtomicU64 = AtomicU64::new(0);

fn new_id() -> String {
    format!("task-{}-{}", now_ms(), COUNTER.fetch_add(1, Ordering::Relaxed))
}

fn fmt_local(ms: i64) -> String {
    Local
        .timestamp_millis_opt(ms)
        .single()
        .map(|d| d.format("%d/%m às %H:%M").to_string())
        .unwrap_or_default()
}

fn is_time_based(t: &Task) -> bool {
    !matches!(t.trigger, Trigger::Idle { .. })
}

/// Próxima execução de uma tarefa por horário (None para inatividade).
pub fn due_ms(t: &Task) -> Option<i64> {
    if let Some(o) = t.override_next_ms {
        return Some(o);
    }
    match &t.trigger {
        Trigger::Once { target_ts_ms } => Some(*target_ts_ms),
        Trigger::Weekly { hh_mm, days } => {
            let (h, m) = parse_hhmm(hh_mm).ok()?;
            let after = Local.timestamp_millis_opt(t.anchor_ts_ms).single()?;
            next_weekly(&Local, h, m, days, &after).map(|d| d.timestamp_millis())
        }
        Trigger::Idle { .. } => None,
    }
}

// ---------------------------------------------------------------- persistência

pub fn load(app: &AppHandle) {
    let list: Vec<Task> = persist::load_json(&persist::data_file(app, FILE)).unwrap_or_default();
    *app.state::<AppState>().tasks.lock() = list;
}

fn views(tasks: &[Task]) -> Vec<TaskView> {
    tasks
        .iter()
        .map(|t| TaskView { task: t.clone(), next_ts_ms: due_ms(t) })
        .collect()
}

pub fn list(app: &AppHandle) -> Vec<TaskView> {
    views(&app.state::<AppState>().tasks.lock())
}

/// Altera a lista, persiste, avisa a UI e acorda o motor.
fn mutate<R>(app: &AppHandle, f: impl FnOnce(&mut Vec<Task>) -> Result<R, String>) -> Result<R, String> {
    let state = app.state::<AppState>();
    let (r, snapshot) = {
        let mut guard = state.tasks.lock();
        let r = f(&mut guard)?;
        (r, guard.clone())
    };
    if let Err(e) = persist::save_json(&persist::data_file(app, FILE), &snapshot) {
        tracing::error!("falha ao salvar tarefas: {e}");
    }
    let _ = app.emit("tasks-changed", views(&snapshot));
    state.wake_engine();
    Ok(r)
}

fn find_mut<'a>(list: &'a mut [Task], id: &str) -> Result<&'a mut Task, String> {
    list.iter_mut().find(|t| t.id == id).ok_or_else(|| "tarefa não encontrada".to_string())
}

/// Avança a tarefa depois de executada (ou pulada) na ocorrência `due`.
fn advance(list: &mut Vec<Task>, id: &str, due: i64) {
    let Some(pos) = list.iter().position(|t| t.id == id) else { return };
    match list[pos].trigger {
        Trigger::Once { .. } => {
            list.remove(pos);
        }
        Trigger::Weekly { .. } => {
            list[pos].anchor_ts_ms = due;
            list[pos].override_next_ms = None;
        }
        Trigger::Idle { .. } => {}
    }
}

// ---------------------------------------------------------------- operações

fn build_trigger(req: TriggerRequest, now: i64) -> Result<Trigger, String> {
    match req {
        TriggerRequest::Timer { seconds } => {
            if seconds < 60 {
                return Err("O tempo precisa ser de pelo menos 1 minuto.".into());
            }
            if seconds > MAX_TIMER_SECS {
                return Err("O tempo pode ser de no máximo 7 dias.".into());
            }
            Ok(Trigger::Once { target_ts_ms: now + seconds as i64 * 1000 })
        }
        TriggerRequest::At { date, hh_mm } => {
            let (h, m) = parse_hhmm(&hh_mm)?;
            let d = parse_date(&date)?;
            let ms = at_ms(&Local, d, h, m).ok_or("horário inválido")?;
            if ms <= now {
                return Err("Esse horário já passou.".into());
            }
            if ms > now + MAX_AHEAD_MS {
                return Err("Escolha uma data dentro de 1 ano.".into());
            }
            Ok(Trigger::Once { target_ts_ms: ms })
        }
        TriggerRequest::Weekly { hh_mm, days } => {
            let (h, m) = parse_hhmm(&hh_mm)?;
            Ok(Trigger::Weekly { hh_mm: format!("{h:02}:{m:02}"), days: normalize_days(&days)? })
        }
        TriggerRequest::Idle { minutes } => {
            if !(1..=1440).contains(&minutes) {
                return Err("A inatividade deve ser entre 1 e 1440 minutos.".into());
            }
            Ok(Trigger::Idle { minutes })
        }
    }
}

pub fn create(app: &AppHandle, req: TaskRequest) -> Result<TaskView, String> {
    if req.action == ActionKind::Hibernate && !power::hibernate_available() {
        return Err("Hibernação está desativada neste PC.".into());
    }
    let now = now_ms();
    let task = Task {
        id: new_id(),
        action: req.action,
        force: req.force && req.action.supports_force(),
        reminder_minutes: req.reminder_minutes.min(120),
        trigger: build_trigger(req.trigger, now)?,
        enabled: true,
        created_ts_ms: now,
        anchor_ts_ms: now,
        override_next_ms: None,
    };
    mutate(app, |list| {
        if list.len() >= MAX_TASKS {
            return Err(format!("Limite de {MAX_TASKS} tarefas atingido."));
        }
        list.push(task.clone());
        Ok(())
    })?;
    Ok(TaskView { next_ts_ms: due_ms(&task), task })
}

pub fn delete(app: &AppHandle, id: &str) -> Result<(), String> {
    mutate(app, |list| {
        let before = list.len();
        list.retain(|t| t.id != id);
        if list.len() == before {
            return Err("tarefa não encontrada".into());
        }
        Ok(())
    })
}

pub fn set_enabled(app: &AppHandle, id: &str, enabled: bool) -> Result<(), String> {
    let now = now_ms();
    mutate(app, |list| {
        let t = find_mut(list, id)?;
        if enabled {
            if let Trigger::Once { target_ts_ms } = t.trigger {
                if t.override_next_ms.unwrap_or(target_ts_ms) <= now {
                    return Err("O horário desta tarefa já passou.".into());
                }
            } else {
                // Recomeça a partir de agora: não "recupera" ocorrências do período pausado.
                t.anchor_ts_ms = now;
                t.override_next_ms = None;
            }
        }
        t.enabled = enabled;
        Ok(())
    })
}

/// Adia a próxima execução em `minutes`. Retorna o novo horário.
pub fn snooze(app: &AppHandle, id: &str, minutes: u32) -> Result<i64, String> {
    if !(1..=240).contains(&minutes) {
        return Err("Adiamento deve ser entre 1 e 240 minutos.".into());
    }
    let now = now_ms();
    mutate(app, |list| {
        let t = find_mut(list, id)?;
        if !is_time_based(t) {
            return Err("Tarefas por inatividade não podem ser adiadas.".into());
        }
        let due = due_ms(t).unwrap_or(now);
        let new_due = due.max(now) + minutes as i64 * 60_000;
        t.override_next_ms = Some(new_due);
        t.anchor_ts_ms = now;
        t.enabled = true;
        Ok(new_due)
    })
}

/// Pula a próxima ocorrência (tarefa única é removida).
pub fn skip_next(app: &AppHandle, id: &str) -> Result<(), String> {
    mutate(app, |list| {
        let t = find_mut(list, id)?;
        let due = due_ms(t).ok_or("Tarefas por inatividade não podem ser puladas.")?;
        let id = t.id.clone();
        advance(list, &id, due);
        Ok(())
    })
}

pub fn run_now(app: &AppHandle, id: &str) -> Result<(), String> {
    let t = app
        .state::<AppState>()
        .tasks
        .lock()
        .iter()
        .find(|t| t.id == id)
        .cloned()
        .ok_or("tarefa não encontrada")?;
    if let Some(due) = due_ms(&t) {
        mutate(app, |list| {
            advance(list, &t.id, due);
            Ok(())
        })?;
    }
    actions::execute(app, t.action, t.force, Source::App)
}

/// Cancela a próxima tarefa a disparar. Retorna uma descrição do que foi feito.
pub fn cancel_next(app: &AppHandle) -> Result<Option<String>, String> {
    let Some(next) = app.state::<AppState>().next.lock().clone() else {
        return Ok(None);
    };
    let label = next.action.label_pt();
    let task = app
        .state::<AppState>()
        .tasks
        .lock()
        .iter()
        .find(|t| t.id == next.task_id)
        .cloned()
        .ok_or("tarefa não encontrada")?;
    let msg = match task.trigger {
        Trigger::Once { .. } => {
            delete(app, &task.id)?;
            format!("Tarefa cancelada: {label}.")
        }
        Trigger::Weekly { .. } => {
            skip_next(app, &task.id)?;
            format!("Ocorrência pulada: {label} de {}.", fmt_local(next.target_ts_ms))
        }
        Trigger::Idle { .. } => {
            set_enabled(app, &task.id, false)?;
            format!("Tarefa por inatividade pausada: {label}.")
        }
    };
    Ok(Some(msg))
}

pub fn pending_count(app: &AppHandle) -> usize {
    app.state::<AppState>().tasks.lock().iter().filter(|t| t.enabled).count()
}

pub fn next(app: &AppHandle) -> Option<NextInfo> {
    app.state::<AppState>().next.lock().clone()
}

/// Atalho da bandeja: "Agendar desligamento em N min".
pub fn quick_timer(app: &AppHandle, action: ActionKind, minutes: u64) -> Result<TaskView, String> {
    let default_reminder = app.state::<AppState>().settings.read().default_reminder_minutes as u64;
    let reminder = if default_reminder < minutes { default_reminder } else { 0 };
    create(
        app,
        TaskRequest {
            action,
            force: false,
            reminder_minutes: reminder as u32,
            trigger: TriggerRequest::Timer { seconds: minutes * 60 },
        },
    )
}

// ---------------------------------------------------------------- motor

#[derive(Default)]
struct Engine {
    reminded: HashSet<(String, i64)>,
    graced: HashSet<String>,
    idle_disarmed: HashSet<String>,
    warning_for: Option<String>,
    tray_state: Option<(bool, bool, bool)>,
    last_tooltip: String,
}

pub async fn run_engine(app: AppHandle) {
    let mut eng = Engine::default();
    loop {
        let wait = tick(&app, &mut eng);
        let state = app.state::<AppState>();
        tokio::select! {
            _ = tokio::time::sleep(wait) => {}
            _ = state.engine_wake.notified() => {}
        }
    }
}

fn fire(app: &AppHandle, eng: &mut Engine, t: &Task, due: i64) {
    eng.graced.remove(&t.id);
    // Persiste ANTES de executar: desligar/reiniciar pode encerrar o processo.
    let _ = mutate(app, |list| {
        advance(list, &t.id, due);
        Ok(())
    });
    window::set_on_top(app, false);
    eng.warning_for = None;
    if let Err(e) = actions::execute(app, t.action, t.force, Source::Task) {
        notify_error(app, format!("Falha ao executar \"{}\": {e}", t.action.label_pt()));
    }
}

fn missed(app: &AppHandle, eng: &mut Engine, t: &Task, due: i64) {
    eng.graced.remove(&t.id);
    let now = now_ms();
    let _ = mutate(app, |list| {
        let Some(pos) = list.iter().position(|x| x.id == t.id) else { return Ok(()) };
        match list[pos].trigger {
            Trigger::Once { .. } => {
                list.remove(pos);
            }
            _ => {
                list[pos].anchor_ts_ms = now;
                list[pos].override_next_ms = None;
            }
        }
        Ok(())
    });
    actions::record(
        app,
        t.action,
        Source::Task,
        HistoryStatus::Missed,
        Some(format!("Agendado para {}", fmt_local(due))),
    );
    notify(
        app,
        "Wise Auto Shutdown",
        format!(
            "\"{}\" não foi executado ({}) porque o PC estava suspenso, desligado ou o app fechado.",
            t.action.label_pt(),
            fmt_local(due)
        ),
    );
}

fn set_keep_awake(state: &AppState, desired: bool) {
    let mut guard = state.keep_awake.lock();
    if desired && guard.is_none() {
        tracing::info!("mantendo o PC acordado");
        *guard = Some(KeepAwake::start());
    } else if !desired && guard.is_some() {
        tracing::info!("liberando suspensão automática");
        *guard = None;
    }
}

fn tick(app: &AppHandle, eng: &mut Engine) -> Duration {
    let state = app.state::<AppState>();
    let settings = state.settings();
    let now = now_ms();
    let fw_ms = settings.final_warning_seconds as i64 * 1000;
    let tasks: Vec<Task> = state.tasks.lock().clone();
    let enabled: Vec<&Task> = tasks.iter().filter(|t| t.enabled).collect();
    let idle_ms = if enabled.iter().any(|t| !is_time_based(t)) { power::idle_ms() as i64 } else { 0 };

    let ids: HashSet<&str> = tasks.iter().map(|t| t.id.as_str()).collect();
    eng.reminded.retain(|(id, _)| ids.contains(id.as_str()));
    eng.graced.retain(|id| ids.contains(id.as_str()));
    eng.idle_disarmed.retain(|id| ids.contains(id.as_str()));

    // 1) Tarefa por horário vencida (uma por vez).
    let due_now = enabled
        .iter()
        .filter(|t| is_time_based(t))
        .filter_map(|t| due_ms(t).map(|d| (d, *t)))
        .filter(|(d, _)| *d <= now)
        .min_by_key(|(d, _)| *d);
    if let Some((due, t)) = due_now {
        let t = t.clone();
        let late = now - due;
        if late > LATE_TOLERANCE_MS {
            missed(app, eng, &t, due);
        } else if late > LATE_DETECT_MS && !eng.graced.contains(&t.id) {
            // PC acordou / app reabriu depois do horário: dá chance de cancelar.
            eng.graced.insert(t.id.clone());
            let grace = fw_ms.max(MIN_GRACE_MS);
            let _ = mutate(app, |list| {
                find_mut(list, &t.id)?.override_next_ms = Some(now + grace);
                Ok(())
            });
            notify(
                app,
                "Wise Auto Shutdown — ação iminente",
                format!(
                    "O horário de \"{}\" passou enquanto o PC estava suspenso ou o app fechado. \
                     Executa em {}s — cancele se necessário.",
                    t.action.label_pt(),
                    grace / 1000
                ),
            );
        } else {
            fire(app, eng, &t, due);
        }
        return Duration::from_millis(100);
    }

    // 2) Tarefas por inatividade.
    for t in enabled.iter().filter(|t| !is_time_based(t)) {
        let Trigger::Idle { minutes } = t.trigger else { continue };
        let threshold = minutes as i64 * 60_000;
        if idle_ms < threshold {
            eng.idle_disarmed.remove(&t.id);
        } else if eng.idle_disarmed.insert(t.id.clone()) {
            // Só rearma depois que o usuário voltar a usar o PC.
            let t = (*t).clone();
            fire(app, eng, &t, now);
            return Duration::from_millis(100);
        }
    }

    // 3) Próxima tarefa.
    let mut best: Option<(i64, &Task, NextKind)> = None;
    for t in &enabled {
        let candidate = match t.trigger {
            Trigger::Idle { minutes } if !eng.idle_disarmed.contains(&t.id) => {
                Some((now + (minutes as i64 * 60_000 - idle_ms).max(0), NextKind::Idle))
            }
            Trigger::Idle { .. } => None,
            _ => due_ms(t).map(|d| (d, NextKind::Time)),
        };
        if let Some((d, k)) = candidate {
            if best.map_or(true, |(bd, _, _)| d < bd) {
                best = Some((d, *t, k));
            }
        }
    }
    let next_info = best.map(|(d, t, k)| NextInfo {
        task_id: t.id.clone(),
        action: t.action,
        target_ts_ms: d,
        remaining_seconds: ((d - now).max(0) as u64).div_ceil(1000),
        kind: k,
        recurring: !matches!(t.trigger, Trigger::Once { .. }),
    });
    *state.next.lock() = next_info.clone();
    let _ = app.emit("schedule-tick", &next_info);

    // 4) Lembretes (uma vez por ocorrência; não dispara se a janela de lembrete
    //    começou antes de a tarefa ser criada/adiada).
    for t in enabled.iter().filter(|t| is_time_based(t) && t.reminder_minutes > 0) {
        let Some(due) = due_ms(t) else { continue };
        let rem_ms = t.reminder_minutes as i64 * 60_000;
        let remaining = due - now;
        if remaining <= rem_ms
            && remaining > fw_ms.max(0)
            && due - rem_ms > t.anchor_ts_ms
            && eng.reminded.insert((t.id.clone(), due))
        {
            notify(
                app,
                "Wise Auto Shutdown",
                format!(
                    "\"{}\" será executado em {} ({}).",
                    t.action.label_pt(),
                    format_remaining((remaining + 999) / 1000),
                    fmt_local(due)
                ),
            );
        }
    }

    // 5) Aviso final: traz a janela para frente e mantém no topo.
    let in_warning = next_info
        .as_ref()
        .filter(|n| fw_ms > 0 && n.target_ts_ms - now <= fw_ms)
        .map(|n| n.task_id.clone());
    if in_warning != eng.warning_for {
        match &in_warning {
            Some(_) => {
                window::show_main(app);
                window::set_on_top(app, true);
            }
            None => window::set_on_top(app, false),
        }
        eng.warning_for = in_warning;
    }

    // 6) Manter acordado.
    let manual = state.keep_awake_manual.load(Ordering::Relaxed);
    let auto = settings.keep_awake_during_tasks
        && enabled.iter().any(|t| matches!(t.trigger, Trigger::Once { .. }));
    set_keep_awake(&state, manual || auto);

    // 7) Bandeja.
    let tip = match &next_info {
        Some(n) if n.kind == NextKind::Time => format!(
            "Wise Auto Shutdown — {} em {}",
            n.action.label_pt(),
            format_remaining(n.remaining_seconds as i64)
        ),
        Some(n) => format!(
            "Wise Auto Shutdown — {} após inatividade (faltam {})",
            n.action.label_pt(),
            format_remaining(n.remaining_seconds as i64)
        ),
        None => "Wise Auto Shutdown".to_string(),
    };
    if tip != eng.last_tooltip {
        tray::update_tooltip(app, &tip);
        eng.last_tooltip = tip;
    }
    let ts = (
        next_info.is_some(),
        next_info.as_ref().is_some_and(|n| n.kind == NextKind::Time),
        manual,
    );
    if eng.tray_state != Some(ts) {
        tray::refresh(app, ts.0, ts.1, ts.2);
        eng.tray_state = Some(ts);
    }

    // 8) Próximo tick alinhado ao segundo do alvo (contagem regressiva suave).
    let wait_ms = next_info
        .as_ref()
        .filter(|n| n.kind == NextKind::Time)
        .map(|n| {
            let r = n.target_ts_ms - now;
            match r % 1000 {
                _ if r <= 0 => 50,
                0 => 1000,
                m => m.max(20),
            }
        })
        .unwrap_or(1000);
    Duration::from_millis(wait_ms as u64)
}
