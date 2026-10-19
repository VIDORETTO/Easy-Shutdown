import { describe, expect, it } from "vitest";
import { captureFromEvent, keyFromCode, normalizeCombo, validateCombo, type Combo } from "../hotkeys";

const ev = (code: string, mods: Partial<Record<"ctrlKey" | "altKey" | "shiftKey" | "metaKey", boolean>> = {}) => ({
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  repeat: false,
  ...mods,
});

const combo = (key: string, m: Partial<Combo> = {}): Combo => ({ ctrl: false, alt: false, shift: false, win: false, key, ...m });

describe("keyFromCode", () => {
  it("usa a tecla física, não o caractere do layout", () => {
    expect(keyFromCode("KeyQ")).toBe("Q");
    expect(keyFromCode("Digit5")).toBe("5");
    expect(keyFromCode("Numpad3")).toBe("Num3");
    expect(keyFromCode("F12")).toBe("F12");
    expect(keyFromCode("ArrowUp")).toBe("Up");
    expect(keyFromCode("Semicolon")).toBeNull();
    expect(keyFromCode("IntlRo")).toBeNull();
  });
});

describe("validateCombo", () => {
  it("recusa combinações perigosas", () => {
    expect(validateCombo(combo("A", { shift: true }))).not.toBeNull();
    expect(validateCombo(combo("C", { ctrl: true }))).not.toBeNull();
    expect(validateCombo(combo("F4", { alt: true }))).not.toBeNull();
    expect(validateCombo(combo("D", { ctrl: true, alt: true }))).toMatch(/AltGr/);
    expect(validateCombo(combo("Esc", { ctrl: true, shift: true }))).not.toBeNull();
  });
  it("aceita combinações seguras", () => {
    expect(validateCombo(combo("F9", { ctrl: true, alt: true }))).toBeNull();
    expect(validateCombo(combo("K", { ctrl: true, shift: true }))).toBeNull();
    expect(validateCombo(combo("D", { win: true, alt: true }))).toBeNull();
  });
});

describe("captureFromEvent", () => {
  it("Esc sozinho cancela, modificador sozinho espera", () => {
    expect(captureFromEvent(ev("Escape")).kind).toBe("cancel");
    expect(captureFromEvent(ev("ControlLeft", { ctrlKey: true })).kind).toBe("incomplete");
  });
  it("AltGr+Q (Ctrl+Alt+Q) vira erro com explicação", () => {
    const r = captureFromEvent(ev("KeyQ", { ctrlKey: true, altKey: true }));
    expect(r.kind).toBe("error");
  });
  it("monta a combinação canônica", () => {
    expect(captureFromEvent(ev("F9", { ctrlKey: true, altKey: true }))).toEqual({ kind: "ok", combo: "Ctrl+Alt+F9" });
  });
});

describe("normalizeCombo", () => {
  it("independe da ordem e da caixa", () => {
    expect(normalizeCombo("alt+ctrl+f9")).toBe("Ctrl+Alt+F9");
    expect(normalizeCombo("Shift+Ctrl+k")).toBe("Ctrl+Shift+K");
  });
});
