import { useEffect, useRef, useState } from "react";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";
import { useStore, type Toast } from "@/store/useStore";

const DURATION: Record<Toast["type"], number> = { success: 4000, info: 4000, error: 8000 };

function ToastItem({ toast }: { toast: Toast }) {
  const removeToast = useStore((s) => s.removeToast);
  const [paused, setPaused] = useState(false);
  const remaining = useRef(DURATION[toast.type]);
  const startedAt = useRef(Date.now());

  // Some sozinho, mas pausa enquanto o mouse está em cima (dá tempo de ler/copiar).
  useEffect(() => {
    if (paused) return;
    startedAt.current = Date.now();
    const timer = setTimeout(() => removeToast(toast.id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - startedAt.current;
    };
  }, [paused, toast.id, removeToast]);

  const Icon = toast.type === "success" ? CheckCircle2 : toast.type === "error" ? XCircle : Info;
  const color =
    toast.type === "success" ? "text-success" : toast.type === "error" ? "text-danger" : "text-accent";

  return (
    <div
      role={toast.type === "error" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="flex items-start gap-3 p-4 rounded-xl
                 bg-white/95 dark:bg-zinc-800/95 backdrop-blur-xl
                 border border-stroke dark:border-stroke-dark
                 shadow-fluentLg animate-slide-up min-w-[280px] max-w-[calc(100vw-2rem)]"
    >
      <Icon size={20} className={`${color} mt-0.5 shrink-0`} />
      <p className="text-sm text-text-primary dark:text-text-darkPrimary flex-1 select-text break-words">
        {toast.message}
      </p>
      <button
        type="button"
        onClick={() => removeToast(toast.id)}
        className="text-text-secondary hover:text-text-primary dark:hover:text-text-darkPrimary
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
        aria-label="Fechar notificação"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="fixed bottom-4 right-4 z-[70] flex flex-col gap-2 max-w-sm" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
