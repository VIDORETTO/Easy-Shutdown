import { useState } from "react";
import { Play, Square } from "lucide-react";
import { ACTIONS, getAction, getActionLabel } from "@/lib/actions";
import { nextHour, sanitizeInt, formatSeconds, formatTimestampMs } from "@/lib/format";
import { useStore } from "@/store/useStore";
import type { ActionKind, ScheduleRequest } from "@/types";

type Mode = "timer" | "at_time";

export default function Scheduler() {
  const startSchedule = useStore((s) => s.startSchedule);
  const cancelSchedule = useStore((s) => s.cancelSchedule);
  const active = useStore((s) => s.activeSchedule);
  const remainingSeconds = useStore((s) => s.remainingSeconds);

  const [mode, setMode] = useState<Mode>("timer");
  const [action, setAction] = useState<ActionKind>("shutdown");
  const [minutes, setMinutes] = useState(30);
  const [atTime, setAtTime] = useState(nextHour());
  const [force, setForce] = useState(false);
  const [reminder, setReminder] = useState(1);

  const selectedAction = getAction(action) ?? ACTIONS[0];
  const canSubmit = !active && (mode === "timer" ? minutes > 0 : !!atTime);

  const onStart = async () => {
    const safeMinutes = sanitizeInt(String(minutes), 1, 10080);
    const safeReminder = sanitizeInt(String(reminder), 0, 120);
    const request: ScheduleRequest = {
      action,
      force: force && selectedAction.supportsForce,
      reminder_minutes: safeReminder,
      mode:
        mode === "timer"
          ? { timer: { seconds: safeMinutes * 60 } }
          : { at_time: { hh_mm: atTime } },
    };
    await startSchedule(request);
  };

  return (
    <div className="page-scroll space-y-5">
      <div>
        <h2 className="text-xl font-bold text-text-primary dark:text-text-darkPrimary mb-1">
          Agendar ação
        </h2>
        <p className="text-sm text-text-secondary dark:text-text-darkSecondary">
          Programe um desligamento, reinício, etc. para depois.
        </p>
      </div>

      {/* Schedule ativo */}
      {active && (
        <div className="p-5 rounded-2xl bg-accent/10 border border-accent/30 animate-fade-in">
          <p className="text-base font-semibold text-text-primary dark:text-text-darkPrimary mb-1">
            Agendamento ativo: {getActionLabel(active.action)} em{" "}
            <span className="text-accent font-mono">{formatSeconds(remainingSeconds)}</span>
          </p>
          <p className="text-sm text-text-secondary dark:text-text-darkSecondary mb-3">
            Às {formatTimestampMs(active.target_ts_ms)}
          </p>
          <button className="btn-danger" onClick={cancelSchedule}>
            <Square size={16} />
            Cancelar agendamento
          </button>
        </div>
      )}

      {/* Seletor de modo */}
      <fieldset disabled={!!active} className="contents space-y-5">
      <div className="flex gap-2 p-1.5 rounded-xl bg-black/5 dark:bg-white/5" role="tablist">
        <button
          role="tab"
          aria-selected={mode === "timer"}
          className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            mode === "timer"
              ? "bg-white dark:bg-zinc-700 text-text-primary dark:text-text-darkPrimary shadow-fluent"
              : "text-text-secondary dark:text-text-darkSecondary bg-black/[0.06] dark:bg-white/[0.06] hover:bg-black/10 dark:hover:bg-white/10"
          }`}
          onClick={() => setMode("timer")}
        >
          Contagem regressiva
        </button>
        <button
          role="tab"
          aria-selected={mode === "at_time"}
          className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            mode === "at_time"
              ? "bg-white dark:bg-zinc-700 text-text-primary dark:text-text-darkPrimary shadow-fluent"
              : "text-text-secondary dark:text-text-darkSecondary bg-black/[0.06] dark:bg-white/[0.06] hover:bg-black/10 dark:hover:bg-white/10"
          }`}
          onClick={() => setMode("at_time")}
        >
          Horário fixo
        </button>
      </div>

      {/* Campos do modo */}
      {mode === "timer" ? (
        <div>
          <label htmlFor="sched-minutes" className="label">Executar em (minutos)</label>
          <div className="flex items-center gap-2 mt-2">
            <input
              id="sched-minutes"
              type="number"
              min={1}
              max={1440}
              value={minutes}
              onChange={(e) => setMinutes(sanitizeInt(e.target.value, 1, 1440))}
              className="input"
            />
            <div className="flex gap-1.5">
              {[5, 15, 30, 60].map((m) => (
                <button
                  key={m}
                  type="button"
                  className="px-3 py-2 text-sm rounded-lg bg-black/5 dark:bg-white/5 hover:bg-accent/10 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors font-medium"
                  onClick={() => setMinutes(m)}
                >
                  {m}min
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div>
          <label htmlFor="sched-time" className="label">Horário</label>
          <input
            id="sched-time"
            type="time"
            value={atTime}
            onChange={(e) => setAtTime(e.target.value)}
            className="input mt-2"
          />
        </div>
      )}

      {/* Ação */}
      <div>
        <label htmlFor="sched-action" className="label">Ação</label>
        <select
          id="sched-action"
          value={action}
          onChange={(e) => setAction(e.target.value as ActionKind)}
          className="input mt-2"
        >
          {ACTIONS.map((a) => (
            <option key={a.key} value={a.key}>
              {a.label}
            </option>
          ))}
        </select>
      </div>

      {/* Forçar (se aplicável) */}
      {selectedAction.supportsForce && (
        <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
          <input
            type="checkbox"
            checked={force}
            onChange={(e) => setForce(e.target.checked)}
            className="w-4 h-4 accent-danger"
          />
          <span className="text-sm font-medium">Forçar (mata processos teimosos)</span>
        </label>
      )}

      {/* Lembrete */}
      <div>
        <label htmlFor="sched-reminder" className="label">Lembrete (minutos antes)</label>
        <div className="flex items-center gap-3 mt-2">
          <input
            id="sched-reminder"
            type="number"
            min={0}
            max={120}
            value={reminder}
            onChange={(e) => setReminder(sanitizeInt(e.target.value, 0, 120))}
            className="input"
          />
          <span className="text-sm text-text-secondary dark:text-text-darkSecondary">
            0 = sem lembrete
          </span>
        </div>
      </div>
      </fieldset>

      {/* Ações */}
      <div className="flex gap-3 pt-2">
        {!active ? (
          <button
            type="button"
            className="btn-primary flex-1"
            disabled={!canSubmit}
            onClick={onStart}
          >
            <Play size={18} />
            Iniciar agendamento
          </button>
        ) : (
          <button type="button" className="btn-danger flex-1" onClick={cancelSchedule}>
            <Square size={18} />
            Cancelar agendamento
          </button>
        )}
      </div>
    </div>
  );
}
