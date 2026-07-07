import { useState, useEffect, memo } from "react";
import { Clock, X } from "lucide-react";
import ActionCard from "@/components/ActionCard";
import ConfirmDialog from "@/components/ConfirmDialog";
import { ACTIONS, getActionLabel } from "@/lib/actions";
import { formatSeconds, formatTimestampMs } from "@/lib/format";
import { useStore } from "@/store/useStore";
import { api } from "@/lib/invoke";
import type { ActionMeta } from "@/lib/actions";
import type { ActiveSchedule } from "@/types";

// Banner extraído — tem seu próprio interval, não re-renderiza os cards
function ActiveScheduleBanner({ schedule }: { schedule: ActiveSchedule }) {
  const cancelSchedule = useStore((s) => s.cancelSchedule);
  const [remaining, setRemaining] = useState(
    Math.max(0, Math.floor((schedule.target_ts_ms - Date.now()) / 1000))
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(
        Math.max(0, Math.floor((schedule.target_ts_ms - Date.now()) / 1000))
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [schedule.target_ts_ms]);

  return (
    <div className="mb-5 p-5 rounded-fluentLg bg-accent/10 border border-accent/30 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-accent/15 flex items-center justify-center">
            <Clock size={24} className="text-accent" />
          </div>
          <div>
            <p className="text-base font-semibold text-text-primary dark:text-text-darkPrimary">
              {getActionLabel(schedule.action)} em{" "}
              <span className="text-accent font-mono tabular-nums">
                {formatSeconds(remaining)}
              </span>
            </p>
            <p className="text-sm text-text-secondary dark:text-text-darkSecondary mt-0.5">
              Às {formatTimestampMs(schedule.target_ts_ms)} ·{" "}
              {schedule.force ? "modo forçado" : "modo normal"}
              {schedule.reminder_minutes > 0 &&
                ` · lembrete ${schedule.reminder_minutes}min antes`}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="btn-ghost text-danger hover:bg-danger/10"
          onClick={() => cancelSchedule()}
        >
          <X size={16} />
          Cancelar
        </button>
      </div>
    </div>
  );
}

const MemoizedActionCard = memo(ActionCard);

export default function Home() {
  const [confirmAction, setConfirmAction] = useState<ActionMeta | null>(null);
  const activeSchedule = useStore((s) => s.activeSchedule);
  const hibernateStatus = useStore((s) => s.hibernateStatus);
  const trayActionRequest = useStore((s) => s.trayActionRequest);
  const clearTrayRequest = useStore((s) => s.clearTrayRequest);
  const addToast = useStore((s) => s.addToast);
  const confirmBeforeAction = useStore(
    (s) => s.settings?.confirm_before_action ?? true
  );

  // Tray request: só auto-abre dialog se nenhum estiver aberto
  useEffect(() => {
    if (trayActionRequest && !confirmAction) {
      const meta = ACTIONS.find((a) => a.key === trayActionRequest);
      if (meta) {
        setConfirmAction(meta);
      } else {
        // Action desconhecida — limpa request
        clearTrayRequest();
      }
    }
  }, [trayActionRequest, confirmAction, clearTrayRequest]);

  const handleExecute = async (action: ActionMeta) => {
    if (confirmBeforeAction) {
      setConfirmAction(action);
    } else {
      try {
        await api.powerAction(action.key, false);
        addToast("success", `"${action.label}" executado.`);
      } catch (e) {
        addToast("error", `Erro: ${e}`);
      }
    }
  };

  return (
    <div className="page-scroll">
      {activeSchedule && <ActiveScheduleBanner schedule={activeSchedule} />}

      <div className="grid grid-cols-2 gap-4">
        {ACTIONS.map((action) => (
          <MemoizedActionCard
            key={action.key}
            action={action}
            badge={
              action.key === "hibernate" && hibernateStatus === "indisponível"
                ? "indisponível"
                : undefined
            }
            disabled={
              action.key === "hibernate" && hibernateStatus === "indisponível"
            }
            onExecute={() => handleExecute(action)}
          />
        ))}
      </div>

      <ConfirmDialog
        action={confirmAction}
        onClose={() => {
          setConfirmAction(null);
          if (trayActionRequest) clearTrayRequest();
        }}
      />
    </div>
  );
}
