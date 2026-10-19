import { useState, useRef, useEffect } from "react";
import { HelpCircle } from "lucide-react";
import type { ActionMeta } from "@/lib/actions";

interface Props {
  action: ActionMeta;
  note?: string;
}

export default function HelpTooltip({ action, note }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const tipId = `help-${action.key}`;

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Ajuda: ${action.label}`}
        aria-expanded={open}
        aria-controls={open ? tipId : undefined}
        className="w-7 h-7 rounded-full flex items-center justify-center
                   text-text-secondary dark:text-text-darkSecondary
                   hover:bg-black/5 dark:hover:bg-white/10
                   hover:text-accent transition-colors
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <HelpCircle size={18} />
      </button>

      {open && (
        <div
          id={tipId}
          role="tooltip"
          className="absolute right-0 top-9 z-40 w-80 p-4 rounded-fluentLg select-text
                     bg-white/95 dark:bg-zinc-800/95 backdrop-blur-xl
                     border border-stroke dark:border-stroke-dark
                     shadow-fluentLg animate-scale-in"
        >
          <h4 className="text-sm font-semibold mb-2 text-text-primary dark:text-text-darkPrimary">
            {action.helpTitle}
          </h4>
          <p className="text-sm leading-relaxed text-text-secondary dark:text-text-darkSecondary mb-2">
            {action.helpText}
          </p>
          {action.helpCompare && (
            <p className="text-sm leading-relaxed text-text-secondary dark:text-text-darkSecondary border-t border-stroke dark:border-stroke-dark pt-2 mt-2">
              {action.helpCompare}
            </p>
          )}
          {note && (
            <p className="text-sm leading-relaxed text-warning border-t border-stroke dark:border-stroke-dark pt-2 mt-2">
              {note}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
