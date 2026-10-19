import { useEffect, useState } from "react";
import { CheckCircle2, CircleSlash, Plus, SkipForward, Trash2, XCircle } from "lucide-react";
import NumberField from "@/components/NumberField";
import Toggle from "@/components/Toggle";
import { ACTIONS, getAction, getActionLabel } from "@/lib/actions";
import { formatDateTime, formatWhen, localDateTimeMs, nextFullHour, toISODate } from "@/lib/format";
import { ALL_DAYS, WEEKDAYS, WORK_DAYS, describeTrigger, isIdle, isRecurring, nextWeekly } from "@/lib/tasks";
import { useStore } from "@/store/useStore";
import type { ActionKind, HistoryEntry, Task, TriggerRequest } from "@/types";

type Mode = "timer" | "at" | "weekly" | "idle";

const MODES: { key: Mode; label: string }[] = [
  { key: "timer", label: "Daqui a" },
  { key: "at", label: "Data e hora" },
  { key: "weekly", label: "Repetir" },
  { key: "idle", label: "Inatividade" },
];

const TIMER_PRESETS = [15, 30, 60, 120, 180];
const MAX_TIMER_MIN = 7 * 24 * 60;

const SOURCE_LABEL: Record<HistoryEntry["source"], string> = {
  app: "app",
  tray: "bandeja",
  hotkey: "atalho",
  task: "tarefa",
};

/** Atualiza "agora" periodicamente para as prévias de horário. */
function useNow(intervalMs = 15_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function TaskForm() {
  const createTask = useStore((s) => s.createTask);
  const hibernateAvailable = useStore((s) => s.hibernateAvailable);
  const defaultReminder = useStore((s) => s.settings?.default_reminder_minutes ?? 5);
  const now = useNow();

  const initial = nextFullHour();
  const [mode, setMode] = useState<Mode>("timer");
  const [action, setAction] = useState<ActionKind>("shutdown");
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(30);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [weeklyTime, setWeeklyTime] = useState("23:00");
  const [days, setDays] = useState<number[]>(ALL_DAYS);
  const [idleMinutes, setIdleMinutes] = useState(30);
  const [force, setForce] = useState(false);
  const [reminder, setReminder] = useState(defaultReminder);
  const [submitting, setSubmitting] = useState(false);

  // Acompanha o lembrete padrão das configurações.
  useEffect(() => setReminder(defaultReminder), [defaultReminder]);

  const selected = getAction(action) ?? ACTIONS[0];
  const totalMinutes = hours * 60 + minutes;

  let targetMs: number | null = null;
  let error: string | null = null;
  if (mode === "timer") {
    if (totalMinutes < 1) error = "Defina pelo menos 1 minuto.";
    else if (totalMinutes > MAX_TIMER_MIN) error = "No máximo 7 dias.";
    else targetMs = now + totalMinutes * 60_000;
  } else if (mode === "at") {
    const ms = localDateTimeMs(date, time);
    if (Number.isNaN(ms)) error = "Data ou horário inválido.";
    else if (ms <= Date.now()) error = "Esse horário já passou.";
    else targetMs = ms;
  } else if (mode === "weekly") {
    if (days.length === 0) error = "Escolha pelo menos um dia.";
    else targetMs = nextWeekly(weeklyTime, days, now);
  }
  if (action === "hibernate" && !hibernateAvailable) error = "Hibernação está desativada neste PC.";

  const reminderTooLong = targetMs !== null && reminder > 0 && reminder * 60_000 >= targetMs - now;

  const onSubmit = async () => {
    if (error || submitting) return;
    let trigger: TriggerRequest;
    if (mode === "timer") trigger = { timer: { seconds: totalMinutes * 60 } };
    else if (mode === "at") trigger = { at: { date, hh_mm: time } };
    else if (mode === "weekly") trigger = { weekly: { hh_mm: weeklyTime, days } };
    else trigger = { idle: { minutes: idleMinutes } };
    setSubmitting(true);
    await createTask({
      action,
      force: force && selected.supportsForce,
      reminder_minutes: mode === "idle" ? 0 : reminder,
      trigger,
    });
    setSubmitting(false);
  };

  const toggleDay = (d: number) =>
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort((a, b) => a - b)));

  return (
    <section className="p-5 rounded-2xl bg-card dark:bg-card-dark border border-stroke dark:border-stroke-dark space-y-5">
      <div className="flex gap-1.5 p-1.5 rounded-xl bg-black/5 dark:bg-white/5" role="radiogroup" aria-label="Tipo de agendamento">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            role="radio"
            aria-checked={mode === m.key}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              mode === m.key
                ? "bg-white dark:bg-zinc-700 text-text-primary dark:text-text-darkPrimary shadow-fluent"
                : "text-text-secondary dark:text-text-darkSecondary hover:bg-black/5 dark:hover:bg-white/10"
            }`}
            onClick={() => setMode(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === "timer" && (
        <div>
          <span className="label">Executar daqui a</span>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <NumberField id="sched-hours" value={hours} min={0} max={168} onChange={setHours} className="!w-20" ariaLabel="Horas" />
            <span className="text-sm text-text-secondary dark:text-text-darkSecondary">h</span>
            <NumberField id="sched-minutes" value={minutes} min={0} max={59} onChange={setMinutes} className="!w-20" ariaLabel="Minutos" />
            <span className="text-sm text-text-secondary dark:text-text-darkSecondary mr-2">min</span>
            <div className="flex gap-1.5 flex-wrap">
              {TIMER_PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className="chip"
                  onClick={() => {
                    setHours(Math.floor(m / 60));
                    setMinutes(m % 60);
                  }}
                >
                  {m < 60 ? `${m}min` : `${m / 60}h`}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {mode === "at" && (
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-[160px]">
            <label htmlFor="sched-date" className="label">Data</label>
            <input
              id="sched-date"
              type="date"
              value={date}
              min={toISODate(new Date())}
              onChange={(e) => setDate(e.target.value)}
              className="input mt-2"
            />
          </div>
          <div className="flex-1 min-w-[120px]">
            <label htmlFor="sched-time" className="label">Horário</label>
            <input id="sched-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="input mt-2" />
          </div>
        </div>
      )}

      {mode === "weekly" && (
        <div className="space-y-3">
          <div className="max-w-[160px]">
            <label htmlFor="sched-weekly-time" className="label">Horário</label>
            <input
              id="sched-weekly-time"
              type="time"
              value={weeklyTime}
              onChange={(e) => setWeeklyTime(e.target.value)}
              className="input mt-2"
            />
          </div>
          <div>
            <span className="label">Dias</span>
            <div className="flex gap-1.5 mt-2 flex-wrap" role="group" aria-label="Dias da semana">
              {WEEKDAYS.map((label, d) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={days.includes(d)}
                  className={`chip w-12 ${days.includes(d) ? "!bg-accent !text-white" : ""}`}
                  onClick={() => toggleDay(d)}
                >
                  {label}
                </button>
              ))}
              <button type="button" className="chip" onClick={() => setDays(ALL_DAYS)}>Todos</button>
              <button type="button" className="chip" onClick={() => setDays(WORK_DAYS)}>Dias úteis</button>
            </div>
          </div>
        </div>
      )}

      {mode === "idle" && (
        <div>
          <label htmlFor="sched-idle" className="label">Após quantos minutos sem uso</label>
          <div className="flex items-center gap-2 mt-2">
            <NumberField id="sched-idle" value={idleMinutes} min={1} max={1440} onChange={setIdleMinutes} className="!w-28" />
            <span className="text-sm text-text-secondary dark:text-text-darkSecondary">min</span>
          </div>
          <p className="text-xs text-text-secondary dark:text-text-darkSecondary mt-2">
            Conta o tempo sem teclado e mouse. Atenção: assistir um vídeo sem mexer no PC também conta como inatividade.
          </p>
        </div>
      )}

      <div className="flex gap-3 flex-wrap">
        <div className="flex-1 min-w-[180px]">
          <label htmlFor="sched-action" className="label">Ação</label>
          <select
            id="sched-action"
            value={action}
            onChange={(e) => setAction(e.target.value as ActionKind)}
            className="input mt-2"
          >
            {ACTIONS.map((a) => (
              <option key={a.key} value={a.key} disabled={a.key === "hibernate" && !hibernateAvailable}>
                {a.label}
                {a.key === "hibernate" && !hibernateAvailable ? " (indisponível)" : ""}
              </option>
            ))}
          </select>
        </div>
        {mode !== "idle" && (
          <div className="w-40">
            <label htmlFor="sched-reminder" className="label">Lembrete (min antes)</label>
            <NumberField id="sched-reminder" value={reminder} min={0} max={120} onChange={setReminder} className="mt-2" />
          </div>
        )}
      </div>

      {selected.supportsForce && (
        <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
          <input
            type="checkbox"
            checked={force}
            onChange={(e) => setForce(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-danger"
          />
          <span className="text-sm">
            <span className="font-medium">Forçar (fecha programas sem perguntar)</span>
            <span className="block text-xs text-text-secondary dark:text-text-darkSecondary mt-0.5">
              Recomendado para agendamentos sem ninguém no PC: sem forçar, um programa pedindo &quot;salvar?&quot; pode
              impedir a ação.
            </span>
          </span>
        </label>
      )}

      <div className="text-sm min-h-[20px]" aria-live="polite">
        {error ? (
          <span className="text-danger">{error}</span>
        ) : targetMs !== null ? (
          <span className="text-text-secondary dark:text-text-darkSecondary">
            {mode === "weekly" ? "Primeira execução" : "Vai executar"}{" "}
            <strong className="text-text-primary dark:text-text-darkPrimary">{formatWhen(targetMs, now)}</strong>
            {reminderTooLong && " · o lembrete é maior que o tempo restante e não será enviado"}
          </span>
        ) : null}
      </div>

      <button type="button" className="btn-primary w-full" disabled={!!error || submitting} onClick={onSubmit}>
        <Plus size={18} />
        Adicionar tarefa
      </button>
    </section>
  );
}

function TaskRow({ task }: { task: Task }) {
  const deleteTask = useStore((s) => s.deleteTask);
  const setTaskEnabled = useStore((s) => s.setTaskEnabled);
  const skipTask = useStore((s) => s.skipTask);
  const action = getAction(task.action);
  const recurring = isRecurring(task);

  let nextText = "pausada";
  if (task.enabled) {
    if (isIdle(task)) nextText = "aguardando inatividade";
    else if (task.next_ts_ms) nextText = `próxima: ${formatWhen(task.next_ts_ms)}`;
  }

  return (
    <li
      className={`flex items-center gap-3 p-4 rounded-2xl bg-card dark:bg-card-dark border border-stroke dark:border-stroke-dark ${
        task.enabled ? "" : "opacity-60"
      }`}
    >
      {action && (
        <div className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center bg-black/5 dark:bg-white/5 ${action.iconColor}`}>
          <action.icon size={20} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary dark:text-text-darkPrimary">
          {getActionLabel(task.action)}{" "}
          <span className="font-normal text-text-secondary dark:text-text-darkSecondary">· {describeTrigger(task.trigger)}</span>
        </p>
        <p className="text-xs text-text-secondary dark:text-text-darkSecondary mt-0.5">
          {nextText}
          {task.override_next_ms && task.enabled ? " (adiada)" : ""}
          {task.force ? " · forçado" : ""}
          {task.reminder_minutes > 0 && !isIdle(task) ? ` · lembrete ${task.reminder_minutes} min` : ""}
        </p>
      </div>
      {recurring && !isIdle(task) && task.enabled && (
        <button
          type="button"
          className="btn-ghost px-2.5 py-1.5"
          onClick={() => skipTask(task.id)}
          title="Pular a próxima ocorrência"
          aria-label={`Pular próxima ocorrência de ${getActionLabel(task.action)}`}
        >
          <SkipForward size={16} />
        </button>
      )}
      {recurring && (
        <Toggle
          checked={task.enabled}
          onChange={(v) => setTaskEnabled(task.id, v)}
          ariaLabel={`Ativar ${getActionLabel(task.action)} ${describeTrigger(task.trigger)}`}
        />
      )}
      <button
        type="button"
        className="btn-ghost px-2.5 py-1.5 text-danger hover:bg-danger/10"
        onClick={() => deleteTask(task.id)}
        title="Excluir tarefa"
        aria-label={`Excluir ${getActionLabel(task.action)} ${describeTrigger(task.trigger)}`}
      >
        <Trash2 size={16} />
      </button>
    </li>
  );
}

function History() {
  const history = useStore((s) => s.history);
  const clearHistory = useStore((s) => s.clearHistory);
  if (history.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-semibold text-text-primary dark:text-text-darkPrimary">Histórico</h3>
        <button type="button" className="btn-ghost text-xs px-3 py-1.5" onClick={clearHistory}>
          Limpar
        </button>
      </div>
      <ul className="rounded-2xl bg-card dark:bg-card-dark border border-stroke dark:border-stroke-dark divide-y divide-stroke dark:divide-stroke-dark">
        {history.slice(0, 20).map((h) => {
          const Icon = h.status === "ok" ? CheckCircle2 : h.status === "missed" ? CircleSlash : XCircle;
          const color = h.status === "ok" ? "text-success" : h.status === "missed" ? "text-warning" : "text-danger";
          return (
            <li key={`${h.ts_ms}-${h.action}-${h.status}`} className="flex items-start gap-3 px-4 py-2.5 text-sm">
              <Icon size={16} className={`${color} mt-0.5 shrink-0`} />
              <span className="flex-1 min-w-0 select-text">
                <span className="text-text-primary dark:text-text-darkPrimary">{getActionLabel(h.action)}</span>
                <span className="text-text-secondary dark:text-text-darkSecondary">
                  {" "}· {h.status === "missed" ? "perdida" : SOURCE_LABEL[h.source]}
                  {h.detail ? ` · ${h.detail}` : ""}
                </span>
              </span>
              <span className="text-xs text-text-secondary dark:text-text-darkSecondary tabular-nums shrink-0">
                {formatDateTime(h.ts_ms)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function Tasks() {
  const tasks = useStore((s) => s.tasks);
  const sorted = [...tasks].sort(
    (a, b) => Number(b.enabled) - Number(a.enabled) || (a.next_ts_ms ?? Infinity) - (b.next_ts_ms ?? Infinity)
  );

  return (
    <div className="page-scroll space-y-5">
      <div>
        <h2 className="text-xl font-bold text-text-primary dark:text-text-darkPrimary mb-1">Tarefas agendadas</h2>
        <p className="text-sm text-text-secondary dark:text-text-darkSecondary">
          Programe ações para depois, em um horário, toda semana ou quando o PC ficar sem uso. As tarefas ficam salvas
          mesmo se o app ou o PC reiniciar.
        </p>
      </div>

      <TaskForm />

      <section>
        <h3 className="text-base font-semibold text-text-primary dark:text-text-darkPrimary mb-2">
          Tarefas ({tasks.length})
        </h3>
        {sorted.length === 0 ? (
          <p className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 text-sm text-text-secondary dark:text-text-darkSecondary">
            Nenhuma tarefa ainda. Use o formulário acima ou o menu da bandeja (&quot;Agendar desligamento&quot;).
          </p>
        ) : (
          <ul className="space-y-2.5">
            {sorted.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </ul>
        )}
      </section>

      <History />
    </div>
  );
}
