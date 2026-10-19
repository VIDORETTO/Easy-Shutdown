import { Zap } from "lucide-react";
import { useStore } from "@/store/useStore";

export default function About() {
  const version = useStore((s) => s.version);

  return (
    <div className="page-scroll space-y-5">
      <div className="flex flex-col items-center text-center pt-10">
        <div className="w-20 h-20 rounded-2xl bg-accent flex items-center justify-center mb-5 shadow-fluentLg">
          <Zap size={40} className="text-white" />
        </div>
        <h1 className="text-2xl font-bold text-text-primary dark:text-text-darkPrimary">Wise Auto Shutdown</h1>
        {version && <p className="text-sm text-text-secondary dark:text-text-darkSecondary mt-1.5">v{version}</p>}
        <p className="text-sm text-text-secondary dark:text-text-darkSecondary mt-4 max-w-sm leading-relaxed">
          Desligue, reinicie, suspenda, hiberne, bloqueie, encerre a sessão ou apague a tela — na hora, em tarefas
          agendadas (únicas, semanais ou por inatividade), por atalhos globais ou pela bandeja do sistema.
        </p>
      </div>

      <div className="p-5 rounded-2xl bg-card dark:bg-card-dark border border-stroke dark:border-stroke-dark text-sm space-y-1.5 text-text-secondary dark:text-text-darkSecondary">
        <p>• Desenvolvido com Tauri v2 + React + TypeScript</p>
        <p>• Ações via Win32 API direto (sem console)</p>
        <p>• Tarefas salvas em disco e retomadas ao reabrir</p>
        <p>• 100% local — sem telemetria, sem nuvem</p>
      </div>

      <p className="text-xs text-center text-text-secondary dark:text-text-darkSecondary">
        Atalhos do app: Ctrl+1…5 trocam de aba.
      </p>
    </div>
  );
}
