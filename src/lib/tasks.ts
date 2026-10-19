// Helpers de exibição para tarefas agendadas.

import type { Task, Trigger } from "@/types";

/** 0 = domingo … 6 = sábado (mesma convenção do backend). */
export const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
export const WORK_DAYS = [1, 2, 3, 4, 5];

export function describeDays(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  const key = sorted.join(",");
  if (key === ALL_DAYS.join(",")) return "todos os dias";
  if (key === WORK_DAYS.join(",")) return "dias úteis";
  if (key === "0,6") return "fins de semana";
  return sorted.map((d) => WEEKDAYS[d]).join(", ");
}

export function describeTrigger(trigger: Trigger): string {
  if ("once" in trigger) return "Uma vez";
  if ("weekly" in trigger) {
    return `${describeDays(trigger.weekly.days)} às ${trigger.weekly.hh_mm}`;
  }
  return `após ${trigger.idle.minutes} min sem uso do teclado/mouse`;
}

export function isRecurring(task: Pick<Task, "trigger">): boolean {
  return !("once" in task.trigger);
}

export function isIdle(task: Pick<Task, "trigger">): boolean {
  return "idle" in task.trigger;
}

/** Próxima ocorrência semanal estritamente depois de `after` (espelha trigger.rs). */
export function nextWeekly(hhmm: string, days: number[], after: number = Date.now()): number | null {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m) || days.length === 0) return null;
  const base = new Date(after);
  for (let offset = 0; offset <= 7; offset++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset, h, m, 0, 0);
    if (days.includes(d.getDay()) && d.getTime() > after) return d.getTime();
  }
  return null;
}
