import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, X } from "lucide-react";

export default function Titlebar() {
  const onMinimize = () => {
    getCurrentWindow().minimize().catch(console.error);
  };
  const onClose = () => {
    getCurrentWindow().close().catch(console.error);
  };

  return (
    <div
      data-tauri-drag-region
      className="h-11 flex items-center justify-between px-4 select-none shrink-0
                 bg-white/30 dark:bg-black/20 backdrop-blur-md"
    >
      <div data-tauri-drag-region className="flex items-center gap-2.5">
        <div className="w-6 h-6 rounded-lg bg-accent flex items-center justify-center shadow-sm">
          <span className="text-white text-xs font-bold">E</span>
        </div>
        <span
          data-tauri-drag-region
          className="text-sm font-medium text-text-primary dark:text-text-darkPrimary"
        >
          Easy Shutdown
        </span>
      </div>

      <div className="flex items-center -mr-2">
        <button
          type="button"
          onClick={onMinimize}
          className="w-12 h-9 flex items-center justify-center text-text-primary dark:text-text-darkPrimary
                     hover:bg-black/5 dark:hover:bg-white/10 active:bg-black/10 dark:active:bg-white/15
                     transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
          aria-label="Minimizar"
          title="Minimizar"
        >
          <Minus size={17} />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="w-12 h-9 flex items-center justify-center text-text-primary dark:text-text-darkPrimary
                     hover:bg-danger hover:text-white active:bg-danger/90
                     transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
          aria-label="Fechar"
          title="Fechar"
        >
          <X size={17} />
        </button>
      </div>
    </div>
  );
}
