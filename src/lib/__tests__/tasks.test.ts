import { describe, expect, it } from "vitest";
import { describeDays, describeTrigger, nextWeekly } from "../tasks";

describe("tasks", () => {
  it("describeDays", () => {
    expect(describeDays([0, 1, 2, 3, 4, 5, 6])).toBe("todos os dias");
    expect(describeDays([5, 1, 2, 3, 4])).toBe("dias úteis");
    expect(describeDays([1, 3])).toBe("Seg, Qua");
  });
  it("describeTrigger", () => {
    expect(describeTrigger({ weekly: { hh_mm: "23:00", days: [1, 2, 3, 4, 5] } })).toBe("dias úteis às 23:00");
    expect(describeTrigger({ idle: { minutes: 30 } })).toMatch(/30 min/);
  });
  it("nextWeekly espelha o backend", () => {
    // 2026-10-23 é sexta; dias úteis às 22:00 depois de sexta 23:30 → segunda 26
    const after = new Date(2026, 9, 23, 23, 30).getTime();
    expect(nextWeekly("22:00", [1, 2, 3, 4, 5], after)).toBe(new Date(2026, 9, 26, 22, 0).getTime());
    const sameDay = new Date(2026, 9, 19, 10, 0).getTime();
    expect(nextWeekly("23:00", [1], sameDay)).toBe(new Date(2026, 9, 19, 23, 0).getTime());
    expect(nextWeekly("23:00", [], sameDay)).toBeNull();
  });
});
