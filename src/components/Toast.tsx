import { CheckCircle2, XCircle, Info, X } from "lucide-react";
import { useStore } from "@/store/useStore";

export default function ToastContainer() {
  const toasts = useStore((s) => s.toasts);
  const removeToast = useStore((s) => s.removeToast);

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm"
      aria-live="assertive"
      aria-relevant="additions"
    >
      {toasts.map((t) => {
        const Icon =
          t.type === "success"
            ? CheckCircle2
            : t.type === "error"
            ? XCircle
            : Info;
        const color =
          t.type === "success"
            ? "text-success"
            : t.type === "error"
            ? "text-danger"
            : "text-accent";
        const role = t.type === "error" ? "alert" : "status";

        return (
          <div
            key={t.id}
            role={role}
            className="flex items-start gap-3 p-4 rounded-xl
                       bg-white/95 dark:bg-zinc-800/95 backdrop-blur-xl
                       border border-stroke dark:border-stroke-dark
                       shadow-fluentLg animate-slide-up min-w-[280px] max-w-[calc(100vw-2rem)]"
          >
            <Icon size={20} className={`${color} mt-0.5 shrink-0`} />
            <p className="text-sm text-text-primary dark:text-text-darkPrimary flex-1">
              {t.message}
            </p>
            <button
              onClick={() => removeToast(t.id)}
              className="text-text-secondary hover:text-text-primary dark:hover:text-text-darkPrimary
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
              aria-label="Fechar notificação"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
