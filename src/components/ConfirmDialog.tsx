import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import Modal from "./Modal";
import { getAction } from "@/lib/actions";
import { useStore } from "@/store/useStore";

const SOURCE_TEXT = {
  app: "Confirme a ação",
  tray: "Pedido pela bandeja do sistema",
  hotkey: "Pedido por atalho de teclado",
  task: "Confirme a ação",
} as const;

export default function ConfirmDialog() {
  const request = useStore((s) => s.confirmRequest);
  const closeConfirm = useStore((s) => s.closeConfirm);
  const executeAction = useStore((s) => s.executeAction);
  const [force, setForce] = useState(false);
  const [loading, setLoading] = useState(false);
  const action = request ? getAction(request.action) : null;

  useEffect(() => {
    setForce(false);
    setLoading(false);
  }, [request]);

  const dismiss = () => {
    if (!loading) closeConfirm();
  };

  const onConfirm = async () => {
    if (!action || loading) return;
    setLoading(true);
    const ok = await executeAction(action.key, force);
    setLoading(false);
    if (ok) closeConfirm();
  };

  if (!action || !request) return null;
  const Icon = action.icon;

  return (
    <Modal open labelledBy="confirm-title" describedBy="confirm-desc" onDismiss={dismiss}>
      <div className="flex items-center gap-4 mb-5">
        <div
          className={`w-14 h-14 rounded-xl flex items-center justify-center bg-black/5 dark:bg-white/5 ${action.iconColor}`}
        >
          <Icon size={28} />
        </div>
        <div>
          <h3 id="confirm-title" className="text-xl font-bold text-text-primary dark:text-text-darkPrimary">
            {action.label}
          </h3>
          <p className="text-sm text-text-secondary dark:text-text-darkSecondary mt-0.5">
            {SOURCE_TEXT[request.source]}
          </p>
        </div>
      </div>

      <p id="confirm-desc" className="text-sm text-text-secondary dark:text-text-darkSecondary mb-5 leading-relaxed">
        {action.helpText}
      </p>

      {action.supportsForce && (
        <label className="flex items-start gap-3 p-4 rounded-xl bg-warning/10 mb-5 cursor-pointer">
          <input
            type="checkbox"
            checked={force}
            onChange={(e) => setForce(e.target.checked)}
            className="mt-1 w-4 h-4 accent-warning"
          />
          <div className="text-sm">
            <div className="flex items-center gap-1.5 font-semibold text-warning">
              <AlertTriangle size={15} />
              Forçar (fecha programas sem perguntar)
            </div>
            <p className="text-text-secondary dark:text-text-darkSecondary mt-1 leading-snug">
              Sem forçar, programas travados são fechados, mas um programa pedindo &quot;salvar?&quot; pode
              impedir a ação. Forçando, trabalho não salvo é perdido.
            </p>
          </div>
        </label>
      )}

      <div className="flex gap-3 justify-end">
        <button type="button" className="btn-ghost" onClick={dismiss} disabled={loading} data-autofocus>
          Cancelar
        </button>
        <button
          type="button"
          className={action.destructive ? "btn-danger" : "btn-primary"}
          onClick={onConfirm}
          disabled={loading}
        >
          {loading ? "Executando…" : action.label}
        </button>
      </div>
    </Modal>
  );
}
