import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadDataset, loadIntegrityContext } from "../../../scripts/srd/lib/load-dataset";
import { runIntegrity } from "../../../src/data/integrity";
import { CRB_CLASS_IDS, SPELL_SCHOOLS, SpellSchema } from "../../../src/data/schema/spell";
import { classifySpellFields } from "../../../src/data/spells/fields";
import { compareSpellToGolden, goldenIdsInRange, loadSpellGoldens } from "./golden";

// Datos reales del Lote D4 (conjuros cuyo id empieza por s-z): R20, R26, R91, R96, R101.
// Solo lee los shards s.json..z.json y la procedencia del lote; no usa red (R50).

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const INITIALS = ["s", "t", "u", "v", "w", "z"];

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
    (p) => (p.data as { batch?: string }).batch === "s-z",
  );
  return { spells, provenance: (part?.data ?? {}) as Record<string, unknown> };
}

const { spells, provenance } = load();

describe("conjuros s-z, datos reales (D4)", () => {
  it("R26 R99: el recuento es el congelado en la procedencia del lote", () => {
    const expected = (provenance["expectedCountByBatch"] as Record<string, number>)["s-z"];
    expect(expected).toBe(163);
    expect(spells).toHaveLength(expected!);
    expect(new Set(spells.map((s) => s["id"])).size).toBe(spells.length);
  });

  it("R20 R101: cada conjuro supera SpellSchema, es del CRB y tiene escuela del catálogo", () => {
    for (const spell of spells) {
      const parsed = SpellSchema.safeParse(spell);
      expect(parsed.success, String(spell["id"])).toBe(true);
      expect(spell["book"]).toBe("CRB");
      expect(SPELL_SCHOOLS as readonly string[]).toContain(spell["school"]);
    }
  });

  it("cada id empieza por una inicial del rango s-z", () => {
    for (const spell of spells) expect(String(spell["id"])[0]).toMatch(/^[s-z]$/);
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

  it("R28 R29 R30 R31 R33 R96 R92: la integridad (datos y capa ES) no halla problemas en el rango", () => {
    const { data } = loadDataset(ROOT, ["spells"]);
    const found = runIntegrity(data, loadIntegrityContext(ROOT), { categories: ["spells"] });
    // Solo se descartan los hallazgos de otros lotes (ids con otra inicial) y los globales.
    const mine = found.filter((f) => INITIALS.includes(String(f.id ?? "")[0] ?? ""));
    expect(mine).toEqual([]);
  });

  it("R20: los goldens de design.md §5 cuya inicial cae en s-z coinciden", () => {
    const goldens = loadSpellGoldens();
    const ids = goldenIdsInRange(goldens, "s", "z");
    expect(ids).toEqual(["wish"]);
    for (const id of ids) {
      const spell = spells.find((s) => s["id"] === id);
      expect(spell, id).toBeDefined();
      expect(compareSpellToGolden(spell, goldens[id]!), id).toEqual([]);
    }
  });

  it("R28 R29 R31 R33: cada conjuro tiene resumen y glosario en borrador, sin verificar", () => {
    const { data } = loadDataset(ROOT, ["spells"]);
    const summaries: Record<string, { status?: string }> = {};
    for (const part of data.summaryParts["spells"] ?? []) {
      Object.assign(summaries, part.data as Record<string, { status?: string }>);
    }
    const glossary: Record<string, { verified?: boolean; origin?: string; kind?: string }> = {};
    for (const shard of data.glossary.shards) {
      Object.assign(glossary, shard.data as typeof glossary);
    }
    for (const spell of spells) {
      const id = String(spell["id"]);
      expect(summaries[id]?.status, id).toBe("draft");
      expect(glossary[`spells:${id}`], id).toMatchObject({
        verified: false,
        origin: "draft",
        kind: "entry",
      });
    }
  });
});
