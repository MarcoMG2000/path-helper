import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadDataset, loadIntegrityContext } from "../../../scripts/srd/lib/load-dataset";
import { runIntegrity, type IntegrityIssue } from "../../../src/data/integrity";
import { GlossaryEntrySchema } from "../../../src/data/schema/glossary";
import { ProvenanceSchema } from "../../../src/data/schema/provenance";
import { CRB_CLASS_IDS, SpellSchema, type Spell } from "../../../src/data/schema/spell";
import { SummaryFileSchema, checkNumericFidelity } from "../../../src/data/schema/summary";
import { classifySpellFields } from "../../../src/data/spells/fields";
import { compareSpellToGolden, goldenIdsInRange, loadSpellGoldens } from "./golden";

// Datos reales del Lote D2 (conjuros del CRB con inicial e-k, R20). Solo lee `src/data`; no usa red.
// El recuento esperado sale de la procedencia del lote (congelado por `data:import`) y de
// `scripts/srd/config/spell-batches.json` (R99).

const ROOT = resolve(import.meta.dirname, "../../..");
const FROM = "e";
const TO = "k";
const BATCH = "e-k";
const SHARDS = ["e", "f", "g", "h", "i", "j", "k"] as const;
const inRange = (id: string): boolean => id[0]! >= FROM && id[0]! <= TO;

const readJson = (relative: string): unknown =>
  JSON.parse(readFileSync(resolve(ROOT, "src/data", relative), "utf8"));

const { data, issues: loadIssues } = loadDataset(ROOT, ["spells"]);
const ctx = loadIntegrityContext(ROOT);
const allRaw = (data.entries.spells ?? []) as Record<string, unknown>[];
const origins = data.origins?.spells ?? [];
const rawInRange = allRaw.filter((_, i) => SHARDS.some((s) => origins[i] === `spells/${s}.json`));
const spells = rawInRange.map((raw) => SpellSchema.parse(raw));
const provenance = ProvenanceSchema.parse(readJson(`provenance/spells/${BATCH}.json`));
const batchConfig = JSON.parse(
  readFileSync(resolve(ROOT, "scripts/srd/config/spell-batches.json"), "utf8"),
) as { expectedCountByBatch: Record<string, number> };

/** Hallazgos de integridad que afectan a los conjuros de este rango (R96, R92, formato...). */
function rangeIssues(): IntegrityIssue[] {
  const found = runIntegrity(data, ctx, { categories: ["spells"] });
  return found.filter((issue) => issue.id === undefined || inRange(issue.id));
}

describe("conjuros e-k: recuento y procedencia (R20, R26, R99)", () => {
  it("carga los datos sin errores de lectura", () => {
    expect(loadIssues).toEqual([]);
  });

  it("el recuento es igual al congelado en la procedencia del lote", () => {
    const expected = provenance.expectedCountByBatch?.[BATCH];
    expect(expected).toBe(142);
    expect(spells).toHaveLength(expected!);
    expect(provenance.pages).toHaveLength(expected!);
  });

  it("coincide con el recuento del reparto de lotes (spell-batches.json)", () => {
    expect(batchConfig.expectedCountByBatch[BATCH]).toBe(spells.length);
  });

  it("la procedencia es del lote, sin recuento total (lo suma TD.6)", () => {
    expect(provenance.batch).toBe(BATCH);
    expect(provenance.expectedCount).toBeUndefined();
    expect(provenance.license).toBe("OGL-1.0a");
  });

  it("cada página de la procedencia corresponde a un conjuro (fuente) y viceversa", () => {
    const pages = new Set(provenance.pages.map((p) => p.url));
    expect(pages.size).toBe(provenance.pages.length);
    expect(new Set(spells.map((s) => s.source))).toEqual(pages);
  });

  it("solo hay shards con inicial del rango y cada conjuro está en el de su inicial", () => {
    for (const [i, raw] of allRaw.entries()) {
      const file = origins[i]!;
      const letter = /^spells\/([a-z])\.json$/.exec(file)?.[1];
      if (letter === undefined || letter < FROM || letter > TO) continue;
      expect(String(raw["id"])[0], `${raw["id"]} en ${file}`).toBe(letter);
    }
    expect(spells.every((s) => inRange(s.id))).toBe(true);
    expect(new Set(spells.map((s) => s.id)).size).toBe(spells.length);
  });
});

describe("conjuros e-k: esquema y niveles (R20, R27, R91, R101)", () => {
  it("todos pertenecen al CRB y traen la fuente con página", () => {
    for (const spell of spells) {
      expect(spell.book, spell.id).toBe("CRB");
      expect(spell.sourceRef, spell.id).toMatch(/^PRPG Core Rulebook pg\. \d+/);
      expect(spell.textEn.length, spell.id).toBeGreaterThan(0);
      expect(spell.shortDescriptionEn, spell.id).toBeTruthy();
    }
  });

  it("las claves de levels están dentro de CRB_CLASS_IDS y los niveles son 0-9 (R91, R92)", () => {
    const allowed: readonly string[] = CRB_CLASS_IDS;
    for (const spell of spells) {
      const keys = Object.keys(spell.levels);
      expect(keys.length, `${spell.id} sin niveles`).toBeGreaterThan(0);
      for (const key of keys) {
        expect(allowed, `${spell.id}: ${key}`).toContain(key);
        const level = spell.levels[key]!;
        expect(Number.isInteger(level) && level >= 0 && level <= 9, `${spell.id}.${key}`).toBe(
          true,
        );
      }
    }
  });

  it("la escuela es una de las del catálogo (R101)", () => {
    // SpellSchema ya lo valida con z.enum; aquí se comprueba el reparto observado en la fuente.
    const schools = new Set(spells.map((s) => s.school));
    expect([...schools].sort()).toEqual([
      "abjuration",
      "conjuration",
      "divination",
      "enchantment",
      "evocation",
      "illusion",
      "necromancy",
      "transmutation",
    ]);
  });

  it("no queda ningún conjuro marcado para revisión ni con el HTML sin limpiar", () => {
    for (const raw of rawInRange) expect(raw["needsReview"], String(raw["id"])).toBeUndefined();
    for (const spell of spells) expect(spell.textEn, spell.id).not.toMatch(/<\/?[a-z][^>]*>/i);
  });
});

describe("conjuros e-k: campos estructurados (R96)", () => {
  it("cada campo estructurado coincide con classifySpellFields(raw)", () => {
    for (const spell of spells) {
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
      expect(spell.duration, spell.id).toEqual(expected.duration);
      expect(spell.savingThrow, spell.id).toEqual(expected.savingThrow);
      expect(spell.spellResistance, spell.id).toEqual(expected.spellResistance);
      expect(spell.targeting, spell.id).toEqual(expected.targeting);
    }
  });

  it("la regla de integridad de conjuros no halla nada en el rango", () => {
    const spellIssues = rangeIssues().filter(
      (issue) => issue.rule.startsWith("spells.") || issue.rule.startsWith("schema"),
    );
    expect(spellIssues).toEqual([]);
  });

  it("los conjuros de un solo objetivo conocido tienen valores razonables (Fireball)", () => {
    const fireball = spells.find((s) => s.id === "fireball") as Spell;
    expect(fireball.levels).toEqual({ sorcerer: 3, wizard: 3 });
    expect(fireball.range.kind).toBe("long");
    expect(fireball.savingThrow).toMatchObject({ kind: "reflex", effect: "half" });
    expect(fireball.components.material).toBe(true);
  });
});

describe("conjuros e-k: goldens (R20)", () => {
  it("ningún golden de design.md §5 cae en el rango e-k", () => {
    const goldens = loadSpellGoldens();
    const ids = goldenIdsInRange(goldens, FROM, TO);
    expect(ids).toEqual([]);
    for (const id of ids) {
      const spell = spells.find((s) => s.id === id);
      expect(compareSpellToGolden(spell, goldens[id]!), id).toEqual([]);
    }
  });
});

describe("conjuros e-k: capa ES (R28-R31, R33)", () => {
  const summaries = SHARDS.flatMap((shard) =>
    Object.entries(SummaryFileSchema.parse(readJson(`summaries/spells/${shard}.json`))),
  );
  const glossary = SHARDS.flatMap((shard) =>
    Object.entries(readJson(`glossary/spells/${shard}.es.json`) as Record<string, unknown>),
  );

  it("hay un resumen por conjuro, sin huérfanos ni duplicados (R28, R29)", () => {
    expect(summaries).toHaveLength(spells.length);
    expect(new Set(summaries.map(([id]) => id))).toEqual(new Set(spells.map((s) => s.id)));
  });

  it("los resúmenes son borradores y sus cifras salen del textEn (R30)", () => {
    for (const [id, summary] of summaries) {
      expect(summary.status, id).toBe("draft");
      const spell = spells.find((s) => s.id === id)!;
      expect(checkNumericFidelity(summary.summaryEs, spell.textEn), id).toEqual([]);
    }
  });

  it("cada conjuro tiene su clave de glosario, todo borrador no verificado (R31, R32, R33)", () => {
    expect(glossary).toHaveLength(spells.length);
    expect(new Set(glossary.map(([key]) => key))).toEqual(
      new Set(spells.map((s) => `spells:${s.id}`)),
    );
    for (const [key, raw] of glossary) {
      const entry = GlossaryEntrySchema.parse(raw);
      expect(entry, key).toMatchObject({ verified: false, origin: "draft", kind: "entry" });
    }
  });

  it("las reglas de resúmenes y glosario no informan nada de este rango", () => {
    const layerIssues = rangeIssues().filter(
      (issue) => issue.rule.startsWith("summaries.") || issue.rule.startsWith("glossary."),
    );
    // Las claves de glosario de otros lotes y el fichero generado los cierra TZ.2 (no son de D2).
    expect(layerIssues.filter((issue) => issue.id === undefined || inRange(issue.id))).toEqual([]);
  });
});
