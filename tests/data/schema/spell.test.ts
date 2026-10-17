import { describe, expect, it } from "vitest";
import { getCategory } from "../../../src/data/categories";
import { CRB_CLASS_IDS, SPELL_SCHOOLS, SpellSchema } from "../../../src/data/schema/spell";
import { CASTER_CLASS_IDS, SpellListsSchema } from "../../../src/data/schema/spell-list";
import { classifyDuration, classifyRange } from "../../../src/data/spells/fields";
import { spellEntry } from "../spells/helpers";

describe("SpellSchema (R2, R20)", () => {
  it("acepta un conjuro válido y está registrado como schema de spells", () => {
    expect(SpellSchema.safeParse(spellEntry()).success).toBe(true);
    expect(getCategory("spells").schema).toBe(SpellSchema);
  });

  it("exige los campos comunes y rechaza campos desconocidos (R2)", () => {
    const sinNombre = spellEntry();
    delete sinNombre["name"];
    expect(SpellSchema.safeParse(sinNombre).success).toBe(false);
    expect(SpellSchema.safeParse(spellEntry({ extra: 1 })).success).toBe(false);
  });

  it("rechaza un libro distinto del CRB (R3)", () => {
    expect(SpellSchema.safeParse(spellEntry({ book: "APG" })).success).toBe(false);
  });

  it("acepta shortDescriptionEn, subschool y levels vacío (R102 lo marca needsReview)", () => {
    expect(
      SpellSchema.safeParse(
        spellEntry({ shortDescriptionEn: "Force bolt.", subschool: "healing", levels: {} }),
      ).success,
    ).toBe(true);
  });
});

describe("SpellSchema: levels (R91)", () => {
  it("acepta claves de clase y de dominio en kebab-case con niveles 0-9", () => {
    for (const levels of [{ sorcerer: 0 }, { wizard: 9 }, { "fire-domain": 3, cleric: 3 }]) {
      expect(SpellSchema.safeParse(spellEntry({ levels })).success).toBe(true);
    }
  });

  it("rechaza una clave que no es kebab-case", () => {
    for (const key of ["Wizard", "red mantis", "sor/wiz", "wiz_ard", ""]) {
      expect(SpellSchema.safeParse(spellEntry({ levels: { [key]: 1 } })).success).toBe(false);
    }
  });

  it("rechaza niveles fuera de 0-9 o no enteros", () => {
    for (const level of [10, -1, 1.5, "1"]) {
      expect(SpellSchema.safeParse(spellEntry({ levels: { wizard: level } })).success).toBe(false);
    }
  });
});

describe("SpellSchema: school (R101)", () => {
  it("acepta las 9 escuelas", () => {
    expect(SPELL_SCHOOLS).toHaveLength(9);
    for (const school of SPELL_SCHOOLS) {
      expect(SpellSchema.safeParse(spellEntry({ school })).success).toBe(true);
    }
  });

  it("rechaza una escuela desconocida", () => {
    for (const school of ["fire", "Evocation", "", "see text"]) {
      expect(SpellSchema.safeParse(spellEntry({ school })).success).toBe(false);
    }
  });
});

describe("SpellSchema: coherencia de campos estructurados", () => {
  it("fixedFt solo con kind fixed", () => {
    expect(SpellSchema.safeParse(spellEntry({ range: classifyRange("10 ft.") })).success).toBe(
      true,
    );
    expect(
      SpellSchema.safeParse(spellEntry({ range: { raw: "touch", kind: "touch", fixedFt: 5 } }))
        .success,
    ).toBe(false);
    expect(
      SpellSchema.safeParse(spellEntry({ range: { raw: "10 ft.", kind: "fixed" } })).success,
    ).toBe(false);
  });

  it("amount, unit y perLevel solo con kind timed", () => {
    expect(
      SpellSchema.safeParse(spellEntry({ duration: classifyDuration("10 min./level (D)") }))
        .success,
    ).toBe(true);
    expect(
      SpellSchema.safeParse(
        spellEntry({
          duration: { raw: "instantaneous", kind: "instantaneous", dismissible: false, amount: 1 },
        }),
      ).success,
    ).toBe(false);
    expect(
      SpellSchema.safeParse(
        spellEntry({ duration: { raw: "1 round", kind: "timed", dismissible: false } }),
      ).success,
    ).toBe(false);
  });

  it("rechaza valores fuera de los enums de los campos", () => {
    const castingTime = { raw: "x", unit: "bonus", amount: 1 };
    expect(SpellSchema.safeParse(spellEntry({ castingTime })).success).toBe(false);
  });
});

describe("catálogos y SpellListsSchema (R21, R92)", () => {
  it("CRB_CLASS_IDS son las 11 clases y CASTER_CLASS_IDS las 5 con lista", () => {
    expect(CRB_CLASS_IDS).toHaveLength(11);
    expect(CASTER_CLASS_IDS).toEqual(["bard", "cleric", "druid", "paladin", "ranger"]);
    for (const id of CASTER_CLASS_IDS) expect(CRB_CLASS_IDS).toContain(id);
  });

  it("acepta una lista por clase y nivel", () => {
    expect(
      SpellListsSchema.safeParse({
        cleric: { "0": ["light"], "1": ["bless", "cure-light-wounds"] },
        ranger: { "1": [] },
      }).success,
    ).toBe(true);
  });

  it("rechaza sorcerer, wizard y clases de otros libros (Q15)", () => {
    for (const key of ["sorcerer", "wizard", "alchemist"]) {
      expect(SpellListsSchema.safeParse({ [key]: { "1": ["magic-missile"] } }).success).toBe(false);
    }
  });

  it("rechaza niveles que no son 0-9 y ids que no son kebab-case", () => {
    expect(SpellListsSchema.safeParse({ cleric: { "10": ["bless"] } }).success).toBe(false);
    expect(SpellListsSchema.safeParse({ cleric: { first: ["bless"] } }).success).toBe(false);
    expect(SpellListsSchema.safeParse({ cleric: { "1": ["Bless"] } }).success).toBe(false);
  });
});
