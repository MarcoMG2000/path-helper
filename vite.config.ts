import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type UserConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { loadConfig, type Config } from "./src/server/config";
import { NAVIGATE_FALLBACK_DENYLIST, pwaManifest } from "./src/web/pwa-manifest";

const repoRoot = import.meta.dirname;

/** Escapa los caracteres especiales de glob de una ruta absoluta (barras normales). */
function globEscape(path: string): string {
  return path.replace(/\\/g, "/").replace(/[()[\]{}!*?+@]/g, "\\$&");
}

/**
 * Sistema de ficheros del servidor de desarrollo (f1b R88). Vite sirve por `/@fs/<ruta>` cualquier
 * fichero del workspace salvo un `deny` mínimo (`.env*`, `*.crt`, `*.pem`, `.git`); con
 * `HOST=0.0.0.0` (probar desde el móvil) eso expone a la LAN la BD SQLite con los hashes de PIN.
 * Aquí se restringe a lo que la app necesita (lista blanca) y se deniegan explícitamente los
 * ficheros sensibles de la raíz del repo (defensa en profundidad: `deny` gana siempre a `allow`).
 */
export function createFsOptions(root: string = repoRoot): {
  strict: true;
  allow: string[];
  deny: string[];
} {
  const base = globEscape(root);
  return {
    strict: true,
    allow: [resolve(root, "src/web"), resolve(root, "src/shared"), resolve(root, "src/data/legal")],
    deny: [
      // Valores por defecto de Vite (se reemplazan al fijar `deny`).
      ".env",
      ".env.*",
      "*.{crt,pem}",
      "**/.git/**",
      // Cualquier BD, esté donde esté.
      "*.sqlite*",
      "*.db",
      "*.db-*",
      // Carpetas y ficheros de la raíz del repo que nunca debe servir el servidor web.
      `${base}/.env*`,
      `${base}/data/**`,
      `${base}/.git/**`,
      `${base}/specs/**`,
      `${base}/progress/**`,
      `${base}/.cache/**`,
      `${base}/reports/**`,
      `${base}/feature-list.json`,
      `${base}/package.json`,
      `${base}/package-lock.json`,
    ],
  };
}

/**
 * El código del cliente vive en `src/web/api/` y Vite lo sirve en la URL `/api/*.ts(x)`, el mismo
 * prefijo que el proxy hacia la API (R89). Los módulos fuente (con extensión de código) se sirven
 * desde Vite; las rutas reales de la API nunca llevan extensión de fichero.
 */
export const WEB_SOURCE_MODULE_RE = /^\/api\/[^?#]*\.(?:tsx?|jsx?|mts|css|map)(?:[?#]|$)/;

// Fichero de herramienta (no es código de src/web): puede leer la config del servidor para
// tener una única fuente de verdad de puertos.
export function createViteConfig(
  config: Pick<Config, "HOST" | "PORT" | "WEB_PORT">,
  root: string = repoRoot,
): UserConfig {
  const apiTarget = `http://127.0.0.1:${config.PORT}`;
  return {
    root: resolve(root, "src/web"),
    publicDir: resolve(root, "src/web/public"),
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        manifest: pwaManifest,
        workbox: { navigateFallbackDenylist: NAVIGATE_FALLBACK_DENYLIST },
        devOptions: { enabled: true },
      }),
    ],
    server: {
      host: config.HOST,
      port: config.WEB_PORT,
      strictPort: true,
      fs: createFsOptions(root),
      proxy: {
        "/health": apiTarget,
        "/api": {
          target: apiTarget,
          bypass: (req) => (WEB_SOURCE_MODULE_RE.test(req.url ?? "") ? req.url : undefined),
        },
      },
    },
    build: {
      outDir: resolve(root, "dist/web"),
      emptyOutDir: true,
    },
  };
}

export default defineConfig(() => createViteConfig(loadConfig()));
