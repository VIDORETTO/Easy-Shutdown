import { useEffect, useState } from "react";
import { clampInt } from "@/lib/format";

interface Props {
  id: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  className?: string;
  ariaLabel?: string;
}

/**
 * Campo numérico que deixa o usuário digitar livremente (inclusive apagar tudo)
 * e só ajusta ao intervalo quando o campo perde o foco.
 */
export default function NumberField({ id, value, min, max, onChange, className, ariaLabel }: Props) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText((t) => (Number(t) === value && t !== "" ? t : String(value)));
  }, [value]);

  return (
    <input
      id={id}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={text}
      aria-label={ariaLabel}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== "" && Number.isInteger(n) && n >= min && n <= max) onChange(n);
      }}
      onBlur={() => {
        const n = text === "" ? min : clampInt(Number(text), min, max);
        setText(String(n));
        if (n !== value) onChange(n);
      }}
      className={`input ${className ?? ""}`}
    />
  );
}
