import { createServer as createNetServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { start, type RunningServer } from "../../src/server/start";
import { createViteConfig } from "../../vite.config";

function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const probe = createNetServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolvePort(port));
    });
  });
}

let api: RunningServer;
let vite: ViteDevServer;
let webUrl: string;
let dbDir: string;

beforeAll(async () => {
  const envFile = join(tmpdir(), "path-helper-no-existe", ".env");
  // Desde f1 la API exige configuración de auth y una BD (en un directorio temporal).
  dbDir = await mkdtemp(join(tmpdir(), "path-helper-dev-"));
  api = await start(
    {
      HOST: "127.0.0.1",
      PORT: "0",
      LOG_LEVEL: "silent",
      DATABASE_PATH: join(dbDir, "app.sqlite"),
      AUTH_PEPPER: "p".repeat(40),
      AUTH_ALLOWED_ORIGINS: "http://localhost:5173",
    },
    { envFile },
  );
  const apiPort = Number(new URL(api.address).port);
  const webPort = await freePort();
  vite = await createServer({
    ...createViteConfig({ HOST: "127.0.0.1", PORT: apiPort, WEB_PORT: webPort }),
    configFile: false,
    logLevel: "silent",
  });
  await vite.listen();
  webUrl = `http://127.0.0.1:${webPort}`;
});

afterAll(async () => {
  await vite?.close();
  await api?.close();
  if (dbDir) await rm(dbDir, { recursive: true, force: true });
});

describe("servidor de desarrollo de Vite (integración)", () => {
  it("R36: GET / devuelve el HTML con lang=es y el contenedor de React", async () => {
    const response = await fetch(`${webUrl}/`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toMatch(/<html[^>]*\blang="es"/);
    expect(html).toContain('<div id="root"></div>');
  });

  it("R37: GET /health vía proxy devuelve lo mismo que la API", async () => {
    const viaWeb = await fetch(`${webUrl}/health`);
    const direct = await fetch(`${api.address}/health`);
    expect(viaWeb.status).toBe(200);
    expect(await viaWeb.json()).toEqual(await direct.json());
  });

  it("R39: /manifest.webmanifest devuelve el manifest PWA", async () => {
    const response = await fetch(`${webUrl}/manifest.webmanifest`);
    expect(response.status).toBe(200);
    const manifest = (await response.json()) as Record<string, unknown>;
    expect(manifest["name"]).toBeTruthy();
    expect(manifest["short_name"]).toBeTruthy();
    expect(manifest["lang"]).toBe("es");
    expect(manifest["start_url"]).toBeTruthy();
    expect(manifest["display"]).toBe("standalone");
    expect(manifest["theme_color"]).toBeTruthy();
    expect(manifest["background_color"]).toBeTruthy();
    expect(Array.isArray(manifest["icons"]) && manifest["icons"].length > 0).toBe(true);
  });
});
