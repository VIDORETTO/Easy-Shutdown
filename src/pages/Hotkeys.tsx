import { useState, useEffect, useCallback, useRef } from "react";
import { Keyboard, X } from "lucide-react";
import { ACTIONS } from "@/lib/actions";
import { useStore } from "@/store/useStore";
import { api } from "@/lib/invoke";
import type { ActionKind } from "@/types";

const SPECIAL_KEYS: Record<string, string> = {
  " ": "Space",
  Spacebar: "Space",
  Enter: "Enter",
  Escape: "Escape",
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
};

export default function Hotkeys() {
  const settings = useStore((s) => s.settings);
  const saveSettings = useStore((s) => s.saveSettings);
  const addToast = useStore((s) => s.addToast);

  const [capturing, setCapturing] = useState<ActionKind | null>(null);
  const [hotkeys, setHotkeys] = useState<Partial<Record<ActionKind, string>>>({});

  // Refs síncronas para evitar stale closure em handlers async
  const hotkeysRef = useRef(hotkeys);
  const settingsRef = useRef(settings);
  useEffect(() => { hotkeysRef.current = hotkeys; }, [hotkeys]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  // Sincroniza com settings
  useEffect(() => {
    if (settings) setHotkeys({ ...settings.hotkeys });
  }, [settings]);

  // Captura teclas a nível de janela (não depende de focus num elemento)
  const handleCapture = useCallback(
    (e: KeyboardEvent) => {
      if (!capturing) return;
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        setCapturing(null);
        return;
      }
      if (e.repeat) return; // ignora auto-repeat

      const parts: string[] = [];
      if (e.ctrlKey) parts.push("Ctrl");
      if (e.altKey) parts.push("Alt");
      if (e.shiftKey) parts.push("Shift");
      if (e.metaKey) parts.push("Win");

      // Ignora se só tem modifier (precisa de pelo menos uma tecla normal)
      const isModifierOnly = ["Control", "Alt", "Shift", "Meta"].includes(e.key);
      if (isModifierOnly) return;

      // Normaliza a tecla
      let key = e.key;
      if (key.length === 1) {
        key = key.toUpperCase();
      } else if (SPECIAL_KEYS[key]) {
        key = SPECIAL_KEYS[key];
      }

      parts.push(key);
      if (parts.length < 2) return;

      const combo = parts.join("+");

      // Detecção de conflito com outra ação
      const conflict = Object.entries(hotkeysRef.current).find(
        ([act, keys]) => act !== capturing && keys === combo
      );

      const newHotkeys = { ...hotkeysRef.current, [capturing]: combo };
      setHotkeys(newHotkeys);
      hotkeysRef.current = newHotkeys; // atualiza ref imediatamente
      setCapturing(null);

      // Salva e registra
      (async () => {
        try {
          await saveSettings({ ...settingsRef.current!, hotkeys: newHotkeys });
          await api.registerHotkeys(newHotkeys);
          if (conflict) {
            addToast(
              "info",
              `"${combo}" agora é de "${ACTIONS.find((a) => a.key === capturing)?.label ?? capturing}". Conflita com "${ACTIONS.find((a) => a.key === conflict[0])?.label ?? conflict[0]}".`
            );
          } else {
            addToast("success", `Atalho definido: ${combo}`);
          }
        } catch (err) {
          // Reverte em caso de erro
          setHotkeys(hotkeysRef.current);
          addToast("error", `Falha ao salvar atalho: ${err}`);
        }
      })();
    },
    [capturing, hotkeys, settings, saveSettings, addToast]
  );

  useEffect(() => {
    if (!capturing) return;
    window.addEventListener("keydown", handleCapture, { capture: true });
    return () => window.removeEventListener("keydown", handleCapture, { capture: true });
  }, [capturing, handleCapture]);

  if (!settings) return null;

  const clearHotkey = async (action: ActionKind) => {
    const current = hotkeysRef.current;
    const newHotkeys = { ...current };
    delete newHotkeys[action];
    setHotkeys(newHotkeys);
    hotkeysRef.current = newHotkeys;
    try {
      await saveSettings({ ...settingsRef.current!, hotkeys: newHotkeys });
      await api.registerHotkeys(newHotkeys);
      addToast("info", "Atalho removido.");
    } catch (err) {
      setHotkeys(current);
      hotkeysRef.current = current;
      addToast("error", `Falha: ${err}`);
    }
  };

  return (
    <div className="page-scroll space-y-5">
      <div>
        <h2 className="text-xl font-bold text-text-primary dark:text-text-darkPrimary mb-1">
          Atalhos globais
        </h2>
        <p className="text-sm text-text-secondary dark:text-text-darkSecondary">
          Funcionam mesmo com o app em segundo plano. Clique em &quot;capturar&quot; e
          pressione a combinação desejada.
        </p>
      </div>

      <div className="space-y-2.5">
        {ACTIONS.map((action) => {
          const isCapturing = capturing === action.key;
          const keys = hotkeys[action.key];

          return (
            <div
              key={action.key}
              className="flex items-center justify-between p-4 rounded-2xl
                         bg-card dark:bg-card-dark border border-stroke dark:border-stroke-dark"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center bg-black/5 dark:bg-white/5 ${action.iconColor}`}
                >
                  <action.icon size={20} />
                </div>
                <span className="text-sm font-medium text-text-primary dark:text-text-darkPrimary">
                  {action.label}
                </span>
              </div>

              {isCapturing ? (
                <div
                  className="px-4 py-2 rounded-lg bg-accent/20 text-accent text-sm font-mono flex items-center gap-2"
                  role="status"
                  aria-live="polite"
                >
                  <Keyboard size={16} />
                  Pressione... (Esc cancela)
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {keys ? (
                    <>
                      <kbd className="px-3 py-1.5 rounded-lg bg-black/5 dark:bg-white/5 text-sm font-mono text-text-primary dark:text-text-darkPrimary min-w-[70px] text-center">
                        {keys}
                      </kbd>
                      <button
                        type="button"
                        className="btn-ghost text-xs px-2 py-1.5"
                        onClick={() => clearHotkey(action.key)}
                        aria-label={`Limpar atalho de ${action.label}`}
                      >
                        <X size={15} />
                      </button>
                    </>
                  ) : (
                    <kbd className="px-3 py-1.5 rounded-lg bg-black/5 dark:bg-white/5 text-sm font-mono text-text-secondary dark:text-text-darkSecondary min-w-[70px] text-center">
                      —
                    </kbd>
                  )}
                  <button
                    type="button"
                    className="btn-ghost text-sm px-3 py-1.5"
                    onClick={() => setCapturing(action.key)}
                  >
                    Capturar
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5">
        <p className="text-sm text-text-secondary dark:text-text-darkSecondary">
          💡 Dica: use combinações com <kbd className="font-mono px-1 py-0.5 rounded bg-black/10 dark:bg-white/10">Ctrl+Alt</kbd> para evitar
          conflitos com atalhos do sistema. A tecla Win costuma conflitar com o Windows.
        </p>
      </div>
    </div>
  );
}
