import { describe, expect, it } from "vitest";
import {
  ProvenanceMergeError,
  mergeProvenance,
  type ProvenancePart,
} from "../../../src/data/schema/provenance";

const sha = "a".repeat(64);

function part(file: string, overrides: Record<string, unknown> = {}): ProvenancePart {
  return {
    file,
    data: {
      license: "OGL-1.0a",
      category: "spells",
      importerVersion: "1",
      humanReviewed: false,
      pages: [],
      ...overrides,
    },
  };
}

function page(url: string) {
  return { url, sha256: sha, bytes: 10, fetchedAt: "2026-10-16T00:00:00.000Z" };
}

describe("mergeProvenance", () => {
  it("R39: una procedencia con license OGL-1.0a es válida", () => {
    const merged = mergeProvenance([part("provenance/spells.json", { expectedCount: 3 })]);
    expect(merged.license).toBe("OGL-1.0a");
    expect(merged.expectedCount).toBe(3);
  });

  it("R39/R98: license ausente o distinta falla nombrando el fichero", () => {
    const missing = part("provenance/spells/a-c.json");
    delete (missing.data as Record<string, unknown>)["license"];
    expect(() => mergeProvenance([part("provenance/spells/d-h.json"), missing])).toThrow(
      /a-c\.json.*license/,
    );
    expect(() => mergeProvenance([part("x.json", { license: "MIT" })])).toThrow(
      ProvenanceMergeError,
    );
  });

  it("R98: la unión suma expectedCount, fusiona recuentos por lote y ordena páginas", () => {
    const merged = mergeProvenance([
      part("provenance/spells/d-h.json", {
        batch: "d-h",
        expectedCount: 5,
        expectedCountByBatch: { "d-h": 5 },
        pages: [page("https://www.aonprd.com/z")],
      }),
      part("provenance/spells/a-c.json", {
        batch: "a-c",
        expectedCount: 7,
        expectedCountByBatch: { "a-c": 7 },
        pages: [page("https://www.aonprd.com/a")],
        humanReviewed: true,
      }),
    ]);
    expect(merged.expectedCount).toBe(12);
    expect(merged.expectedCountByBatch).toEqual({ "a-c": 7, "d-h": 5 });
    expect(merged.pages.map((p) => p.url)).toEqual([
      "https://www.aonprd.com/a",
      "https://www.aonprd.com/z",
    ]);
    expect(merged.humanReviewed).toBe(false);
  });

  it("R98: lote duplicado, página duplicada y recuento repetido son errores", () => {
    expect(() =>
      mergeProvenance([part("a.json", { batch: "a-c" }), part("b.json", { batch: "a-c" })]),
    ).toThrow(/lote "a-c" duplicado/);
    const p = page("https://www.aonprd.com/a");
    expect(() =>
      mergeProvenance([part("a.json", { pages: [p] }), part("b.json", { pages: [p] })]),
    ).toThrow(/duplicada/);
    expect(() =>
      mergeProvenance([
        part("a.json", { expectedCountByBatch: { x: 1 } }),
        part("b.json", { expectedCountByBatch: { x: 2 } }),
      ]),
    ).toThrow(/repetida/);
  });

  it("une importedKinds y exige la misma categoría", () => {
    const merged = mergeProvenance([
      part("a.json", { category: "magic-items", importedKinds: ["ring"] }),
      part("b.json", { category: "magic-items", importedKinds: ["wand", "ring"] }),
    ]);
    expect(merged.importedKinds).toEqual(["ring", "wand"]);
    expect(() => mergeProvenance([part("a.json"), part("b.json", { category: "feats" })])).toThrow(
      /category/,
    );
  });

  it("sin ficheros es un error", () => {
    expect(() => mergeProvenance([])).toThrow(ProvenanceMergeError);
  });
});
