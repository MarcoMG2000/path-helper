import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createFetchCache, sha256Of } from "../../../scripts/srd/lib/fetch-cache";
import { stableStringify } from "../../../scripts/srd/lib/json";
import {
  DriftError,
  loadCachedPages,
  mergeProvenance,
  provenanceFile,
  readMergedProvenance,
  readProvenanceParts,
  selectParts,
  updateProvenance,
  verifyProvenance,
} from "../../../scripts/srd/lib/provenance";
import { fakeClock, fakeFetch, tempDir, writeFile } from "../helpers";

const URL_A = "https://www.aonprd.com/FeatDisplay.aspx?ItemName=Cleave";
const URL_B = "https://www.aonprd.com/FeatDisplay.aspx?ItemName=Power%20Attack";

function page(url: string, body: string) {
  return { url, sha256: sha256Of(body), bytes: body.length, fetchedAt: "2026-10-16T00:00:00.000Z" };
}

describe("provenance: escritura (R42, R39)", () => {
  it("R42/R39: registra url, sha256, bytes y fecha con license OGL-1.0a", () => {
    const data = tempDir();
    updateProvenance({ dataDir: data, category: "feats", pages: [page(URL_A, "aaa")] });
    const json = JSON.parse(readFileSync(provenanceFile(data, "feats"), "utf8"));
    expect(json).toMatchObject({
      license: "OGL-1.0a",
      category: "feats",
      humanReviewed: false,
      pages: [{ url: URL_A, sha256: sha256Of("aaa"), bytes: 3 }],
    });
    expect(json.pages[0].fetchedAt).toBeTypeOf("string");
  });

  it("R42: reescribir conserva humanReviewed y reemplaza la página por URL; salida ordenada", () => {
    const data = tempDir();
    updateProvenance({
      dataDir: data,
      category: "feats",
      pages: [page(URL_B, "b"), page(URL_A, "a")],
    });
    const file = provenanceFile(data, "feats");
    const edited = {
      ...JSON.parse(readFileSync(file, "utf8")),
      humanReviewed: true,
      reviewedBy: "m",
    };
    writeFile(data, "provenance/feats.json", stableStringify(edited));
    updateProvenance({ dataDir: data, category: "feats", pages: [page(URL_A, "a2")] });
    const json = JSON.parse(readFileSync(file, "utf8"));
    expect(json.humanReviewed).toBe(true);
    expect(json.reviewedBy).toBe("m");
    expect(json.pages.map((p: { url: string }) => p.url)).toEqual([URL_A, URL_B]);
    expect(json.pages[0].sha256).toBe(sha256Of("a2"));
  });

  it("R26: los recuentos esperados se congelan; un valor distinto se informa y no se pisa", () => {
    const data = tempDir();
    updateProvenance({ dataDir: data, category: "feats", expectations: { expectedCount: 10 } });
    const again = updateProvenance({
      dataDir: data,
      category: "feats",
      expectations: { expectedCount: 12 },
    });
    expect(again.frozenMismatches).toEqual(["expectedCount: congelado 10, observado 12"]);
    expect(readMergedProvenance(data, "feats")?.expectedCount).toBe(10);
  });

  it("importedKinds se acumulan y expectedCountByKind se congela por clave", () => {
    const data = tempDir();
    updateProvenance({
      dataDir: data,
      category: "magic-items",
      expectations: { expectedCountByKind: { ring: 3 } },
      patch: { importedKinds: ["ring"] },
    });
    const r = updateProvenance({
      dataDir: data,
      category: "magic-items",
      expectations: { expectedCountByKind: { ring: 4, wand: 2 } },
      patch: { importedKinds: ["wand"] },
    });
    expect(r.frozenMismatches).toHaveLength(1);
    const merged = readMergedProvenance(data, "magic-items");
    expect(merged?.expectedCountByKind).toEqual({ ring: 3, wand: 2 });
    expect(merged?.importedKinds).toEqual(["ring", "wand"]);
  });
});

describe("provenance: lectura por lotes (R98)", () => {
  it("R98: la unión de <cat>/<lote>.json y de <cat>.json es el fichero de la categoría", () => {
    const data = tempDir();
    updateProvenance({
      dataDir: data,
      category: "spells",
      batch: "a-c",
      pages: [page(URL_A, "a")],
      expectations: { expectedCount: 2, expectedCountByBatch: { "a-c": 2 } },
    });
    updateProvenance({
      dataDir: data,
      category: "spells",
      batch: "d-h",
      pages: [page(URL_B, "b")],
      expectations: { expectedCount: 3, expectedCountByBatch: { "d-h": 3 } },
    });
    const parts = readProvenanceParts(data, "spells");
    expect(parts.map((p) => p.file)).toEqual([
      "provenance/spells/a-c.json",
      "provenance/spells/d-h.json",
    ]);
    const merged = readMergedProvenance(data, "spells");
    expect(merged?.expectedCount).toBe(5);
    expect(merged?.pages).toHaveLength(2);
    // un fichero único de la categoría también cuenta como parte
    writeFile(
      data,
      "provenance/spells.json",
      stableStringify({
        license: "OGL-1.0a",
        category: "spells",
        importerVersion: "1",
        humanReviewed: false,
        pages: [],
        expectedCount: 1,
      }),
    );
    expect(readMergedProvenance(data, "spells")?.expectedCount).toBe(6);
  });

  it("R98: un lote sin license falla al leer la unión; un lote duplicado también", () => {
    const data = tempDir();
    writeFile(
      data,
      "provenance/spells/a-c.json",
      stableStringify({
        category: "spells",
        importerVersion: "1",
        humanReviewed: false,
        pages: [],
      }),
    );
    expect(() => readMergedProvenance(data, "spells")).toThrow(/a-c\.json.*license/);

    const dup = tempDir();
    for (const name of ["x", "y"]) {
      writeFile(
        dup,
        `provenance/spells/${name}.json`,
        stableStringify({
          license: "OGL-1.0a",
          category: "spells",
          batch: "a-c",
          importerVersion: "1",
          humanReviewed: false,
          pages: [],
        }),
      );
    }
    expect(() => readMergedProvenance(dup, "spells")).toThrow(/duplicado/);
  });

  it("selectParts: con subconjunto en categorías por lotes usa el lote y el índice", () => {
    const mk = (batch: string) => ({ file: `${batch}.json`, data: { batch } });
    const parts = [mk("index"), mk("a-c"), mk("d-h")];
    expect(selectParts(parts, true, "a-c").map((p) => p.file)).toEqual(["index.json", "a-c.json"]);
    expect(selectParts(parts, true, undefined)).toHaveLength(3);
    expect(selectParts(parts, false, "a-c")).toHaveLength(3);
  });

  it("mergeProvenance está reexportada", () => {
    expect(typeof mergeProvenance).toBe("function");
  });
});

describe("loadCachedPages / verify (R47, R48)", () => {
  function setup(bodies: Record<string, string>) {
    const clock = fakeClock();
    const root = tempDir();
    const ff = fakeFetch((url) => ({ status: 200, body: bodies[url] ?? "" }), clock);
    const cache = createFetchCache({ cacheDir: join(root, "cache"), fetch: ff.fetch, clock });
    return { cache, ff, root };
  }

  it("R47: sha256 distinto al registrado hace fallar y --accept-drift lo permite", async () => {
    const { cache } = setup({ [URL_A]: "contenido nuevo" });
    await cache.get(URL_A);
    const registered = [page(URL_A, "contenido antiguo")];
    expect(() => loadCachedPages(cache, registered)).toThrow(DriftError);
    expect(() => loadCachedPages(cache, registered)).toThrow(/FeatDisplay\.aspx\?ItemName=Cleave/);
    const ok = loadCachedPages(cache, registered, { acceptDrift: true });
    expect(ok.drifted).toEqual([URL_A]);
    expect(ok.pages).toHaveLength(1);
  });

  it("R43: páginas coincidentes se leen sin red; las ausentes se listan", async () => {
    const { cache, ff } = setup({ [URL_A]: "a" });
    await cache.get(URL_A);
    const calls = ff.calls.length;
    const loaded = loadCachedPages(cache, [page(URL_A, "a"), page(URL_B, "b")]);
    expect(loaded.pages.map((p) => p.url)).toEqual([URL_A]);
    expect(loaded.missing).toEqual([URL_B]);
    expect(ff.calls).toHaveLength(calls);
  });

  it("R48: verify lista las páginas que difieren y no modifica src/data ni la caché", async () => {
    const { cache, root } = setup({ [URL_A]: "cambiado", [URL_B]: "igual" });
    const data = join(root, "src", "data");
    const result = await verifyProvenance(cache, [page(URL_A, "original"), page(URL_B, "igual")]);
    expect(result.checked).toBe(2);
    expect(result.differing).toEqual([
      { url: URL_A, registered: sha256Of("original"), current: sha256Of("cambiado") },
    ]);
    expect(result.failed).toEqual([]);
    expect(cache.has(URL_A)).toBe(false);
    expect(() => readFileSync(join(data, "provenance", "feats.json"))).toThrow();
  });

  it("R48: los fallos de red se listan aparte", async () => {
    const clock = fakeClock();
    const ff = fakeFetch(() => ({ status: 404 }), clock);
    const cache = createFetchCache({ cacheDir: tempDir(), fetch: ff.fetch, clock });
    const result = await verifyProvenance(cache, [page(URL_A, "a")]);
    expect(result.failed).toHaveLength(1);
    expect(result.differing).toEqual([]);
  });
});
