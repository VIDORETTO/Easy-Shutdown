import { AlarmClock } from "lucide-react";
import Modal from "./Modal";
import { getAction } from "@/lib/actions";
import { formatCountdown } from "@/lib/format";
import { useStore } from "@/store/useStore";

/**
 * Aviso em tela nos últimos segundos antes de uma tarefa executar.
 * Diferente da notificação, não é escondido pelo "Não incomodar".
 */
export default function FinalWarning() {
  const next = useStore((s) => s.next);
  const warningSeconds = useStore((s) => s.settings?.final_warning_seconds ?? 0);
  const deleteTask = useStore((s) => s.deleteTask);
  const skipTask = useStore((s) => s.skipTask);
  const snoozeTask = useStore((s) => s.snoozeTask);
  const setTaskEnabled = useStore((s) => s.setTaskEnabled);
  const runTaskNow = useStore((s) => s.runTaskNow);

  const open = !!next && warningSeconds > 0 && next.remaining_seconds <= warningSeconds;
  if (!open || !next) return null;

  const action = getAction(next.action);
  const Icon = action?.icon ?? AlarmClock;
  const isIdle = next.kind === "idle";
  const progress = Math.max(0, Math.min(1, next.remaining_seconds / warningSeconds));

  return (
    <Modal open labelledBy="fw-title" describedBy="fw-desc" zIndex="z-[60]">
      <div className="flex flex-col items-center text-center" role="alert">
        <div
          className={`w-16 h-16 rounded-2xl flex items-center justify-center bg-black/5 dark:bg-white/5 mb-4 ${action?.iconColor ?? ""}`}
        >
          <Icon size={32} />
        </div>
        <h3 id="fw-title" className="text-lg font-semibold text-text-primary dark:text-text-darkPrimary">
          {action?.label ?? next.action} em
        </h3>
        <p className="text-5xl font-bold font-mono tabular-nums text-accent my-2" aria-live="off">
          {formatCountdown(next.remaining_seconds)}
        </p>
        <p id="fw-desc" className="text-sm text-text-secondary dark:text-text-darkSecondary mb-4">
          {isIdle
            ? "O PC está sem uso. Mexa o mouse ou aperte uma tecla para cancelar."
            : "Tarefa agendada. Salve seu trabalho ou adie."}
        </p>
        <div className="w-full h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden mb-6">
          <div className="h-full bg-accent transition-[width] duration-1000 ease-linear" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>

      <div className="flex gap-2 justify-center flex-wrap">
        {isIdle ? (
          <button type="button" className="btn-ghost" onClick={() => setTaskEnabled(next.task_id, false)} data-autofocus>
            Pausar esta tarefa
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => (next.recurring ? skipTask(next.task_id) : deleteTask(next.task_id))}
              data-autofocus
            >
              {next.recurring ? "Pular desta vez" : "Cancelar"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => snoozeTask(next.task_id, 10)}>
              Adiar 10 min
            </button>
          </>
        )}
        <button
          type="button"
          className={action?.destructive ? "btn-danger" : "btn-primary"}
          onClick={() => runTaskNow(next.task_id)}
        >
          Executar agora
        </button>
      </div>
    </Modal>
  );
}
