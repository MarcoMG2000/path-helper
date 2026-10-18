import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getLegalNotice } from "../../src/data/legal";
import { createViteConfig } from "../../vite.config";
import { ROOT } from "../project/helpers";

// R74: el bundle de producción lleva el aviso legal pero NO los datasets de f3 (conjuros, dotes...).
let outDir: string;
let js = "";
let swText = "";

async function listJs(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (e) =>
      e.isDirectory()
        ? listJs(join(dir, e.name))
        : e.name.endsWith(".js")
          ? [join(dir, e.name)]
          : [],
    ),
  );
  return nested.flat();
}

// Primera frase de un texto del dataset, sin comillas ni saltos de línea (para buscarla tal cual).
function fragmentOf(text: string): string {
  const sentence = (text.split(/\.\s/)[0] ?? "").trim();
  expect(sentence.length).toBeGreaterThan(30);
  expect(sentence).not.toMatch(/["'\\\n*]/);
  return sentence;
}

async function firstTextEn(file: string): Promise<string> {
  const entries = JSON.parse(await readFile(join(ROOT, file), "utf8")) as { textEn: string }[];
  return entries[0]!.textEn;
}

beforeAll(async () => {
  outDir = await mkdtemp(join(tmpdir(), "ph-bundle-"));
  await build({
    ...createViteConfig({ HOST: "127.0.0.1", PORT: 3000, WEB_PORT: 5173 }),
    configFile: false,
    logLevel: "silent",
    build: { outDir, emptyOutDir: true },
  });
  const files = await listJs(outDir);
  const contents = await Promise.all(files.map((f) => readFile(f, "utf8")));
  js = contents
    .filter((_, i) => !files[i]!.endsWith("sw.js") && !/workbox/.test(files[i]!))
    .join("\n");
  swText = await readFile(join(outDir, "sw.js"), "utf8");
}, 180_000);

afterAll(async () => {
  if (outDir) await rm(outDir, { recursive: true, force: true });
});

describe("bundle de producción", () => {
  it("R74: incluye el texto de la OGL y la Section 15 (ruta /legal)", () => {
    const notice = getLegalNotice();
    expect(js).toContain("OPEN GAME LICENSE Version 1.0a");
    expect(js).toContain(notice.section15[0]!.replace(/"/g, '\\"'));
    expect(js).toContain(notice.unofficialNotice.slice(0, 60));
  });

  it("R74: no incluye texto de los datasets de f3 (conjuros, dotes) ni de objetos mágicos", async () => {
    const fragments = [
      fragmentOf(await firstTextEn("src/data/spells/f.json")),
      fragmentOf(await firstTextEn("src/data/feats/a.json")),
    ];
    for (const fragment of fragments) expect(js).not.toContain(fragment);
  });

  it("R74: el JS de la aplicación es pequeño (sin datasets de megabytes)", () => {
    const kib = Math.round(Buffer.byteLength(js) / 1024);
    expect(kib).toBeLessThan(1024);
  });

  it("R84: el service worker generado niega el fallback a /api y /health", () => {
    expect(swText).toContain("denylist");
    expect(swText).toContain("^\\/api(\\/|$)");
    expect(swText).toContain("^\\/health$");
  });
});
