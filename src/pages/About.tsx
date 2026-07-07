import { useState, useEffect } from "react";
import { Zap } from "lucide-react";
import { api } from "@/lib/invoke";

export default function About() {
  const [version, setVersion] = useState("0.1.0");

  useEffect(() => {
    api.getAppVersion().then(setVersion).catch(() => {});
  }, []);

  return (
    <div className="page-scroll space-y-5">
      <div className="flex flex-col items-center text-center pt-10">
        <div className="w-20 h-20 rounded-2xl bg-accent flex items-center justify-center mb-5 shadow-fluentLg">
          <Zap size={40} className="text-white" />
        </div>
        <h1 className="text-2xl font-bold text-text-primary dark:text-text-darkPrimary">
          Wise Auto Shutdown
        </h1>
        <p className="text-sm text-text-secondary dark:text-text-darkSecondary mt-1.5">
          v{version}
        </p>
        <p className="text-sm text-text-secondary dark:text-text-darkSecondary mt-4 max-w-sm leading-relaxed">
          App moderno para Windows 11 que facilita desligar, reiniciar, suspender,
          hibernar, bloquear e encerrar sessão — com agendamento, atalhos globais e
          bandeja do sistema.
        </p>
      </div>

      <div className="p-5 rounded-2xl bg-card dark:bg-card-dark border border-stroke dark:border-stroke-dark text-sm space-y-1.5 text-text-secondary dark:text-text-darkSecondary">
        <p>• Desenvolvido com Tauri v2 + React + TypeScript</p>
        <p>• Ações via Win32 API direto (sem console)</p>
        <p>• Visual Fluent Win11 com Mica</p>
        <p>• 100% local — sem telemetria, sem nuvem</p>
      </div>
    </div>
  );
}
