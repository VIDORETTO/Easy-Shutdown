// Captura e validação de atalhos. Espelha as regras de src-tauri/src/hotkey_rules.rs
// (o backend é a fonte da verdade; aqui serve para feedback imediato na UI).

export interface Combo {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  win: boolean;
  /** Tecla para exibição: "A", "5", "F9", "Num5", "Space", "Up"... */
  key: string;
}

const NAMED: Record<string, string> = {
  Space: "Space",
  Enter: "Enter",
  NumpadEnter: "Enter",
  Tab: "Tab",
  Home: "Home",
  End: "End",
  Delete: "Delete",
  Insert: "Insert",
  PageUp: "PageUp",
  PageDown: "PageDown",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Escape: "Esc",
};

const MODIFIER_CODES = new Set([
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "ShiftLeft",
  "ShiftRight",
  "MetaLeft",
  "MetaRight",
  "OSLeft",
  "OSRight",
]);

/**
 * Converte `KeyboardEvent.code` (tecla física) em nome de tecla.
 * Usar `code` em vez de `key` evita caracteres de layout (ç, /, AltGr) que o backend não aceita.
 */
export function keyFromCode(code: string): string | null {
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1];
  m = /^Digit([0-9])$/.exec(code);
  if (m) return m[1];
  m = /^Numpad([0-9])$/.exec(code);
  if (m) return `Num${m[1]}`;
  m = /^F([0-9]{1,2})$/.exec(code);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 24) return `F${m[1]}`;
  return NAMED[code] ?? null;
}

const PRINTABLE = /^([A-Z0-9]|Space)$/;

export function validateCombo(c: Combo): string | null {
  if (!(c.ctrl || c.alt || c.win)) return "Use pelo menos Ctrl, Alt ou Win.";
  const count = [c.ctrl, c.alt, c.shift].filter(Boolean).length;
  if (!c.win && count < 2) {
    return "Combine dois modificadores (ex.: Ctrl+Shift) ou use Win — com um só modificador o atalho rouba teclas de outros programas.";
  }
  if (c.ctrl && c.alt && !c.win && PRINTABLE.test(c.key)) {
    return "Ctrl+Alt+letra/número equivale a AltGr e dispararia ao digitar caracteres como / ? ° €. Use F1–F12, setas ou inclua Win.";
  }
  const reserved =
    (c.alt && !c.ctrl && !c.win && ["Tab", "Esc", "F4"].includes(c.key)) ||
    (c.ctrl && c.shift && !c.alt && c.key === "Esc") ||
    (c.ctrl && c.alt && ["Delete", "Tab"].includes(c.key));
  if (reserved) return "Essa combinação é reservada pelo Windows.";
  return null;
}

export function formatCombo(c: Combo): string {
  const parts: string[] = [];
  if (c.ctrl) parts.push("Ctrl");
  if (c.alt) parts.push("Alt");
  if (c.shift) parts.push("Shift");
  if (c.win) parts.push("Win");
  parts.push(c.key);
  return parts.join("+");
}

/** Normaliza uma string salva ("alt+ctrl+f9" → "Ctrl+Alt+F9") para comparação. */
export function normalizeCombo(s: string): string {
  const c: Combo = { ctrl: false, alt: false, shift: false, win: false, key: "" };
  for (const raw of s.split("+")) {
    const p = raw.trim().toLowerCase();
    if (p === "ctrl" || p === "control") c.ctrl = true;
    else if (p === "alt") c.alt = true;
    else if (p === "shift") c.shift = true;
    else if (["win", "super", "meta", "cmd"].includes(p)) c.win = true;
    else c.key = p.length === 1 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1);
  }
  c.key = c.key.replace(/^Numpad/, "Num").replace(/^Pageup$/, "PageUp").replace(/^Pagedown$/, "PageDown");
  if (/^F\d+$/i.test(c.key)) c.key = c.key.toUpperCase();
  return formatCombo(c);
}

export type CaptureResult =
  | { kind: "cancel" }
  | { kind: "incomplete" }
  | { kind: "error"; message: string }
  | { kind: "ok"; combo: string };

type KeyLike = Pick<KeyboardEvent, "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey" | "repeat">;

export function captureFromEvent(e: KeyLike): CaptureResult {
  const hasMods = e.ctrlKey || e.altKey || e.shiftKey || e.metaKey;
  if (e.code === "Escape" && !hasMods) return { kind: "cancel" };
  if (e.repeat || MODIFIER_CODES.has(e.code)) return { kind: "incomplete" };
  const key = keyFromCode(e.code);
  if (!key) return { kind: "error", message: "Tecla não suportada. Use letras, números, F1–F24, setas ou teclas de navegação." };
  const combo: Combo = { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, win: e.metaKey, key };
  const err = validateCombo(combo);
  if (err) return { kind: "error", message: `${formatCombo(combo)}: ${err}` };
  return { kind: "ok", combo: formatCombo(combo) };
}
