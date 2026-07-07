import { useEffect, useState, useRef } from "react";
import { Power, Bell } from "lucide-react";
import { useStore } from "@/store/useStore";
import { api } from "@/lib/invoke";
import { sanitizeInt } from "@/lib/format";
import type { ThemeMode } from "@/types";

export default function Settings() {
  const settings = useStore((s) => s.settings);
  const saveSettings = useStore((s) => s.saveSettings);
  const addToast = useStore((s) => s.addToast);
  const [autostartEnabled, setAutostartEnabled] = useState(false);
  const [autostartLoading, setAutostartLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  // Local state para input numérico (não sofre com debounce race)
  const [reminderInput, setReminderInput] = useState(
    settings?.default_reminder_minutes ?? 1
  );
  useEffect(() => {
    setReminderInput(settings?.default_reminder_minutes ?? 1);
  }, [settings?.default_reminder_minutes]);

  useEffect(() => {
    api.isAutostartEnabled().then(setAutostartEnabled).catch(() => {}).finally(() => setAutostartLoading(false));
  }, []);

  if (!settings) return null;

  // Usa settingsRef para evitar stale closure no debounce
  const update = async (patch: Partial<typeof settings>) => {
    try {
      const next = { ...settingsRef.current!, ...patch };
      await saveSettings(next);
      settingsRef.current = next;
    } catch {
      // saveSettings já mostra toast
    }
  };

  const updateDebounced = (patch: Partial<typeof settings>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => update(patch), 500);
  };

  const toggleAutostart = async (enabled: boolean) => {
    try {
      await api.setAutostart(enabled);
      setAutostartEnabled(enabled);
      await update({ autostart: enabled });
      addToast("success", `Iniciar com o Windows: ${enabled ? "ativado" : "desativado"}.`);
    } catch (e) {
      addToast("error", `Erro: ${e}`);
    }
  };

  return (
    <div className="page-scroll space-y-4">
      <div>
        <h2 className="text-xl font-bold text-text-primary dark:text-text-darkPrimary mb-1">
          Configurações
        </h2>
      </div>

      {/* Iniciar com o Windows */}
      <div className="p-5 rounded-2xl bg-card dark:bg-card-dark border border-stroke dark:border-stroke-dark">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Power size={20} className="text-accent" />
            <div>
              <p className="text-sm font-medium text-text-primary dark:text-text-darkPrimary">
                Iniciar com o Windows
              </p>
              <p className="text-xs text-text-secondary dark:text-text-darkSecondary">
                Abre o app automaticamente ao ligar o PC
              </p>
            </div>
          </div>
          <Toggle
            checked={autostartEnabled}
            loading={autostartLoading}
            onChange={toggleAutostart}
            ariaLabel="Iniciar com o Windows"
          />
        </div>
      </div>

      {/* Minimizar para bandeja */}
      <div className="p-5 rounded-2xl bg-card dark:bg-card-dark border border-stroke dark:border-stroke-dark">
        <div className="flex items-center justify-between">
          <label htmlFor="toggle-minimize" className="cursor-pointer">
            <p className="text-sm font-medium text-text-primary dark:text-text-darkPrimary">
              Minimizar para bandeja ao fechar
            </p>
            <p className="text-xs text-text-secondary dark:text-text-darkSecondary">
              O botão &quot;X&quot; esconde a janela em vez de fechar o app
            </p>
          </label>
          <Toggle
            id="toggle-minimize"
            checked={settings.minimize_to_tray}
            onChange={(v) => update({ minimize_to_tray: v })}
            ariaLabel="Minimizar para bandeja ao fechar"
          />
        </div>
      </div>

      {/* Tema */}
      <div className="p-5 rounded-2xl bg-card dark:bg-card-dark border border-stroke dark:border-stroke-dark">
        <p className="text-sm font-medium text-text-primary dark:text-text-darkPrimary mb-2">
          Tema
        </p>
        <div className="flex gap-2" role="radiogroup" aria-label="Tema">
          {(["system", "light", "dark"] as ThemeMode[]).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={settings.theme === t}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                settings.theme === t
                  ? "bg-accent text-white"
                  : "bg-black/5 dark:bg-white/5 text-text-secondary dark:text-text-darkSecondary"
              }`}
              onClick={() => update({ theme: t })}
            >
              {t === "system" ? "Sistema" : t === "light" ? "Claro" : "Escuro"}
            </button>
          ))}
        </div>
      </div>

      {/* Confirmar antes de agir */}
      <div className="p-5 rounded-2xl bg-card dark:bg-card-dark border border-stroke dark:border-stroke-dark">
        <div className="flex items-center justify-between">
          <label htmlFor="toggle-confirm" className="cursor-pointer">
            <p className="text-sm font-medium text-text-primary dark:text-text-darkPrimary">
              Sempre pedir confirmação
            </p>
            <p className="text-xs text-text-secondary dark:text-text-darkSecondary">
              Mostra um diálogo antes de executar ações
            </p>
          </label>
          <Toggle
            id="toggle-confirm"
            checked={settings.confirm_before_action}
            onChange={(v) => update({ confirm_before_action: v })}
            ariaLabel="Sempre pedir confirmação"
          />
        </div>
      </div>

      {/* Lembrete padrão */}
      <div className="p-5 rounded-2xl bg-card dark:bg-card-dark border border-stroke dark:border-stroke-dark">
        <label htmlFor="settings-reminder" className="label">Lembrete padrão (minutos antes)</label>
        <input
          id="settings-reminder"
          type="number"
          min={0}
          max={120}
          value={reminderInput}
          onChange={(e) => {
            const val = sanitizeInt(e.target.value, 0, 120);
            setReminderInput(val);
            updateDebounced({ default_reminder_minutes: val });
          }}
          onBlur={() => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            update({ default_reminder_minutes: reminderInput });
          }}
          className="input mt-2"
        />
      </div>

      {/* Testar notificação */}
      <div className="p-5 rounded-2xl bg-card dark:bg-card-dark border border-stroke dark:border-stroke-dark">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bell size={20} className="text-accent" />
            <div>
              <p className="text-sm font-medium text-text-primary dark:text-text-darkPrimary">
                Notificações
              </p>
              <p className="text-xs text-text-secondary dark:text-text-darkSecondary">
                Teste se as notificações estão funcionando
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn-ghost"
            onClick={async () => {
              try {
                await api.testNotification();
                addToast("info", "Notificação enviada.");
              } catch (e) {
                addToast("error", `Erro: ${e}`);
              }
            }}
          >
            Testar
          </button>
        </div>
      </div>
    </div>
  );
}

function Toggle({
  id,
  checked,
  onChange,
  loading,
  ariaLabel,
}: {
  id?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  loading?: boolean;
  ariaLabel: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={loading}
      onClick={() => onChange(!checked)}
      className={`relative w-12 h-7 rounded-full transition-colors disabled:opacity-50
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
        ${checked ? "bg-accent" : "bg-black/20 dark:bg-white/20"}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-5" : ""
        }`}
      />
    </button>
  );
}
