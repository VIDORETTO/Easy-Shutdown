// Metadados de cada ação de energia: ícone, cor, descrições e textos de ajuda
// para desambiguar ações parecidas (suspending vs hibernar, desligar vs encerrar sessão, etc).

import {
  Power,
  RotateCw,
  Moon,
  ZapOff,
  Lock,
  LogOut,
  MonitorOff,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { ActionKind, HotkeyTarget } from "@/types";

export interface ActionMeta {
  key: ActionKind;
  label: string;
  shortDesc: string;
  icon: LucideIcon;
  iconColor: string;
  accentClass: string;
  helpTitle: string;
  helpText: string;
  helpCompare?: string;
  supportsForce: boolean;
  /** Ações que fecham programas/desligam: usam botão vermelho na confirmação. */
  destructive: boolean;
}

export const ACTIONS: ActionMeta[] = [
  {
    key: "shutdown",
    label: "Desligar",
    shortDesc: "Fecha tudo e desliga o PC",
    icon: Power,
    iconColor: "text-danger dark:text-red-400",
    accentClass: "hover:border-danger/40 dark:hover:border-red-400/40",
    helpTitle: "Desligar",
    helpText:
      "Fecha todos os programas e desliga o PC completamente. Na próxima vez que ligar, será um boot completo (frio).",
    helpCompare:
      'Diferente de "Encerrar sessão": aqui o PC desliga de vez. Diferente de "Hibernar": não salva o estado da RAM.',
    supportsForce: true,
    destructive: true,
  },
  {
    key: "restart",
    label: "Reiniciar",
    shortDesc: "Desliga e liga em seguida",
    icon: RotateCw,
    iconColor: "text-accent dark:text-sky-400",
    accentClass: "hover:border-accent/40 dark:hover:border-sky-400/40",
    helpTitle: "Reiniciar",
    helpText:
      "Desliga o PC e liga automaticamente em seguida. Use após instalação de atualizações ou quando algo travar.",
    helpCompare:
      'É como o "Desligar", mas o PC já liga sozinho após desligar.',
    supportsForce: true,
    destructive: true,
  },
  {
    key: "sleep",
    label: "Suspender",
    shortDesc: "Baixo consumo, volta rápido",
    icon: ZapOff,
    iconColor: "text-warning dark:text-orange-400",
    accentClass: "hover:border-warning/40 dark:hover:border-orange-400/40",
    helpTitle: "Suspender (Sleep)",
    helpText:
      "O PC entra em baixo consumo. A RAM continua ligada, tudo fica como está. Volta em 2–5 segundos.",
    helpCompare:
      '⚠ Se faltar energia, você perde o que não foi salvo. Para algo seguro contra falta de luz, use "Hibernar".',
    supportsForce: false,
    destructive: false,
  },
  {
    key: "hibernate",
    label: "Hibernar",
    shortDesc: "Salva no disco, consumo zero",
    icon: Moon,
    iconColor: "text-indigo-500 dark:text-indigo-400",
    accentClass: "hover:border-indigo-400/40",
    helpTitle: "Hibernar",
    helpText:
      "Salva toda a RAM no disco e desliga o PC de vez. Consumo zero. Demora 10–30 segundos para voltar.",
    helpCompare:
      '✅ Seguro contra falta de luz (diferente de "Suspender"). Pode estar desativado em alguns PCs — o app avisa se for o caso.',
    supportsForce: false,
    destructive: true,
  },
  {
    key: "lock",
    label: "Bloquear",
    shortDesc: "Volta para a tela de login",
    icon: Lock,
    iconColor: "text-emerald-500 dark:text-emerald-400",
    accentClass: "hover:border-emerald-400/40",
    helpTitle: "Bloquear",
    helpText:
      "NÃO desliga nada. Apenas volta para a tela de login. Seus programas continuam rodando em segundo plano.",
    helpCompare:
      'Diferente de "Encerrar sessão": no bloqueio, seus programas continuam abertos. No encerramento, eles fecham.',
    supportsForce: false,
    destructive: false,
  },
  {
    key: "logoff",
    label: "Encerrar sessão",
    shortDesc: "Fecha seus programas e sai",
    icon: LogOut,
    iconColor: "text-purple-500 dark:text-purple-400",
    accentClass: "hover:border-purple-400/40",
    helpTitle: "Encerrar sessão",
    helpText:
      "Fecha TODOS os seus programas e volta para a tela de login. O PC continua ligado para outros usuários e serviços.",
    helpCompare:
      'Diferente de "Desligar": aqui o PC não desliga, só você sai da sua conta. Diferente de "Bloquear": aqui seus programas são fechados.',
    supportsForce: true,
    destructive: true,
  },
  {
    key: "monitor_off",
    label: "Desligar tela",
    shortDesc: "Apaga o monitor, PC segue ligado",
    icon: MonitorOff,
    iconColor: "text-slate-500 dark:text-slate-300",
    accentClass: "hover:border-slate-400/40",
    helpTitle: "Desligar tela",
    helpText:
      "Apaga o(s) monitor(es) sem desligar nada. Downloads, músicas e programas continuam. Mexa o mouse ou aperte uma tecla para religar.",
    helpCompare:
      'Diferente de "Bloquear": não pede senha ao voltar. Combine com "Bloquear" se quiser privacidade.',
    supportsForce: false,
    destructive: false,
  },
];

/** Explicação mostrada quando a hibernação está desativada no PC. */
export const HIBERNATE_DISABLED_HELP =
  "A hibernação está desativada neste PC. Para ativar, abra o Terminal como administrador e rode: powercfg /hibernate on";

export interface HotkeyTargetMeta {
  key: HotkeyTarget;
  label: string;
  icon: LucideIcon;
  iconColor: string;
}

export const HOTKEY_TARGETS: HotkeyTargetMeta[] = [
  ...ACTIONS.map((a) => ({ key: a.key, label: a.label, icon: a.icon, iconColor: a.iconColor })),
  {
    key: "cancel_next",
    label: "Cancelar próxima tarefa",
    icon: XCircle,
    iconColor: "text-danger dark:text-red-400",
  },
];

export function getAction(key: ActionKind): ActionMeta | null {
  return ACTIONS.find((a) => a.key === key) ?? null;
}

/** Versão segura que sempre retorna um label (fallback para a key crua). */
export function getActionLabel(key: ActionKind): string {
  return getAction(key)?.label ?? key;
}
