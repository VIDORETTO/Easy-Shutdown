import { useState, useEffect, useRef } from "react";
import { AlertTriangle, type LucideIcon } from "lucide-react";
import type { ActionMeta } from "@/lib/actions";
import { useStore } from "@/store/useStore";
import { api } from "@/lib/invoke";

interface Props {
  action: ActionMeta | null;
  onClose: () => void;
}

export default function ConfirmDialog({ action, onClose }: Props) {
  const [force, setForce] = useState(false);
  const [loading, setLoading] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const addToast = useStore((s) => s.addToast);

  // Reset force quando a ação muda
  useEffect(() => {
    setForce(false);
    setLoading(false);
  }, [action]);

  // Focus no botão Cancelar ao abrir + Esc fecha
  useEffect(() => {
    if (action && cancelRef.current) {
      cancelRef.current.focus();
    }
  }, [action]);

  // Handler de teclado (Esc fecha, Tab trap)
  useEffect(() => {
    if (!action) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Tab") {
        // Trap simples: focus entre Cancel e Confirm
        const dialog = dialogRef.current;
        if (!dialog) return;
        const focusable = dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [action, onClose, loading]);

  if (!action) return null;

  const isDestructive = ["shutdown", "restart", "hibernate"].includes(
    action.key
  );

  const onConfirm = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await api.powerAction(action.key, force);
      addToast("success", `"${action.label}" executado.`);
      onClose();
    } catch (e) {
      addToast("error", `Erro: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  const Icon: LucideIcon = action.icon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 animate-fade-in"
      style={{ background: "rgba(0,0,0,0.4)" }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-desc"
      className="w-full max-w-md p-6 rounded-2xl bg-white dark:bg-zinc-800
                 border border-stroke dark:border-stroke-dark shadow-fluentLg animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-4 mb-5">
          <div
            className={`w-14 h-14 rounded-xl flex items-center justify-center bg-black/5 dark:bg-white/5 ${action.iconColor}`}
          >
            <Icon size={28} />
          </div>
          <div>
            <h3
              id="dialog-title"
              className="text-xl font-bold text-text-primary dark:text-text-darkPrimary"
            >
              {action.label}
            </h3>
            <p className="text-sm text-text-secondary dark:text-text-darkSecondary mt-0.5">
              Confirme a ação
            </p>
          </div>
        </div>

        <p
          id="dialog-desc"
          className="text-sm text-text-secondary dark:text-text-darkSecondary mb-5 leading-relaxed"
        >
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
                Forçar (mata processos teimosos)
              </div>
              <p className="text-text-secondary dark:text-text-darkSecondary mt-1 leading-snug">
                Ignora programas que pedem &quot;salvar antes de sair&quot;. Pode
                perder trabalho não salvo.
              </p>
            </div>
          </label>
        )}

        <div className="flex gap-3 justify-end">
          <button
            ref={cancelRef}
            type="button"
            className="btn-ghost"
            onClick={() => { if (!loading) onClose(); }}
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={isDestructive ? "btn-danger" : "btn-primary"}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Executando…" : action.label}
          </button>
        </div>
      </div>
    </div>
  );
}
