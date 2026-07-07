// Helpers de formatação de tempo.

export function formatSeconds(totalSeconds: number): string {
  const total = Math.floor(totalSeconds);
  if (total <= 0) return "0s";
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}min`);
  if (s > 0 && h === 0) parts.push(`${s}s`);
  return parts.join(" ") || "0s";
}

export function formatTimestampMs(ms: number): string {
  const date = new Date(ms);
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Retorna HH:MM arredondado para a próxima hora cheia. */
export function nextHour(): string {
  const now = new Date();
  const next = new Date(now.getTime() + 60 * 60 * 1000);
  next.setMinutes(0, 0, 0);
  return `${String(next.getHours()).padStart(2, "0")}:${String(
    next.getMinutes()
  ).padStart(2, "0")}`;
}

/** Sanitiza input numérico: garante inteiro >= min. */
export function sanitizeInt(value: string, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}
