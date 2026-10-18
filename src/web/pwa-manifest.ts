import type { ManifestOptions } from "vite-plugin-pwa";

// R84: el service worker NO debe servir index.html para navegaciones a la API ni a /health.
// Las rutas del cliente (/legal, /perfil...) sí caen en el fallback y funcionan sin red.
export const NAVIGATE_FALLBACK_DENYLIST: RegExp[] = [/^\/api(\/|$)/, /^\/health$/];

// Literales fuera de componentes: el manifest lo consumen vite.config.ts y los tests.
export const pwaManifest: Partial<ManifestOptions> = {
  name: "Path Helper",
  short_name: "PathHelper",
  lang: "es",
  start_url: "/",
  display: "standalone",
  theme_color: "#1f3a5f",
  background_color: "#ffffff",
  icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
};
