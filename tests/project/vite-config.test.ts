import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { WEB_SOURCE_MODULE_RE, createFsOptions, createViteConfig } from "../../vite.config";
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
    const proxy = config.server?.proxy as Record<string, unknown>;
    expect(Object.keys(proxy).sort()).toEqual(["/api", "/health"]);
    expect(proxy["/health"]).toBe("http://127.0.0.1:3456");
    expect(proxy["/api"]).toMatchObject({ target: "http://127.0.0.1:3456" });
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

  it("R88: server.fs es estricto, con lista blanca mínima y deny de ficheros sensibles", () => {
    const fs = config.server?.fs;
    expect(fs?.strict).toBe(true);
    // Sin `allowedHosts: true` (protección frente a DNS rebinding de Vite): se mantiene el valor por defecto.
    expect(config.server?.allowedHosts).toBeUndefined();
    const root = resolve(import.meta.dirname, "../..");
    expect(fs?.allow).toEqual([
      resolve(root, "src/web"),
      resolve(root, "src/shared"),
      resolve(root, "src/data/legal"),
    ]);
    // Ni la raíz del repo ni el directorio de datos están en la lista blanca.
    expect(fs?.allow).not.toContain(root);
    for (const dir of fs?.allow ?? []) expect(dir.startsWith(resolve(root, "data"))).toBe(false);
    const deny = (fs?.deny ?? []).join(" | ");
    for (const needle of [
      ".env",
      "*.sqlite*",
      "*.db",
      "/data/**",
      "/.git/**",
      "/specs/**",
      "/progress/**",
      "/.cache/**",
      "/reports/**",
      "/feature-list.json",
      "/package.json",
      "/package-lock.json",
    ]) {
      expect(deny, needle).toContain(needle);
    }
  });

  it("R88: createFsOptions escapa los caracteres de glob de la ruta de la raíz", () => {
    const fs = createFsOptions(String.raw`C:\dev\mi (copia)\repo[1]`);
    expect(fs.deny).toContain(String.raw`C:/dev/mi \(copia\)/repo\[1\]/data/**`);
  });

  it("R89: el proxy de /api deja a Vite los módulos fuente de src/web/api", () => {
    const proxy = config.server?.proxy as Record<
      string,
      { bypass: (req: { url?: string }) => unknown }
    >;
    const bypass = proxy["/api"]!.bypass;
    for (const url of [
      "/api/services.tsx",
      "/api/http-client.ts?t=1",
      "/api/schemas.ts",
      "/api/x.css",
    ]) {
      expect(WEB_SOURCE_MODULE_RE.test(url), url).toBe(true);
      expect(bypass({ url }), url).toBe(url);
    }
    for (const url of [
      "/api/auth/me",
      "/api/auth/login",
      "/api/accounts",
      "/api/accounts/abc/pin",
      "/api",
      "/api/x?file=a.ts",
    ]) {
      expect(WEB_SOURCE_MODULE_RE.test(url), url).toBe(false);
      expect(bypass({ url }), url).toBeUndefined();
    }
  });
});
