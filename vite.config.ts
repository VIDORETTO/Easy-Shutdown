import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Tauri espera que o dev server rode na porta 1420 e use HMR com porta fixa
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Evita dependências desnecessárias no bundle do Tauri
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // Não observa a pasta src-tauri
      ignored: ["**/src-tauri/**"],
    },
  },
}));
