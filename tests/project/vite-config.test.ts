import { describe, expect, it } from "vitest";
import { createViteConfig } from "../../vite.config";
import { pwaManifest } from "../../src/web/pwa-manifest";
import { readRepoFile } from "./helpers";

const config = createViteConfig({ HOST: "127.0.0.1", PORT: 3456, WEB_PORT: 5999 });

describe("vite.config", () => {
  it("R38: strictPort evita elegir otro puerto si WEB_PORT está ocupado", () => {
    expect(config.server?.strictPort).toBe(true);
    expect(config.server?.port).toBe(5999);
    expect(config.server?.host).toBe("127.0.0.1");
  });

  it("R37: hace proxy de /health y /api a la API en PORT", () => {
    expect(config.server?.proxy).toEqual({
      "/health": "http://127.0.0.1:3456",
      "/api": "http://127.0.0.1:3456",
    });
  });

  it("R40: construye en dist/web", () => {
    expect(config.build?.outDir).toMatch(/dist[\\/]web$/);
  });

  it("R39: el manifest PWA tiene los campos requeridos", () => {
    expect(pwaManifest.name).toBeTruthy();
    expect(pwaManifest.short_name).toBeTruthy();
    expect(pwaManifest.lang).toBe("es");
    expect(pwaManifest.start_url).toBeTruthy();
    expect(pwaManifest.display).toBe("standalone");
    expect(pwaManifest.theme_color).toBeTruthy();
    expect(pwaManifest.background_color).toBeTruthy();
    expect(pwaManifest.icons?.length).toBeGreaterThan(0);
  });

  it("R36: index.html declara lang=es y el contenedor de montaje de React", () => {
    const html = readRepoFile("src/web/index.html");
    expect(html).toMatch(/<html[^>]*\blang="es"/);
    expect(html).toContain('<div id="root"></div>');
  });
});
