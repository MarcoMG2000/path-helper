import { request } from "node:http";
import { createServer as createNetServer } from "node:net";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, preview, type PreviewServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createViteConfig } from "../../vite.config";
import { ROOT } from "../project/helpers";

// R88: el servidor de desarrollo de Vite NO sirve por /@fs ni por rutas relativas los ficheros
// sensibles del repo (BD SQLite con hashes de PIN, .env, specs...) y la app sigue funcionando.
const SECRET = "SECRETO-DEL-SENUELO-f1b";

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

/** GET con la ruta EXACTA (sin que `fetch` normalice `..`). */
function rawGet(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolveGet, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method: "GET" }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () =>
        resolveGet({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }),
      );
    });
    req.once("error", reject);
    req.end();
  });
}

type Running = { vite: ViteDevServer; port: number; cacheDir: string };

async function startVite(root: string): Promise<Running> {
  const port = await freePort();
  const cacheDir = join(tmpdir(), `path-helper-vitecache-${port}`);
  const vite = await createServer({
    ...createViteConfig({ HOST: "127.0.0.1", PORT: 1, WEB_PORT: port }, root),
    configFile: false,
    logLevel: "silent",
    // Caché de dependencias propia del servidor de prueba (no toca la del dev real).
    cacheDir,
  });
  await vite.listen();
  return { vite, port, cacheDir };
}

const slash = (p: string): string => p.replace(/\\/g, "/");

/** Rutas de ataque (siempre relativas a una raíz de repo) para un fichero sensible. */
function attackPaths(root: string, relative: string): string[] {
  const abs = slash(join(root, relative));
  const rootUrl = slash(root);
  return [
    `/@fs/${abs}`,
    `/@fs/${abs}?raw`,
    `/@fs/${abs}?import&raw`,
    `/@fs/${abs}?url`,
    `/@fs/${abs}?raw??`,
    `/@fs/${encodeURI(abs)}`,
    `/@fs/${rootUrl}/src/web/../../${relative}`,
    `/@fs/${rootUrl}/src/web/%2e%2e/%2e%2e/${relative}`,
    `/@fs/${rootUrl}/src/web/..%2f..%2f${relative}`,
    `/@fs/${rootUrl}/src/shared/../../${relative}`,
    `/../../${relative}`,
    `/%2e%2e/%2e%2e/${relative}`,
    `/src/web/../../${relative}`,
    `/${relative}`,
    `/${relative}?raw`,
  ];
}

/** Aceptable: 403/404, o el fallback SPA (index.html, nunca el contenido del fichero). */
function expectNotServed(path: string, response: { status: number; body: string }): void {
  expect(response.body, path).not.toContain(SECRET);
  const spaFallback = response.status === 200 && response.body.includes('<div id="root"></div>');
  expect([403, 404].includes(response.status) || spaFallback, `${path} -> ${response.status}`).toBe(
    true,
  );
}

async function expectDenied(port: number, paths: string[]): Promise<void> {
  for (const path of paths) expectNotServed(path, await rawGet(port, path));
}

describe("servidor de desarrollo de Vite: sistema de ficheros restringido (integración)", () => {
  let tempRoot = "";
  let temp: Running;
  let real: Running;
  let previewServer: PreviewServer | undefined;
  let previewPort = 0;

  beforeAll(async () => {
    // Copia mínima de la raíz del repo con señuelos de los ficheros sensibles.
    tempRoot = await mkdtemp(join(tmpdir(), "path-helper-fs-"));
    await cp(join(ROOT, "src/web"), join(tempRoot, "src/web"), { recursive: true });
    await cp(join(ROOT, "src/shared"), join(tempRoot, "src/shared"), { recursive: true });
    await cp(join(ROOT, "src/data/legal"), join(tempRoot, "src/data/legal"), { recursive: true });
    await symlink(join(ROOT, "node_modules"), join(tempRoot, "node_modules"), "junction");
    const decoys: Record<string, string> = {
      "data/path-helper.sqlite": `SQLite format 3 ${SECRET}`,
      "data/otro.db": SECRET,
      "feature-list.json": `{"secret":"${SECRET}"}`,
      "package.json": `{"name":"${SECRET}"}`,
      "package-lock.json": `{"name":"${SECRET}"}`,
      ".env": `AUTH_PEPPER=${SECRET}`,
      ".env.local": `AUTH_PEPPER=${SECRET}`,
      "specs/f/requirements.md": SECRET,
      "progress/current.md": SECRET,
      "reports/r.json": SECRET,
      ".cache/c.json": SECRET,
      ".git/config": SECRET,
      "src/server/secret.ts": `export const s = "${SECRET}";`,
      "src/data/spells/f.json": SECRET,
    };
    for (const [file, content] of Object.entries(decoys)) {
      await mkdir(join(tempRoot, file, ".."), { recursive: true });
      await writeFile(join(tempRoot, file), content);
    }
    temp = await startVite(tempRoot);
    real = await startVite(ROOT);
    // `vite preview` sirve solo dist/web (estático, sin /@fs): se comprueba con una build simulada.
    await mkdir(join(tempRoot, "dist/web"), { recursive: true });
    await writeFile(join(tempRoot, "dist/web/index.html"), '<!doctype html><div id="root"></div>');
    previewPort = await freePort();
    previewServer = await preview({
      ...createViteConfig({ HOST: "127.0.0.1", PORT: 1, WEB_PORT: previewPort }, tempRoot),
      configFile: false,
      logLevel: "silent",
      preview: { port: previewPort, host: "127.0.0.1", strictPort: true },
    });
  });

  afterAll(async () => {
    await temp?.vite.close();
    await real?.vite.close();
    await previewServer?.close();
    for (const running of [temp, real]) {
      if (running) await rm(running.cacheDir, { recursive: true, force: true });
    }
    if (tempRoot) {
      // Desenlaza la junction de node_modules ANTES de borrar (nunca se sigue hacia el real).
      await rm(join(tempRoot, "node_modules"), { force: true });
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  const sensitive = [
    "data/path-helper.sqlite",
    "data/otro.db",
    "feature-list.json",
    "package.json",
    "package-lock.json",
    ".env",
    ".env.local",
    "specs/f/requirements.md",
    "progress/current.md",
    "reports/r.json",
    ".cache/c.json",
    ".git/config",
    "src/server/secret.ts",
    "src/data/spells/f.json",
  ];

  it.each(sensitive)(
    "R88: /@fs/ y rutas relativas con .. devuelven 403/404 para %s (copia de la raíz)",
    async (relative) => {
      await expectDenied(temp.port, attackPaths(tempRoot, relative));
    },
  );

  it.each([
    "feature-list.json",
    "package.json",
    "package-lock.json",
    "specs/f1b-auth-ui/requirements.md",
    "progress/current.md",
    ".env",
    ".git/config",
  ])(
    "R88: /@fs/ y rutas relativas con .. devuelven 403/404 para %s (raíz real del repo)",
    async (relative) => {
      const content = existsSync(join(ROOT, relative))
        ? await readFile(join(ROOT, relative), "utf8")
        : "";
      for (const path of attackPaths(ROOT, relative)) {
        const response = await rawGet(real.port, path);
        expectNotServed(path, response);
        if (content.length > 0) expect(response.body, path).not.toBe(content);
      }
    },
  );

  it("R88: un .sqlite en cualquier carpeta servible tampoco se sirve (deny por extensión)", async () => {
    await writeFile(join(tempRoot, "src/web/public-decoy.sqlite"), SECRET);
    await writeFile(join(tempRoot, "src/web/decoy.db"), SECRET);
    await expectDenied(temp.port, [
      `/@fs/${slash(join(tempRoot, "src/web/public-decoy.sqlite"))}`,
      "/public-decoy.sqlite",
      "/decoy.db",
      "/@fs/" + slash(join(tempRoot, "src/web/decoy.db")),
    ]);
  });

  it("R88: `vite preview` tampoco sirve los ficheros sensibles ni /@fs/ (solo dist/web)", async () => {
    for (const relative of sensitive) {
      await expectDenied(previewPort, attackPaths(tempRoot, relative));
    }
    const index = await rawGet(previewPort, "/");
    expect(index.status).toBe(200);
    expect(index.body).toContain('<div id="root"></div>');
  });

  it("R89: /api/<fuente>.tsx lo sirve Vite (no el proxy) y las rutas reales de la API sí van al proxy", async () => {
    const source = await rawGet(temp.port, "/api/services.tsx");
    expect(source.status).toBe(200);
    expect(source.body).toContain("createServices");
    expect((await rawGet(temp.port, "/api/http-client.ts?t=123")).status).toBe(200);
    // La API de prueba (PORT 1) no existe: el proxy responde 502, nunca 200 ni el HTML de la app.
    for (const path of ["/api/auth/me", "/api/accounts", "/health"]) {
      const response = await rawGet(temp.port, path);
      expect(response.status, path).toBe(502);
    }
  });

  it("R88: la app sigue funcionando (index, módulos de src/web, cliente de Vite, /legal)", async () => {
    for (const { port } of [temp, real]) {
      const index = await rawGet(port, "/");
      expect(index.status).toBe(200);
      expect(index.body).toContain('<div id="root"></div>');
      expect((await rawGet(port, "/legal")).status).toBe(200);
      expect((await rawGet(port, "/cuentas")).status).toBe(200);
      expect((await rawGet(port, "/@vite/client")).status).toBe(200);
      expect((await rawGet(port, "/@react-refresh")).status).toBe(200);
      expect((await rawGet(port, "/manifest.webmanifest")).status).toBe(200);
      expect((await rawGet(port, "/main.tsx")).status).toBe(200);
      expect((await rawGet(port, "/shell/routes.tsx")).status).toBe(200);
      expect((await rawGet(port, "/features/legal/legal-page.tsx")).status).toBe(200);
    }
  });

  it("R88: todo el grafo de módulos de /main.tsx (src/web, src/shared, src/data/legal, dependencias) se sirve con 200", async () => {
    for (const { port } of [temp, real]) {
      const seen = new Set<string>();
      const queue = ["/main.tsx"];
      const importRe = /(?:from|import)\s*\(?\s*["'](\/[^"']+)["']/g;
      while (queue.length > 0) {
        const url = queue.shift()!;
        if (seen.has(url)) continue;
        seen.add(url);
        const response = await rawGet(port, url);
        expect(response.status, url).toBe(200);
        for (const match of response.body.matchAll(importRe)) {
          const next = match[1]!;
          if (!seen.has(next)) queue.push(next);
        }
      }
      // Se recorrió algo sustancial, incluidos los dos directorios de fuera de src/web.
      expect(seen.size).toBeGreaterThan(30);
      expect([...seen].some((u) => u.includes("/src/shared/") || u.startsWith("/@fs/"))).toBe(true);
    }
  });
});
