import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CRB_CLASS_IDS } from "../../../src/data/schema/spell";
import {
  batchOfInitial,
  loadSpellBatches,
  loadSpellClassCatalog,
  parseLevelLine,
  parseSpellBatches,
  parseSpellClassCatalog,
} from "../../../scripts/srd/parsers/spells-config";
import { planSpellSeeds } from "../../../scripts/srd/parsers/spells-seeds";
import {
  CRB_SOURCE_URL,
  SPELL_INDEX_URL,
  extractCrbSpells,
  spellPageUrl,
} from "../../../scripts/srd/parsers/spells";

const CONFIG = resolve(__dirname, "../../../scripts/srd/config");
const read = (name: string): unknown => JSON.parse(readFileSync(resolve(CONFIG, name), "utf8"));

describe("spell-batches.json (R99)", () => {
  it("la configuración real: rangos contiguos, disjuntos y que cubren a-z", () => {
    const config = loadSpellBatches();
    const letters = "abcdefghijklmnopqrstuvwxyz".split("");
    const owner = letters.map((l) => batchOfInitial(config, l));
    expect(owner.every((id) => id !== undefined)).toBe(true);
    // Cada letra tiene exactamente un lote.
    for (const letter of letters) {
      const hits = config.batches.filter((b) => letter >= b.from && letter <= b.to);
      expect(hits, letter).toHaveLength(1);
    }
    expect(config.batches[0]!.from).toBe("a");
    expect(config.batches.at(-1)!.to).toBe("z");
    expect(Object.keys(config.expectedCountByBatch).sort()).toEqual(
      config.batches.map((b) => b.id).sort(),
    );
  });

  it("los recuentos esperados sumen un total plausible y coincidan con las semillas de seeds.json", () => {
    const config = loadSpellBatches();
    const seeds = read("seeds.json") as {
      spells: { subsets: Record<string, string[]> };
    };
    let total = 0;
    const all = new Set<string>();
    for (const batch of config.batches) {
      const urls = seeds.spells.subsets[batch.id] ?? [];
      expect(urls.length, batch.id).toBe(config.expectedCountByBatch[batch.id]);
      for (const url of urls) {
        expect(url.startsWith(spellPageUrl("")), url).toBe(true);
        const name = new URL(url).searchParams.get("ItemName")!;
        const initial = name.toLowerCase().replace(/[^a-z0-9]/g, "")[0]!;
        expect(batchOfInitial(config, initial), url).toBe(batch.id);
        expect(all.has(url), `duplicada ${url}`).toBe(false);
        all.add(url);
      }
      total += urls.length;
    }
    expect(total).toBe(all.size);
    expect(seeds.spells.subsets["index"]).toEqual([SPELL_INDEX_URL, CRB_SOURCE_URL]);
  });

  it("rechaza solapes, huecos, rangos invertidos y recuentos de más o de menos", () => {
    const base = {
      batches: [
        { id: "a-m", from: "a", to: "m" },
        { id: "n-z", from: "n", to: "z" },
      ],
      expectedCountByBatch: { "a-m": 1, "n-z": 1 },
    };
    expect(() => parseSpellBatches(base)).not.toThrow();
    const solape = {
      ...base,
      batches: [
        { id: "a-m", from: "a", to: "m" },
        { id: "m-z", from: "m", to: "z" },
      ],
      expectedCountByBatch: { "a-m": 1, "m-z": 1 },
    };
    expect(() => parseSpellBatches(solape)).toThrow(/contiguos/);
    const hueco = {
      ...base,
      batches: [
        { id: "a-k", from: "a", to: "k" },
        { id: "n-z", from: "n", to: "z" },
      ],
      expectedCountByBatch: { "a-k": 1, "n-z": 1 },
    };
    expect(() => parseSpellBatches(hueco)).toThrow(/contiguos/);
    const corto = {
      batches: [{ id: "a-y", from: "a", to: "y" }],
      expectedCountByBatch: { "a-y": 1 },
    };
    expect(() => parseSpellBatches(corto)).toThrow(/llegar a "z"/);
    const invertido = {
      batches: [{ id: "z-a", from: "z", to: "a" }],
      expectedCountByBatch: { "z-a": 1 },
    };
    expect(() => parseSpellBatches(invertido)).toThrow();
    expect(() => parseSpellBatches({ ...base, expectedCountByBatch: { "a-m": 1 } })).toThrow(
      /una clave por lote/,
    );
  });
});

describe("planSpellSeeds (R93)", () => {
  it("reparte los conjuros del filtro CRB entre los lotes sin perder ni duplicar ninguno", () => {
    const html = readFileSync(
      resolve(__dirname, "../../fixtures/srd-html/spells/index-crb-source.html"),
      "utf8",
    );
    const crb = extractCrbSpells(html);
    const batches = parseSpellBatches({
      batches: [
        { id: "a-b", from: "a", to: "b" },
        { id: "c-z", from: "c", to: "z" },
      ],
      expectedCountByBatch: { "a-b": 3, "c-z": 4 },
    });
    const plan = planSpellSeeds(crb, batches, {});
    expect(plan.counts).toEqual({ "a-b": 3, "c-z": 4 });
    expect(plan.byBatch["c-z"]).toContain(spellPageUrl("Wish"));
    expect(plan.index).toEqual([SPELL_INDEX_URL, CRB_SOURCE_URL]);
  });
});

describe("spell-class-ids.json (R94, R97)", () => {
  it("la configuración real es válida y su grupo CRB coincide con CRB_CLASS_IDS", () => {
    const catalog = loadSpellClassCatalog();
    expect([...catalog.crbClassIds].sort()).toEqual([...CRB_CLASS_IDS].sort());
    expect(catalog.abbreviations["sor/wiz"]).toEqual(["sorcerer", "wizard"]);
    // Clases de otros libros observadas en las páginas y en el menú de AoN.
    for (const id of ["alchemist", "witch", "summoner (unchained)", "redmantisassassin"]) {
      expect(catalog.nonCrbClassIds).toContain(id);
    }
  });

  it("rechaza grupos solapados, mayúsculas y abreviaturas a clases no CRB", () => {
    const ok = loadSpellClassCatalog();
    expect(() =>
      parseSpellClassCatalog({ ...ok, nonCrbClassIds: [...ok.nonCrbClassIds, "bard"] }),
    ).toThrow();
    expect(() => parseSpellClassCatalog({ ...ok, nonCrbClassIds: ["Witch"] })).toThrow(
      /minúsculas/,
    );
    expect(() => parseSpellClassCatalog({ ...ok, abbreviations: { "x/y": ["witch"] } })).toThrow(
      /no es CRB/,
    );
    expect(() => parseSpellClassCatalog({ ...ok, crbClassIds: ok.crbClassIds.slice(1) })).toThrow(
      /CRB_CLASS_IDS/,
    );
  });
});

describe("parseLevelLine (R94, R97)", () => {
  const catalog = loadSpellClassCatalog();

  it("R94: expande sor/wiz y sorcerer/wizard a las dos claves", () => {
    expect(parseLevelLine("sor/wiz 3", catalog).levels).toEqual({ sorcerer: 3, wizard: 3 });
    expect(parseLevelLine("sorcerer/wizard 0", catalog).levels).toEqual({ sorcerer: 0, wizard: 0 });
  });

  it("clases CRB sueltas y claves ordenadas", () => {
    const { levels } = parseLevelLine("wizard 1, cleric 2, bard 3", catalog);
    expect(Object.keys(levels)).toEqual(["bard", "cleric", "wizard"]);
  });

  it("R97: descarta y devuelve las clases de otros libros, también con paréntesis", () => {
    const result = parseLevelLine(
      "alchemist 1, redmantisassassin 3, summoner (unchained) 2, sorcerer 1",
      catalog,
    );
    expect(result.levels).toEqual({ sorcerer: 1 });
    expect(result.discarded).toEqual(["alchemist", "redmantisassassin", "summoner (unchained)"]);
  });

  it("R97: un token desconocido falla y lo nombra", () => {
    expect(() => parseLevelLine("wizard 1, ninja 2", catalog)).toThrow(/ninja/);
    expect(() => parseLevelLine("fire domain 2", catalog)).toThrow(/fire domain/);
  });

  it("falla ante niveles ilegibles, fuera de 0-9 o contradictorios", () => {
    expect(() => parseLevelLine("wizard", catalog)).toThrow(/ilegible/);
    expect(() => parseLevelLine("wizard 10", catalog)).toThrow(/0-9/);
    expect(() => parseLevelLine("wizard 1, sor/wiz 2", catalog)).toThrow(/niveles 1 y 2/);
    expect(parseLevelLine("wizard 2, sor/wiz 2", catalog).levels).toEqual({
      sorcerer: 2,
      wizard: 2,
    });
  });

  it("una línea vacía da levels vacío", () => {
    expect(parseLevelLine("", catalog)).toEqual({ levels: {}, discarded: [] });
  });
});
