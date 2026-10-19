import { describe, expect, it } from "vitest";
import { formatCountdown, formatSeconds, formatWhen, localDateTimeMs, nextFullHour } from "../format";

describe("format", () => {
  it("formatSeconds", () => {
    expect(formatSeconds(0)).toBe("0s");
    expect(formatSeconds(65)).toBe("1min 5s");
    expect(formatSeconds(3700)).toBe("1h 1min");
  });
  it("formatCountdown", () => {
    expect(formatCountdown(59)).toBe("0:59");
    expect(formatCountdown(3725)).toBe("1:02:05");
  });
  it("formatWhen diz hoje/amanhã", () => {
    const now = new Date(2026, 9, 19, 10, 0).getTime();
    expect(formatWhen(new Date(2026, 9, 19, 23, 0).getTime(), now)).toBe("hoje às 23:00");
    expect(formatWhen(new Date(2026, 9, 20, 7, 5).getTime(), now)).toBe("amanhã às 07:05");
    expect(formatWhen(new Date(2026, 9, 22, 7, 5).getTime(), now)).toMatch(/22\/10 às 07:05$/);
  });
  it("nextFullHour cruza a meia-noite", () => {
    expect(nextFullHour(new Date(2026, 9, 19, 23, 30))).toEqual({ date: "2026-10-20", time: "00:00" });
    expect(nextFullHour(new Date(2026, 9, 19, 9, 10))).toEqual({ date: "2026-10-19", time: "10:00" });
  });
  it("localDateTimeMs", () => {
    expect(localDateTimeMs("2026-10-19", "23:00")).toBe(new Date(2026, 9, 19, 23, 0).getTime());
    expect(Number.isNaN(localDateTimeMs("", "23:00"))).toBe(true);
  });
});
