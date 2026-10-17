import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadDataset, loadIntegrityContext } from "../../../scripts/srd/lib/load-dataset";
import { runIntegrity } from "../../../src/data/integrity";
import { CRB_CLASS_IDS, SPELL_SCHOOLS, SpellSchema } from "../../../src/data/schema/spell";
import { classifySpellFields } from "../../../src/data/spells/fields";
import { compareSpellToGolden, goldenIdsInRange, loadSpellGoldens } from "./golden";

// Datos reales del Lote D3 (conjuros cuyo id empieza por l-r): R20, R26, R28-R31, R33, R91, R96, R101.
// Solo lee los shards l.json..r.json y la procedencia del lote; no usa red (R50).

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const INITIALS = ["l", "m", "n", "o", "p", "q", "r"];
const COUNT_BY_INITIAL: Record<string, number> = {
  l: 10,
  m: 45,
  n: 3,
  o: 7,
  p: 47,
  q: 1,
  r: 33,
};

interface Loaded {
  spells: Record<string, unknown>[];
  provenance: Record<string, unknown>;
}

function load(): Loaded {
  const { data } = loadDataset(ROOT, ["spells"]);
  const origins = data.origins?.["spells"] ?? [];
  const all = data.entries["spells"] ?? [];
  const spells = all.filter((_, i) =>
    INITIALS.some((c) => origins[i]?.endsWith(`spells/${c}.json`)),
  ) as Record<string, unknown>[];
  const part = (data.provenanceParts["spells"] ?? []).find(
    (p) => (p.data as { batch?: string }).batch === "l-r",
  );
  return { spells, provenance: (part?.data ?? {}) as Record<string, unknown> };
}

const { spells, provenance } = load();

describe("conjuros l-r, datos reales (D3)", () => {
  it("R26 R99: el recuento es el congelado en la procedencia del lote", () => {
    const expected = (provenance["expectedCountByBatch"] as Record<string, number>)["l-r"];
    expect(expected).toBe(146);
    expect(spells).toHaveLength(expected!);
    expect(new Set(spells.map((s) => s["id"])).size).toBe(spells.length);
  });

  it("R26: el recuento por inicial coincide con el índice de la fuente", () => {
    for (const [initial, count] of Object.entries(COUNT_BY_INITIAL)) {
      const n = spells.filter((s) => String(s["id"])[0] === initial).length;
      expect(n, initial).toBe(count);
    }
  });

  it("R20 R101: cada conjuro supera SpellSchema, es del CRB y tiene escuela del catálogo", () => {
    for (const spell of spells) {
      const parsed = SpellSchema.safeParse(spell);
      expect(parsed.success, String(spell["id"])).toBe(true);
      expect(spell["book"]).toBe("CRB");
      expect(SPELL_SCHOOLS as readonly string[]).toContain(spell["school"]);
    }
  });

  it("cada id empieza por una inicial del rango l-r", () => {
    for (const spell of spells) expect(String(spell["id"])[0]).toMatch(/^[l-r]$/);
  });

  it("R91: las claves de levels son clases del CRB y los niveles van de 0 a 9", () => {
    for (const spell of spells) {
      const levels = spell["levels"] as Record<string, number>;
      const keys = Object.keys(levels);
      expect(keys.length, String(spell["id"])).toBeGreaterThan(0);
      for (const key of keys) {
        expect(CRB_CLASS_IDS as readonly string[], `${String(spell["id"])}.${key}`).toContain(key);
        expect(Number.isInteger(levels[key])).toBe(true);
        expect(levels[key]).toBeGreaterThanOrEqual(0);
        expect(levels[key]).toBeLessThanOrEqual(9);
      }
    }
  });

  it("R96: los campos estructurados coinciden con classifySpellFields(raw)", () => {
    for (const s of spells) {
      const spell = SpellSchema.parse(s);
      const expected = classifySpellFields({
        castingTime: spell.castingTime.raw,
        components: spell.components.raw,
        range: spell.range.raw,
        targeting: spell.targeting,
        duration: spell.duration.raw,
        savingThrow: spell.savingThrow.raw,
        spellResistance: spell.spellResistance.raw,
      });
      expect(spell.castingTime, spell.id).toEqual(expected.castingTime);
      expect(spell.components, spell.id).toEqual(expected.components);
      expect(spell.range, spell.id).toEqual(expected.range);
      expect(spell.targeting, spell.id).toEqual(expected.targeting);
      expect(spell.duration, spell.id).toEqual(expected.duration);
      expect(spell.savingThrow, spell.id).toEqual(expected.savingThrow);
      expect(spell.spellResistance, spell.id).toEqual(expected.spellResistance);
    }
  });

  it("R45 R46: Mislead (Target/Effect) y Reincarnate (h2 de otro libro sin Source) se importan", () => {
    const mislead = spells.find((s) => s["id"] === "mislead") as Record<string, unknown>;
    const reincarnate = spells.find((s) => s["id"] === "reincarnate") as Record<string, unknown>;
    expect(mislead).toBeDefined();
    expect(reincarnate).toBeDefined();
    expect(mislead["targeting"]).toEqual([{ kind: "other", raw: "you/one illusory double" }]);
    expect(String(reincarnate["sourceRef"])).toContain("PRPG Core Rulebook");
    // El contenido de «Inner Sea Races» no se cuela en el texto del conjuro.
    expect(String(reincarnate["textEn"])).not.toContain("Reincarnation on Golarion");
    expect(String(reincarnate["textEn"])).not.toContain("Other Incarnations");
  });

  it("R96 R92 R28-R33: la integridad (datos y capa ES) no halla problemas en el rango", () => {
    const { data } = loadDataset(ROOT, ["spells"]);
    const found = runIntegrity(data, loadIntegrityContext(ROOT), { categories: ["spells"] });
    // Se descartan los hallazgos de otros rangos y los globales (glossary.stale lo cierra Z).
    const mine = found.filter(
      (f) => INITIALS.includes(String(f.id ?? "")[0] ?? "") && f.rule !== "glossary.stale",
    );
    expect(mine).toEqual([]);
  });

  it("R28 R29 R31 R33: cada conjuro tiene resumen y glosario en borrador, sin verificar", () => {
    const { data } = loadDataset(ROOT, ["spells"]);
    const summaries = new Map<string, { summaryEs: string; status: string }>();
    for (const part of data.summaryParts["spells"] ?? []) {
      for (const [id, v] of Object.entries(part.data as Record<string, never>)) {
        summaries.set(id, v);
      }
    }
    const glossary = new Map<string, { verified: boolean; origin: string }>();
    for (const shard of data.glossary.shards) {
      for (const [key, v] of Object.entries(shard.data as Record<string, never>)) {
        glossary.set(key, v);
      }
    }
    for (const spell of spells) {
      const id = String(spell["id"]);
      const summary = summaries.get(id);
      expect(summary, `resumen ${id}`).toBeDefined();
      expect(summary!.status).toBe("draft");
      expect(summary!.summaryEs.length).toBeLessThanOrEqual(300);
      const entry = glossary.get(`spells:${id}`);
      expect(entry, `glosario ${id}`).toBeDefined();
      expect(entry!.verified).toBe(false);
      expect(entry!.origin).toBe("draft");
    }
  });

  it("R20: los goldens de design.md §5 cuya inicial cae en l-r coinciden", () => {
    const goldens = loadSpellGoldens();
    const ids = goldenIdsInRange(goldens, "l", "r");
    expect(ids).toEqual(["magic-missile"]);
    for (const id of ids) {
      const spell = spells.find((s) => s["id"] === id);
      expect(spell, id).toBeDefined();
      expect(compareSpellToGolden(spell, goldens[id]!), id).toEqual([]);
    }
  });
});
