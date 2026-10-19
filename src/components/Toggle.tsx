interface Props {
  id?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  ariaLabel: string;
}

export default function Toggle({ id, checked, onChange, disabled, ariaLabel }: Props) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-12 h-7 shrink-0 rounded-full transition-colors disabled:opacity-50
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
        ${checked ? "bg-accent" : "bg-black/20 dark:bg-white/20"}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-5" : ""
        }`}
      />
    </button>
  );
}
