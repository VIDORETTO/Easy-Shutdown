import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Keyboard, X } from "lucide-react";
import Toggle from "@/components/Toggle";
import { HOTKEY_TARGETS } from "@/lib/actions";
import { captureFromEvent, normalizeCombo } from "@/lib/hotkeys";
import { api } from "@/lib/invoke";
import { useStore } from "@/store/useStore";
import type { HotkeyTarget } from "@/types";

const labelOf = (t: HotkeyTarget) => HOTKEY_TARGETS.find((x) => x.key === t)?.label ?? t;

export default function Hotkeys() {
  const settings = useStore((s) => s.settings);
  const status = useStore((s) => s.hotkeyStatus);
  const updateSettings = useStore((s) => s.updateSettings);
  const addToast = useStore((s) => s.addToast);
  const tab = useStore((s) => s.tab);

  const [capturing, setCapturing] = useState<HotkeyTarget | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);

  // Sai da captura ao trocar de aba ou a janela perder o foco.
  useEffect(() => {
    if (tab !== "hotkeys") setCapturing(null);
  }, [tab]);
  useEffect(() => {
    const onBlur = () => setCapturing(null);
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, []);

  // Durante a captura os atalhos globais ficam desligados — senão apertar uma
  // combinação já registrada executaria a ação em vez de ser capturada.
  useEffect(() => {
    if (!capturing) return;
    setCaptureError(null);
    void api.hotkeysSuspend();
    return () => {
      void api.hotkeysResume();
    };
  }, [capturing]);

  useEffect(() => {
    if (!capturing || !settings) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const r = captureFromEvent(e);
      if (r.kind === "incomplete") return;
      if (r.kind === "cancel") {
        setCapturing(null);
        return;
      }
      if (r.kind === "error") {
        setCaptureError(r.message);
        return;
      }

      // Uma combinação pertence a uma só ação: tira de quem já usava.
      const next: Partial<Record<HotkeyTarget, string>> = {};
      let movedFrom: HotkeyTarget | null = null;
      for (const [k, v] of Object.entries(settings.hotkeys) as [HotkeyTarget, string][]) {
        if (k === capturing) continue;
        if (v && normalizeCombo(v) === r.combo) movedFrom = k;
        else if (v) next[k] = v;
      }
      next[capturing] = r.combo;
      const target = capturing;
      setCapturing(null);
      void updateSettings({ hotkeys: next }).then((ok) => {
        if (!ok) return;
        addToast(
          "success",
          movedFrom
            ? `${r.combo} agora é de "${labelOf(target)}" (removido de "${labelOf(movedFrom)}").`
            : `Atalho de "${labelOf(target)}": ${r.combo}`
        );
      });
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [capturing, settings, updateSettings, addToast]);

  if (!settings) return null;

  const clearHotkey = (target: HotkeyTarget) => {
    const next = { ...settings.hotkeys };
    delete next[target];
    void updateSettings({ hotkeys: next });
  };

  const hasAny = Object.values(settings.hotkeys).some(Boolean);

  return (
    <div className="page-scroll space-y-5">
      <div>
        <h2 className="text-xl font-bold text-text-primary dark:text-text-darkPrimary mb-1">Atalhos globais</h2>
        <p className="text-sm text-text-secondary dark:text-text-darkSecondary">
          Funcionam mesmo com o app na bandeja. Clique em &quot;Capturar&quot; e pressione a combinação. Se
          &quot;Sempre pedir confirmação&quot; estiver ligado, o atalho abre a confirmação antes de agir.
        </p>
      </div>

      <div className="flex items-center justify-between p-4 rounded-2xl bg-card dark:bg-card-dark border border-stroke dark:border-stroke-dark">
        <div>
          <p className="text-sm font-medium text-text-primary dark:text-text-darkPrimary">Atalhos ativados</p>
          <p className="text-xs text-text-secondary dark:text-text-darkSecondary">Desligue para pausar todos sem apagar</p>
        </div>
        <Toggle
          checked={settings.hotkeys_enabled}
          onChange={(v) => updateSettings({ hotkeys_enabled: v })}
          ariaLabel="Atalhos ativados"
        />
      </div>

      <ul className="space-y-2.5">
        {HOTKEY_TARGETS.map((t) => {
          const isCapturing = capturing === t.key;
          const keys = settings.hotkeys[t.key];
          const st = status.find((s) => s.target === t.key);
          const Icon = t.icon;

          return (
            <li
              key={t.key}
              className={`p-4 rounded-2xl bg-card dark:bg-card-dark border ${
                isCapturing ? "border-accent" : "border-stroke dark:border-stroke-dark"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center bg-black/5 dark:bg-white/5 ${t.iconColor}`}>
                    <Icon size={20} />
                  </div>
                  <span className="text-sm font-medium text-text-primary dark:text-text-darkPrimary">{t.label}</span>
                </div>

                {isCapturing ? (
                  <div className="flex items-center gap-2">
                    <div
                      className="px-4 py-2 rounded-lg bg-accent/20 text-accent text-sm font-mono flex items-center gap-2"
                      role="status"
                      aria-live="polite"
                    >
                      <Keyboard size={16} />
                      Pressione… (Esc cancela)
                    </div>
                    <button type="button" className="btn-ghost text-sm px-3 py-1.5" onClick={() => setCapturing(null)}>
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <kbd
                      className={`px-3 py-1.5 rounded-lg bg-black/5 dark:bg-white/5 text-sm font-mono min-w-[70px] text-center ${
                        keys ? "text-text-primary dark:text-text-darkPrimary" : "text-text-secondary dark:text-text-darkSecondary"
                      }`}
                    >
                      {keys || "—"}
                    </kbd>
                    {keys && (
                      <button
                        type="button"
                        className="btn-ghost text-xs px-2 py-1.5"
                        onClick={() => clearHotkey(t.key)}
                        aria-label={`Limpar atalho de ${t.label}`}
                      >
                        <X size={15} />
                      </button>
                    )}
                    <button type="button" className="btn-ghost text-sm px-3 py-1.5" onClick={() => setCapturing(t.key)}>
                      Capturar
                    </button>
                  </div>
                )}
              </div>

              {isCapturing && captureError && (
                <p className="mt-2 text-xs text-danger flex items-start gap-1.5" role="alert">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  {captureError}
                </p>
              )}
              {!isCapturing && keys && st && (
                <p
                  className={`mt-2 text-xs flex items-start gap-1.5 ${
                    st.registered ? "text-success" : "text-danger"
                  }`}
                >
                  {st.registered ? <CheckCircle2 size={14} className="shrink-0 mt-0.5" /> : <AlertCircle size={14} className="shrink-0 mt-0.5" />}
                  {st.registered ? "Ativo" : st.error ?? "Não registrado"}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex items-start justify-between gap-4 p-4 rounded-2xl bg-black/5 dark:bg-white/5">
        <p className="text-sm text-text-secondary dark:text-text-darkSecondary">
          💡 Boas opções: <kbd className="font-mono px-1 py-0.5 rounded bg-black/10 dark:bg-white/10">Ctrl+Alt+F9</kbd>,{" "}
          <kbd className="font-mono px-1 py-0.5 rounded bg-black/10 dark:bg-white/10">Ctrl+Shift+F12</kbd> ou combinações com Win.
          Ctrl+Alt+letra não é aceito porque equivale a AltGr (usado para digitar / ? ° €).
        </p>
        {hasAny && (
          <button type="button" className="btn-ghost text-xs px-3 py-1.5 shrink-0" onClick={() => updateSettings({ hotkeys: {} })}>
            Limpar todos
          </button>
        )}
      </div>
    </div>
  );
}
