import { describe, expect, it } from "vitest";
import { spellsForClass, type SpellLevelsView } from "../../../src/data/spells/query";

const spells: SpellLevelsView[] = [
  { id: "cure-light-wounds", levels: { cleric: 1, bard: 1, druid: 1, paladin: 1, ranger: 2 } },
  { id: "magic-missile", levels: { sorcerer: 1, wizard: 1 } },
  { id: "burning-hands", levels: { sorcerer: 1, wizard: 1 } },
  { id: "wish", levels: { sorcerer: 9, wizard: 9 } },
  { id: "bless", levels: { cleric: 1, paladin: 1 } },
  { id: "light", levels: { cleric: 0, bard: 0, druid: 0, sorcerer: 0, wizard: 0 } },
  { id: "fireball", levels: { sorcerer: 3, wizard: 3, "fire-domain": 3 } },
];

describe("spellsForClass (R100)", () => {
  it("ordena por nivel y después por id (orden estable)", () => {
    expect(spellsForClass(spells, "cleric")).toEqual(["light", "bless", "cure-light-wounds"]);
    expect(spellsForClass(spells, "sorcerer")).toEqual([
      "light",
      "burning-hands",
      "magic-missile",
      "fireball",
      "wish",
    ]);
  });

  it("no depende del orden de entrada", () => {
    expect(spellsForClass([...spells].reverse(), "wizard")).toEqual(
      spellsForClass(spells, "wizard"),
    );
  });

  it("filtra por nivel", () => {
    expect(spellsForClass(spells, "wizard", 1)).toEqual(["burning-hands", "magic-missile"]);
    expect(spellsForClass(spells, "wizard", 9)).toEqual(["wish"]);
    expect(spellsForClass(spells, "wizard", 0)).toEqual(["light"]);
    expect(spellsForClass(spells, "ranger", 1)).toEqual([]);
  });

  it("funciona con sorcerer, wizard (sin spell-lists) y con la clave de un dominio", () => {
    expect(spellsForClass(spells, "sorcerer", 1)).toEqual(["burning-hands", "magic-missile"]);
    expect(spellsForClass(spells, "fire-domain")).toEqual(["fireball"]);
  });

  it("una clave inexistente da una lista vacía; las propiedades heredadas no cuentan", () => {
    expect(spellsForClass(spells, "alchemist")).toEqual([]);
    expect(spellsForClass(spells, "toString")).toEqual([]);
  });

  it("para una clase con lista coincide con la lista (nivel 0 incluido)", () => {
    const lists = { cleric: { "0": ["light"], "1": ["bless", "cure-light-wounds"] } };
    for (const [level, ids] of Object.entries(lists.cleric)) {
      expect(spellsForClass(spells, "cleric", Number(level))).toEqual(ids);
    }
  });
});
