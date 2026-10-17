import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type UserConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { loadConfig, type Config } from "./src/server/config";
import { pwaManifest } from "./src/web/pwa-manifest";

const repoRoot = import.meta.dirname;

// Fichero de herramienta (no es código de src/web): puede leer la config del servidor para
// tener una única fuente de verdad de puertos.
export function createViteConfig(config: Pick<Config, "HOST" | "PORT" | "WEB_PORT">): UserConfig {
  const apiTarget = `http://127.0.0.1:${config.PORT}`;
  return {
    root: resolve(repoRoot, "src/web"),
    publicDir: resolve(repoRoot, "src/web/public"),
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        manifest: pwaManifest,
        devOptions: { enabled: true },
      }),
    ],
    server: {
      host: config.HOST,
      port: config.WEB_PORT,
      strictPort: true,
      proxy: { "/health": apiTarget, "/api": apiTarget },
    },
    build: {
      outDir: resolve(repoRoot, "dist/web"),
      emptyOutDir: true,
    },
  };
}

export default defineConfig(() => createViteConfig(loadConfig()));
