// Helpers de formatação de tempo e datas.

const pad = (n: number) => String(n).padStart(2, "0");

/** "1h 5min", "4min 10s", "9s". */
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

/** Relógio de contagem regressiva: "1:05:09" ou "4:09". */
export function formatCountdown(totalSeconds: number): string {
  const total = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function formatHHMM(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "hoje às 23:00", "amanhã às 07:00", "qua., 21/10 às 07:00". */
export function formatWhen(ms: number, now: number = Date.now()): string {
  const date = new Date(ms);
  const days = Math.round((startOfDay(date) - startOfDay(new Date(now))) / 86_400_000);
  const time = formatHHMM(date);
  if (days === 0) return `hoje às ${time}`;
  if (days === 1) return `amanhã às ${time}`;
  if (days === -1) return `ontem às ${time}`;
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  const day = date.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  return `${day} às ${time}`;
}

/** "19/10 23:00" — para o histórico. */
export function formatDateTime(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${formatHHMM(d)}`;
}

/** Data local no formato do <input type="date"> (YYYY-MM-DD). */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Próxima hora cheia (data e HH:MM), avançando a data se cruzar a meia-noite. */
export function nextFullHour(now: Date = new Date()): { date: string; time: string } {
  const next = new Date(now.getTime() + 60 * 60 * 1000);
  next.setMinutes(0, 0, 0);
  return { date: toISODate(next), time: formatHHMM(next) };
}

/** Converte data (YYYY-MM-DD) + HH:MM locais em ms. NaN se inválido. */
export function localDateTimeMs(date: string, time: string): number {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  if ([y, mo, d, h, mi].some((n) => !Number.isFinite(n))) return NaN;
  return new Date(y, mo - 1, d, h, mi, 0, 0).getTime();
}

/** Garante inteiro dentro de [min, max]. */
export function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}
