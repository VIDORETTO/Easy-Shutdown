import type { ActionMeta } from "@/lib/actions";
import HelpTooltip from "./HelpTooltip";

interface Props {
  action: ActionMeta;
  disabled?: boolean;
  badge?: string;
  /** Explicação extra no "?" (ex.: por que está indisponível). */
  note?: string;
  onExecute: (action: ActionMeta) => void;
}

// O card inteiro é um <button>; a ajuda fica fora dele (sem elementos interativos
// aninhados — Enter/Espaço no "?" nunca disparam a ação).
export default function ActionCard({ action, disabled, badge, note, onExecute }: Props) {
  const Icon = action.icon;

  return (
    <div className={`card-shell ${action.accentClass} ${disabled ? "opacity-60" : ""}`}>
      <button
        type="button"
        className="card-button group"
        disabled={disabled}
        onClick={() => onExecute(action)}
        aria-describedby={`desc-${action.key}`}
      >
        <div
          className={`w-12 h-12 mb-4 rounded-xl flex items-center justify-center bg-black/5 dark:bg-white/5 ${action.iconColor}`}
        >
          <Icon size={24} />
        </div>

        <div className="flex items-center gap-2 mb-1.5 pr-8">
          <span className="text-lg font-semibold text-text-primary dark:text-text-darkPrimary leading-snug">
            {action.label}
          </span>
          {badge && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-warning/20 text-warning font-semibold uppercase tracking-wide">
              {badge}
            </span>
          )}
        </div>

        <span
          id={`desc-${action.key}`}
          className="block text-sm text-text-secondary dark:text-text-darkSecondary mb-4 leading-snug"
        >
          {action.shortDesc}
        </span>

        <span className="block w-full text-center text-sm font-medium py-2 rounded-fluent text-accent bg-accent/0 group-hover:bg-accent/10">
          {disabled ? "Indisponível" : "Executar →"}
        </span>
      </button>

      <div className="absolute top-4 right-4">
        <HelpTooltip action={action} note={note} />
      </div>
    </div>
  );
}
