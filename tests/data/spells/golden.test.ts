import { describe, expect, it } from "vitest";
import {
  compareSpellToGolden,
  goldenIdsInRange,
  loadSpellGoldens,
  type SpellGolden,
} from "./golden";

// Pruebas del helper de goldens que usarán D1-D5. La comparación de los goldens con la fuente
// (fixtures reales) está en tests/scripts/srd/parse-spells.test.ts.

describe("spell-golden.json (R20)", () => {
  const goldens = loadSpellGoldens();

  it("contiene los cuatro conjuros de design.md §5", () => {
    expect(Object.keys(goldens).sort()).toEqual([
      "burning-hands",
      "cure-light-wounds",
      "magic-missile",
      "wish",
    ]);
  });

  it("recoge los valores del spec", () => {
    expect(goldens["cure-light-wounds"]!.levels).toEqual({
      cleric: 1,
      bard: 1,
      druid: 1,
      paladin: 1,
      ranger: 2,
    });
    expect(goldens["cure-light-wounds"]!.absentLevelKeys).toEqual(["sorcerer", "wizard"]);
    expect(goldens["magic-missile"]!.levels).toEqual({ sorcerer: 1, wizard: 1 });
    expect(goldens["wish"]!.levels).toEqual({ sorcerer: 9, wizard: 9 });
    expect(goldens["wish"]!.components).toMatchObject({ material: true });
  });

  it("goldenIdsInRange reparte los goldens por rango de iniciales", () => {
    expect(goldenIdsInRange(goldens, "a", "d")).toEqual(["burning-hands", "cure-light-wounds"]);
    expect(goldenIdsInRange(goldens, "e", "k")).toEqual([]);
    expect(goldenIdsInRange(goldens, "l", "r")).toEqual(["magic-missile"]);
    expect(goldenIdsInRange(goldens, "s", "z")).toEqual(["wish"]);
  });
});

describe("compareSpellToGolden", () => {
  const golden: SpellGolden = {
    name: "Magic Missile",
    school: "evocation",
    levels: { sorcerer: 1, wizard: 1 },
    absentLevelKeys: ["cleric"],
    castingTime: { unit: "standard", amount: 1 },
    savingThrow: { kind: "none" },
    spellResistance: { applies: "yes" },
  };
  const spell = {
    name: "Magic Missile",
    school: "evocation",
    levels: { sorcerer: 1, wizard: 1, cleric: 9 },
    castingTime: { unit: "standard", amount: 1 },
    savingThrow: { kind: "none" },
    spellResistance: { applies: "yes" },
  };

  it("sin diferencias cuando coincide", () => {
    expect(compareSpellToGolden({ ...spell, levels: { sorcerer: 1, wizard: 1 } }, golden)).toEqual(
      [],
    );
  });

  it("describe cada diferencia", () => {
    const diffs = compareSpellToGolden(
      { ...spell, school: "illusion", levels: { sorcerer: 2, wizard: 1, cleric: 1 } },
      golden,
    );
    expect(diffs.some((d) => d.startsWith("school"))).toBe(true);
    expect(diffs.some((d) => d.startsWith("levels.sorcerer"))).toBe(true);
    expect(diffs.some((d) => d.startsWith("levels.cleric"))).toBe(true);
  });

  it("no lanza con datos que no son un conjuro", () => {
    expect(compareSpellToGolden(undefined, golden).length).toBeGreaterThan(0);
  });
});
