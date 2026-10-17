import { describe, expect, it } from "vitest";
import { loadDataset, loadIntegrityContext } from "../../scripts/srd/lib/load-dataset";
import { mergeProvenance } from "../../src/data/schema/provenance";
import { runIntegrity } from "../../src/data/integrity";
import type { ClassEntry } from "../../src/data/schema/class";
import type { ClassFeature } from "../../src/data/schema/class-feature";
import { ROOT } from "../project/helpers";
import golden from "./fixtures/class-golden.json";

// Datos reales de `classes` y `class-features` (importados de Archives of Nethys con los parsers
// del Lote A). Los valores de referencia salen del spec (design.md §5) y de la propia fuente.
const CATEGORIES = ["classes", "class-features"] as const;
const { data, issues: loadIssues } = loadDataset(ROOT, [...CATEGORIES]);
const classes = (data.entries.classes ?? []) as ClassEntry[];
const features = (data.entries["class-features"] ?? []) as ClassFeature[];
const classById = new Map(classes.map((c) => [c.id, c] as const));
const featureById = new Map(features.map((f) => [f.id, f] as const));

describe("classes: cobertura (R9, R26, R27)", () => {
  it("carga sin errores de lectura", () => {
    expect(loadIssues).toEqual([]);
  });

  it("R9: exactamente las 7 clases de la campaña", () => {
    expect(classes.map((c) => c.id).sort()).toEqual([
      "barbarian",
      "bard",
      "cleric",
      "druid",
      "paladin",
      "ranger",
      "rogue",
    ]);
  });

  it("R26: el recuento coincide con el expectedCount congelado en la procedencia", () => {
    const prov = mergeProvenance(data.provenanceParts.classes!);
    expect(prov.expectedCount).toBe(7);
    expect(prov.license).toBe("OGL-1.0a");
    const prov2 = mergeProvenance(data.provenanceParts["class-features"]!);
    expect(prov2.expectedCount).toBe(features.length);
  });

  it("R27: todo es del CRB y ninguna sección de otro libro se coló en el texto", () => {
    for (const entry of [...classes, ...features]) {
      expect(entry.book).toBe("CRB");
      expect(entry.sourceRef.startsWith("PRPG Core Rulebook")).toBe(true);
      expect(entry.textEn).not.toMatch(
        /Chronicle of Legends|Advanced Race Guide|Alternate Capstone/,
      );
      expect(entry.textEn).not.toMatch(/<\/?[a-z][^>]*>/i);
    }
  });
});

describe("classes: valores de referencia (R12)", () => {
  for (const [id, g] of Object.entries(golden)) {
    it(`R12: ${id} coincide con class-golden.json`, () => {
      const c = classById.get(id)!;
      expect(c.hitDie).toBe(g.hitDie);
      expect(c.skillRanksPerLevel).toBe(g.ranks);
      expect(c.progression).toEqual({ bab: g.bab, fort: g.fort, ref: g.ref, will: g.will });
    });
  }

  it("R12: el golden cubre exactamente las 7 clases", () => {
    expect(Object.keys(golden).sort()).toEqual([...classById.keys()].sort());
  });

  it("R12: riqueza inicial y alineamiento tal como los da la fuente", () => {
    const wealth = Object.fromEntries(classes.map((c) => [c.id, c.startingWealthDice]));
    expect(wealth).toEqual({
      barbarian: "3d6",
      bard: "3d6",
      cleric: "4d6",
      druid: "2d6",
      paladin: "5d6",
      ranger: "5d6",
      rogue: "4d6",
    });
    expect(classById.get("paladin")!.alignment).toBe("Lawful good");
    expect(classById.get("druid")!.alignment).toBe("Any neutral");
    expect(classById.get("barbarian")!.alignment).toBe("Any nonlawful");
  });

  it("R12: competencias del cazador, el bardo y el clérigo", () => {
    expect(classById.get("ranger")!.proficiencies).toEqual({
      weapons: ["simple", "martial"],
      armor: ["light", "medium"],
      shields: ["all-except-tower"],
    });
    expect(classById.get("bard")!.proficiencies.weapons).toContain("whip");
    expect(classById.get("cleric")!.proficiencies.weapons).toContain("deity-favored-weapon");
  });

  it("R12: classSkills como ids; el bardo tiene los 10 Knowledge", () => {
    const bard = classById.get("bard")!.classSkills;
    expect(bard.filter((s) => s.startsWith("knowledge-"))).toHaveLength(10);
    expect(classById.get("rogue")!.classSkills).toHaveLength(21);
    expect(classById.get("druid")!.classSkills).toContain("fly");
    for (const c of classes) expect(new Set(c.classSkills).size).toBe(c.classSkills.length);
  });
});

describe("classes: tablas (R10, R11)", () => {
  it("R10: 20 filas por clase con el BAB iterativo como lista de números", () => {
    for (const c of classes) expect(c.table).toHaveLength(20);
    expect(classById.get("ranger")!.table[19]!.bab).toEqual([20, 15, 10, 5]);
    expect(classById.get("druid")!.table[7]!.bab).toEqual([6, 1]);
    expect(classById.get("rogue")!.table[0]).toMatchObject({ bab: [0], fort: 0, ref: 2, will: 0 });
  });

  it("R10: clérigo y druida, nivel 1: spellsPerDay[0] = 3 y [1] = 1", () => {
    for (const id of ["cleric", "druid"]) {
      const row = classById.get(id)!.table[0]!;
      expect(row.spellsPerDay![0]).toBe(3);
      expect(row.spellsPerDay![1]).toBe(1);
    }
    expect(classById.get("cleric")!.table[0]!.domainSpellsPerDay![1]).toBe(1);
    expect(classById.get("druid")!.table[0]!.domainSpellsPerDay).toBeUndefined();
  });

  it("R10: paladín y cazador, niveles 1-3 todo null y nivel 4 con [1] = 0 (null vs 0)", () => {
    for (const id of ["paladin", "ranger"]) {
      const table = classById.get(id)!.table;
      for (const level of [1, 2, 3]) {
        expect(table[level - 1]!.spellsPerDay!.every((s) => s === null)).toBe(true);
      }
      expect(table[3]!.spellsPerDay![1]).toBe(0);
      expect(table[3]!.spellsPerDay!.filter((s) => s !== null)).toHaveLength(1);
    }
  });

  it("R10: pícaro y bárbaro no lanzan: sin casting ni spellsPerDay", () => {
    for (const id of ["rogue", "barbarian"]) {
      const c = classById.get(id)!;
      expect(c.casting).toBeUndefined();
      expect(c.table.every((r) => r.spellsPerDay === undefined)).toBe(true);
    }
  });

  it("R10: el bardo lleva conjuros conocidos y es espontáneo", () => {
    const bard = classById.get("bard")!;
    expect(bard.casting).toEqual({
      ability: "cha",
      tradition: "arcane",
      prepared: false,
      spellListId: "bard",
    });
    expect(bard.table[0]!.spellsKnown!.slice(0, 3)).toEqual([4, 2, null]);
    expect(classById.get("cleric")!.table[0]!.spellsKnown).toBeUndefined();
  });

  it("R11: la regla class-tables no encuentra incoherencias en los datos reales", () => {
    const found = runIntegrity(data, loadIntegrityContext(ROOT), { categories: ["classes"] });
    expect(found.filter((i) => i.rule.startsWith("class.table"))).toEqual([]);
  });
});

describe("class-features (R13, R14)", () => {
  it("R14: cada specialId existe en class-features, es de la misma clase y está alineado con special", () => {
    let total = 0;
    for (const c of classes) {
      for (const row of c.table) {
        expect(row.specialIds).toHaveLength(row.special.length);
        for (const id of row.specialIds) {
          total++;
          expect(featureById.get(id)?.classId, `${c.id} nivel ${row.level}: ${id}`).toBe(c.id);
        }
      }
    }
    expect(total).toBeGreaterThan(100);
  });

  it("R14: ejemplos de resolución (contadores y paréntesis de la tabla)", () => {
    expect(classById.get("paladin")!.table[3]!.specialIds).toEqual([
      "paladin.channel-positive-energy",
      "paladin.smite-evil",
    ]);
    expect(classById.get("druid")!.table[3]!.specialIds).toEqual([
      "druid.resist-natures-lure",
      "druid.wild-shape",
    ]);
    expect(classById.get("barbarian")!.table[1]!.specialIds).toEqual([
      "barbarian.rage-powers",
      "barbarian.uncanny-dodge",
    ]);
    expect(classById.get("rogue")!.table[0]!.specialIds).toEqual([
      "rogue.sneak-attack",
      "rogue.trapfinding",
    ]);
  });

  it("R13: capacidades principales con tipo y primer nivel", () => {
    const expected: [string, string | null, number][] = [
      ["paladin.smite-evil", "Su", 1],
      ["paladin.lay-on-hands", "Su", 2],
      ["paladin.divine-bond", "Sp", 5],
      ["druid.wild-shape", "Su", 4],
      ["druid.venom-immunity", "Ex", 9],
      ["barbarian.rage", "Ex", 1],
      ["barbarian.mighty-rage", "Ex", 20],
      ["rogue.sneak-attack", null, 1],
      ["rogue.evasion", "Ex", 2],
      ["ranger.favored-enemy", "Ex", 1],
      ["ranger.spells", null, 4],
      ["cleric.channel-energy", "Su", 1],
      ["bard.bardic-performance", null, 1],
      ["bard.lore-master", "Ex", 5],
    ];
    for (const [id, type, level] of expected) {
      expect(featureById.get(id), id).toMatchObject({ abilityType: type, level, kind: "feature" });
    }
  });

  it("R13: opciones elegibles por grupo, con su padre", () => {
    const options = features.filter((f) => f.kind === "option");
    const group = (prefix: string): ClassFeature[] =>
      options.filter((f) => f.id.startsWith(prefix));
    expect(group("rogue.talent.")).toHaveLength(15);
    expect(group("rogue.advanced-talent.")).toHaveLength(8);
    expect(group("barbarian.rage-power.")).toHaveLength(28);
    expect(group("paladin.mercy.")).toHaveLength(15);
    expect(group("ranger.combat-style.")).toHaveLength(2);
    expect(group("bard.performance.")).toHaveLength(13);
    expect(group("cleric.domain.")).toHaveLength(66);
    for (const o of options)
      expect(featureById.has(o.parentId!), `${o.id} -> ${o.parentId}`).toBe(true);
  });

  it("R13: ejemplos de opciones concretas de la fuente", () => {
    expect(featureById.get("rogue.talent.bleeding-attack")).toMatchObject({
      abilityType: "Ex",
      parentId: "rogue.rogue-talents",
      sourceRef: "PRPG Core Rulebook pg. 68",
    });
    expect(featureById.get("paladin.mercy.fatigued")).toMatchObject({ level: 3 });
    expect(featureById.get("paladin.mercy.blinded")).toMatchObject({ level: 12 });
    expect(featureById.get("cleric.domain.fire.fire-bolt")).toMatchObject({
      abilityType: "Sp",
      level: 1,
    });
    expect(featureById.has("ranger.combat-style.archery")).toBe(true);
  });

  it("las referencias entre clases y capacidades superan class-refs y la capa ES está completa", () => {
    const golden2 = { ...loadIntegrityContext(ROOT).config, classGolden: golden };
    const found = runIntegrity(
      data,
      { ...loadIntegrityContext(ROOT), config: golden2 },
      {
        categories: [...CATEGORIES],
      },
    );
    expect(found).toEqual([]);
  });
});
