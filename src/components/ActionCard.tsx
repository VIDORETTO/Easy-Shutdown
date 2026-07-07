import type { LucideIcon } from "lucide-react";
import type { ActionMeta } from "@/lib/actions";
import HelpTooltip from "./HelpTooltip";

interface Props {
  action: ActionMeta;
  disabled?: boolean;
  badge?: string;
  onExecute: () => void;
}

export default function ActionCard({ action, disabled, badge, onExecute }: Props) {
  const Icon: LucideIcon = action.icon;

  return (
    <div
      className={`card min-h-[168px] ${action.accentClass} ${disabled ? "opacity-50 pointer-events-none" : ""}`}
      onClick={disabled ? undefined : onExecute}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label={action.label}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onExecute();
        }
      }}
    >
      <div className="flex items-start justify-between mb-4">
        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center bg-black/5 dark:bg-white/5 ${action.iconColor}`}
        >
          <Icon size={24} />
        </div>
        <HelpTooltip action={action} />
      </div>

      <div className="flex items-center gap-2 mb-1.5">
        <h3 className="text-lg font-semibold text-text-primary dark:text-text-darkPrimary leading-snug overflow-visible">
          {action.label}
        </h3>
        {badge && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-warning/20 text-warning font-semibold uppercase tracking-wide">
            {badge}
          </span>
        )}
      </div>

      <p className="text-sm text-text-secondary dark:text-text-darkSecondary mb-4 leading-snug">
        {action.shortDesc}
      </p>

      <button
        type="button"
        className="btn-ghost w-full text-sm hover:bg-accent/10 hover:text-accent font-medium"
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation();
          onExecute();
        }}
      >
        Executar →
      </button>
    </div>
  );
}
