import { LogOut } from "lucide-react";
import Modal from "./Modal";
import { useStore } from "@/store/useStore";
import { api } from "@/lib/invoke";

export default function QuitDialog() {
  const pending = useStore((s) => s.quitRequest);
  const closeQuit = useStore((s) => s.closeQuit);
  const setTab = useStore((s) => s.setTab);

  return (
    <Modal open={pending !== null} labelledBy="quit-title" describedBy="quit-desc" onDismiss={closeQuit}>
      <div className="flex items-center gap-3 mb-4">
        <LogOut size={24} className="text-danger" />
        <h3 id="quit-title" className="text-xl font-bold text-text-primary dark:text-text-darkPrimary">
          Sair do app?
        </h3>
      </div>
      <p id="quit-desc" className="text-sm text-text-secondary dark:text-text-darkSecondary mb-5 leading-relaxed">
        {pending === 1 ? "Há 1 tarefa ativa" : `Há ${pending} tarefas ativas`}. Com o app fechado elas não serão
        executadas (ficam salvas para quando você abrir de novo).
      </p>
      <div className="flex gap-3 justify-end flex-wrap">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            closeQuit();
            setTab("tasks");
          }}
        >
          Ver tarefas
        </button>
        <button type="button" className="btn-ghost" onClick={closeQuit} data-autofocus>
          Continuar rodando
        </button>
        <button type="button" className="btn-danger" onClick={() => api.appQuit()}>
          Sair mesmo assim
        </button>
      </div>
    </Modal>
  );
}
