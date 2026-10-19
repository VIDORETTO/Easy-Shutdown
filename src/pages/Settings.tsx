import { useEffect, useState, type ReactNode } from "react";
import { AlarmClock, Bell, Coffee, FolderOpen, Power, RotateCcw } from "lucide-react";
import NumberField from "@/components/NumberField";
import Toggle from "@/components/Toggle";
import { api } from "@/lib/invoke";
import { useStore } from "@/store/useStore";
import type { ThemeMode } from "@/types";

const WARNING_OPTIONS = [
  { value: 0, label: "Desativado" },
  { value: 15, label: "15 segundos" },
  { value: 30, label: "30 segundos" },
  { value: 60, label: "1 minuto" },
  { value: 120, label: "2 minutos" },
  { value: 300, label: "5 minutos" },
];

function Row({
  id,
  icon,
  title,
  desc,
  children,
}: {
  id?: string;
  icon?: ReactNode;
  title: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-5 rounded-2xl bg-card dark:bg-card-dark border border-stroke dark:border-stroke-dark">
      <div className="flex items-center gap-3 min-w-0">
        {icon}
        <label htmlFor={id} className={id ? "cursor-pointer" : undefined}>
          <span className="block text-sm font-medium text-text-primary dark:text-text-darkPrimary">{title}</span>
          {desc && <span className="block text-xs text-text-secondary dark:text-text-darkSecondary">{desc}</span>}
        </label>
      </div>
      {children}
    </div>
  );
}

export default function Settings() {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const resetSettings = useStore((s) => s.resetSettings);
  const addToast = useStore((s) => s.addToast);
  const [confirmReset, setConfirmReset] = useState(false);

  // O "clique de novo para confirmar" expira sozinho.
  useEffect(() => {
    if (!confirmReset) return;
    const t = setTimeout(() => setConfirmReset(false), 4000);
    return () => clearTimeout(t);
  }, [confirmReset]);

  if (!settings) return null;

  return (
    <div className="page-scroll space-y-4">
      <h2 className="text-xl font-bold text-text-primary dark:text-text-darkPrimary">Ajustes</h2>

      <Row
        id="toggle-autostart"
        icon={<Power size={20} className="text-accent shrink-0" />}
        title="Iniciar com o Windows"
        desc="Abre automaticamente, já minimizado na bandeja"
      >
        <Toggle
          id="toggle-autostart"
          checked={settings.autostart}
          onChange={(v) => updateSettings({ autostart: v })}
          ariaLabel="Iniciar com o Windows"
        />
      </Row>

      <Row id="toggle-minimize" title="Minimizar para bandeja ao fechar" desc='O botão "X" esconde a janela em vez de fechar o app'>
        <Toggle
          id="toggle-minimize"
          checked={settings.minimize_to_tray}
          onChange={(v) => updateSettings({ minimize_to_tray: v })}
          ariaLabel="Minimizar para bandeja ao fechar"
        />
      </Row>

      <div className="p-5 rounded-2xl bg-card dark:bg-card-dark border border-stroke dark:border-stroke-dark">
        <p className="text-sm font-medium text-text-primary dark:text-text-darkPrimary mb-2" id="theme-label">
          Tema
        </p>
        <div className="flex gap-2" role="radiogroup" aria-labelledby="theme-label">
          {(["system", "light", "dark"] as ThemeMode[]).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={settings.theme === t}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                settings.theme === t
                  ? "bg-accent text-white"
                  : "bg-black/5 dark:bg-white/5 text-text-secondary dark:text-text-darkSecondary hover:bg-black/10 dark:hover:bg-white/10"
              }`}
              onClick={() => updateSettings({ theme: t })}
            >
              {t === "system" ? "Sistema" : t === "light" ? "Claro" : "Escuro"}
            </button>
          ))}
        </div>
      </div>

      <Row id="toggle-confirm" title="Sempre pedir confirmação" desc="Vale para cliques no app, menu da bandeja e atalhos globais">
        <Toggle
          id="toggle-confirm"
          checked={settings.confirm_before_action}
          onChange={(v) => updateSettings({ confirm_before_action: v })}
          ariaLabel="Sempre pedir confirmação"
        />
      </Row>

      <Row
        id="select-warning"
        icon={<AlarmClock size={20} className="text-accent shrink-0" />}
        title="Aviso na tela antes de executar"
        desc="Contagem regressiva com Cancelar / Adiar, visível mesmo com o Não incomodar"
      >
        <select
          id="select-warning"
          className="input !w-40"
          value={settings.final_warning_seconds}
          onChange={(e) => updateSettings({ final_warning_seconds: Number(e.target.value) })}
        >
          {WARNING_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Row>

      <Row
        id="toggle-keepawake"
        icon={<Coffee size={20} className="text-accent shrink-0" />}
        title="Manter o PC acordado com tarefa pendente"
        desc="Impede a suspensão automática enquanto houver tarefa única agendada (recorrentes não bloqueiam)"
      >
        <Toggle
          id="toggle-keepawake"
          checked={settings.keep_awake_during_tasks}
          onChange={(v) => updateSettings({ keep_awake_during_tasks: v })}
          ariaLabel="Manter o PC acordado com tarefa pendente"
        />
      </Row>

      <Row id="settings-reminder" title="Lembrete padrão" desc="Minutos antes da tarefa (0 = sem lembrete)">
        <NumberField
          id="settings-reminder"
          value={settings.default_reminder_minutes}
          min={0}
          max={120}
          onChange={(v) => updateSettings({ default_reminder_minutes: v })}
          className="!w-24"
        />
      </Row>

      <Row icon={<Bell size={20} className="text-accent shrink-0" />} title="Notificações" desc="Teste se as notificações do Windows estão funcionando">
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
      </Row>

      <Row icon={<FolderOpen size={20} className="text-accent shrink-0" />} title="Logs" desc="Arquivo de diagnóstico para relatar problemas">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => api.openLogsDir().catch((e) => addToast("error", `Erro: ${e}`))}
        >
          Abrir pasta
        </button>
      </Row>

      <Row icon={<RotateCcw size={20} className="text-danger shrink-0" />} title="Restaurar padrões" desc="Volta todas as configurações e remove os atalhos">
        <button
          type="button"
          className={confirmReset ? "btn-danger" : "btn-ghost"}
          onClick={() => {
            if (confirmReset) {
              setConfirmReset(false);
              void resetSettings();
            } else {
              setConfirmReset(true);
            }
          }}
        >
          {confirmReset ? "Clique para confirmar" : "Restaurar"}
        </button>
      </Row>
    </div>
  );
}
