import type { ManifestOptions } from "vite-plugin-pwa";

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
