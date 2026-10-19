import { memo, useCallback } from "react";
import { Clock, Coffee, Hourglass, X } from "lucide-react";
import ActionCard from "@/components/ActionCard";
import { ACTIONS, HIBERNATE_DISABLED_HELP, getActionLabel, type ActionMeta } from "@/lib/actions";
import { formatSeconds, formatWhen } from "@/lib/format";
import { useStore } from "@/store/useStore";

function NextTaskBanner() {
  const next = useStore((s) => s.next);
  const task = useStore((s) => s.tasks.find((t) => t.id === s.next?.task_id));
  const deleteTask = useStore((s) => s.deleteTask);
  const skipTask = useStore((s) => s.skipTask);
  const snoozeTask = useStore((s) => s.snoozeTask);
  const setTaskEnabled = useStore((s) => s.setTaskEnabled);
  const pendingCount = useStore((s) => s.tasks.filter((t) => t.enabled).length);

  if (!next) return null;
  const isIdle = next.kind === "idle";

  return (
    <div className="mb-5 p-5 rounded-fluentLg bg-accent/10 border border-accent/30 animate-fade-in">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-12 h-12 shrink-0 rounded-xl bg-accent/15 flex items-center justify-center">
            {isIdle ? <Hourglass size={24} className="text-accent" /> : <Clock size={24} className="text-accent" />}
          </div>
          <div className="min-w-0">
            <p className="text-base font-semibold text-text-primary dark:text-text-darkPrimary">
              {getActionLabel(next.action)}{" "}
              {isIdle ? "por inatividade em " : "em "}
              <span className="text-accent font-mono tabular-nums">{formatSeconds(next.remaining_seconds)}</span>
            </p>
            <p className="text-sm text-text-secondary dark:text-text-darkSecondary mt-0.5">
              {isIdle ? "Reinicia a contagem quando você usa o PC" : formatWhen(next.target_ts_ms)}
              {next.recurring && !isIdle && " · recorrente"}
              {task?.force && " · forçado"}
              {pendingCount > 1 && ` · ${pendingCount} tarefas ativas`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!isIdle && (
            <button type="button" className="btn-ghost px-3" onClick={() => snoozeTask(next.task_id, 15)}>
              +15 min
            </button>
          )}
          <button
            type="button"
            className="btn-ghost px-3 text-danger hover:bg-danger/10"
            onClick={() =>
              isIdle
                ? setTaskEnabled(next.task_id, false)
                : next.recurring
                ? skipTask(next.task_id)
                : deleteTask(next.task_id)
            }
          >
            <X size={16} />
            {isIdle ? "Pausar" : next.recurring ? "Pular" : "Cancelar"}
          </button>
        </div>
      </div>
    </div>
  );
}

const MemoizedActionCard = memo(ActionCard);

export default function Home() {
  const hibernateAvailable = useStore((s) => s.hibernateAvailable);
  const requestAction = useStore((s) => s.requestAction);
  const keepAwake = useStore((s) => s.keepAwake);
  const setKeepAwake = useStore((s) => s.setKeepAwake);

  const onExecute = useCallback((a: ActionMeta) => requestAction(a.key), [requestAction]);

  return (
    <div className="page-scroll">
      <NextTaskBanner />

      <div className="grid grid-cols-2 min-[900px]:grid-cols-3 gap-4">
        {ACTIONS.map((action) => {
          const unavailable = action.key === "hibernate" && !hibernateAvailable;
          return (
            <MemoizedActionCard
              key={action.key}
              action={action}
              badge={unavailable ? "indisponível" : undefined}
              note={unavailable ? HIBERNATE_DISABLED_HELP : undefined}
              disabled={unavailable}
              onExecute={onExecute}
            />
          );
        })}
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={keepAwake}
        onClick={() => setKeepAwake(!keepAwake)}
        className={`mt-5 w-full flex items-center gap-3 p-4 rounded-2xl border text-left transition-colors
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
          ${
            keepAwake
              ? "bg-warning/10 border-warning/40"
              : "bg-card dark:bg-card-dark border-stroke dark:border-stroke-dark hover:bg-card-hover dark:hover:bg-card-darkHover"
          }`}
      >
        <Coffee size={20} className={keepAwake ? "text-warning" : "text-text-secondary dark:text-text-darkSecondary"} />
        <span className="flex-1">
          <span className="block text-sm font-medium text-text-primary dark:text-text-darkPrimary">
            Manter PC acordado {keepAwake ? "(ligado)" : ""}
          </span>
          <span className="block text-xs text-text-secondary dark:text-text-darkSecondary">
            Impede a suspensão automática do Windows até você desligar esta opção.
          </span>
        </span>
      </button>
    </div>
  );
}
