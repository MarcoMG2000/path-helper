import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CATEGORIES, CATEGORY_REGISTRY, getCategory } from "../../src/data/categories";
import { CATEGORY_IDS } from "../../src/data/schema/common";
import { ROOT } from "../project/helpers";

describe("registro de categorías", () => {
  it("R1: registra exactamente las 13 categorías, en orden, con schema y rutas", () => {
    expect(CATEGORIES.map((c) => c.id)).toEqual([...CATEGORY_IDS]);
    expect(CATEGORIES).toHaveLength(13);
    for (const def of CATEGORIES) {
      expect(CATEGORY_REGISTRY[def.id], def.id).toBe(def);
      expect(typeof def.schema.safeParse, def.id).toBe("function");
      expect(def.shardPatterns.length, def.id).toBeGreaterThan(0);
      expect(def.dir, def.id).toMatch(/^[a-z-]+$/);
      expect(def.summaryDir, def.id).toBe(`summaries/${def.id}`);
      expect(["entries", "record"]).toContain(def.shape);
    }
  });

  it("R1: los nombres de dataset son únicos y camelCase", () => {
    const names = CATEGORIES.map((c) => c.dataset);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z][A-Za-z]*$/);
  });

  it("R63: magic-items está registrada (dataset magicItems) con ficheros por kind", () => {
    const def = getCategory("magic-items");
    expect(def.dataset).toBe("magicItems");
    expect(def.shape).toBe("entries");
    expect(def.shardPatterns).toEqual(["magic-items/*.json"]);
  });

  it("R1: solo spell-lists tiene forma de registro; spells es por lotes", () => {
    expect(CATEGORIES.filter((c) => c.shape === "record").map((c) => c.id)).toEqual([
      "spell-lists",
    ]);
    expect(getCategory("spells").batched).toBe(true);
    expect(getCategory("spells").shardExclude).toEqual(["spells/lists.json"]);
    expect(getCategory("class-features").dottedIds).toBe(true);
  });

  it("R1: cada categoría tiene su index.ts generado y se carga de forma perezosa", async () => {
    for (const def of CATEGORIES) {
      expect(existsSync(resolve(ROOT, "src", "data", def.dir, "index.ts")), def.id).toBe(true);
      const loaded = await def.loadShards();
      expect(Array.isArray(loaded.SHARDS), def.id).toBe(true);
      expect(Array.isArray(loaded.SUMMARIES), def.id).toBe(true);
    }
  });
});
