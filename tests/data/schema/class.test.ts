import { describe, expect, it } from "vitest";
import { ClassSchema } from "../../../src/data/schema/class";
import { ClassFeatureSchema } from "../../../src/data/schema/class-feature";
import { DomainSchema } from "../../../src/data/schema/domain";
import { makeClass, makeDomain, makeFeature } from "../helpers/classes";

describe("schema de clases (R2, R10, R12)", () => {
  it("R2: una clase válida pasa", () => {
    expect(ClassSchema.safeParse(makeClass()).success).toBe(true);
  });

  it("R3: book distinto de CRB se rechaza", () => {
    const bad = { ...makeClass(), book: "APG" };
    expect(ClassSchema.safeParse(bad).success).toBe(false);
  });

  it("R10: la tabla debe tener exactamente 20 filas", () => {
    const entry = makeClass();
    expect(ClassSchema.safeParse({ ...entry, table: entry.table.slice(0, 19) }).success).toBe(
      false,
    );
    expect(
      ClassSchema.safeParse({ ...entry, table: [...entry.table, entry.table[0]] }).success,
    ).toBe(false);
  });

  it("R10: null (—) y 0 se distinguen en spellsPerDay", () => {
    const entry = makeClass("paladin", { bab: "full", fort: "good", ref: "poor", will: "good" });
    const row = {
      ...entry.table[3]!,
      spellsPerDay: [null, 0, null, null, null, null, null, null, null, null],
    };
    const ok = ClassSchema.safeParse({
      ...entry,
      table: entry.table.map((r, i) => (i === 3 ? row : r)),
    });
    expect(ok.success).toBe(true);
    const bad = {
      ...row,
      spellsPerDay: [null, 0, undefined, null, null, null, null, null, null, null],
    };
    expect(
      ClassSchema.safeParse({ ...entry, table: entry.table.map((r, i) => (i === 3 ? bad : r)) })
        .success,
    ).toBe(false);
    const short = { ...row, spellsPerDay: [null, 0] };
    expect(
      ClassSchema.safeParse({ ...entry, table: entry.table.map((r, i) => (i === 3 ? short : r)) })
        .success,
    ).toBe(false);
  });

  it("R12: dado de golpe, rangos y riqueza inicial con formato válido", () => {
    expect(ClassSchema.safeParse({ ...makeClass(), hitDie: 7 }).success).toBe(false);
    expect(ClassSchema.safeParse({ ...makeClass(), skillRanksPerLevel: 0 }).success).toBe(false);
    expect(ClassSchema.safeParse({ ...makeClass(), startingWealthDice: "x10" }).success).toBe(
      false,
    );
  });

  it("R12: armadura solo light, medium o heavy", () => {
    const entry = makeClass();
    const bad = { ...entry, proficiencies: { ...entry.proficiencies, armor: ["tower"] } };
    expect(ClassSchema.safeParse(bad).success).toBe(false);
  });
});

describe("schema de capacidades de clase (R13)", () => {
  it("una capacidad y una opción válidas pasan", () => {
    expect(ClassFeatureSchema.safeParse(makeFeature()).success).toBe(true);
    const option = makeFeature("rogue.talent.bleeding-attack", {
      kind: "option",
      parentId: "rogue.rogue-talents",
      abilityType: "Ex",
    });
    expect(ClassFeatureSchema.safeParse(option).success).toBe(true);
  });

  it("R13: abilityType solo Ex, Su, Sp o null", () => {
    expect(ClassFeatureSchema.safeParse({ ...makeFeature(), abilityType: "Xx" }).success).toBe(
      false,
    );
    expect(ClassFeatureSchema.safeParse({ ...makeFeature(), abilityType: undefined }).success).toBe(
      false,
    );
  });

  it("R13: una opción exige parentId y una capacidad no puede llevarlo", () => {
    const option = { ...makeFeature("rogue.talent.bleeding-attack"), kind: "option" };
    expect(ClassFeatureSchema.safeParse(option).success).toBe(false);
    const feature = { ...makeFeature(), parentId: "rogue.rogue-talents" };
    expect(ClassFeatureSchema.safeParse(feature).success).toBe(false);
  });

  it("el id debe llevar el prefijo de su clase y ser kebab con puntos", () => {
    expect(ClassFeatureSchema.safeParse({ ...makeFeature(), id: "sneak-attack" }).success).toBe(
      false,
    );
    expect(ClassFeatureSchema.safeParse({ ...makeFeature(), classId: "bard" }).success).toBe(false);
    expect(
      ClassFeatureSchema.safeParse({ ...makeFeature(), id: "rogue.Sneak_Attack" }).success,
    ).toBe(false);
  });

  it("el nivel va de 1 a 20", () => {
    expect(ClassFeatureSchema.safeParse({ ...makeFeature(), level: 0 }).success).toBe(false);
    expect(ClassFeatureSchema.safeParse({ ...makeFeature(), level: 21 }).success).toBe(false);
  });
});

describe("schema de dominios (R23)", () => {
  it("un dominio válido pasa", () => {
    expect(DomainSchema.safeParse(makeDomain()).success).toBe(true);
  });

  it("R23: exige los conjuros de nivel 1 a 9 en orden", () => {
    const domain = makeDomain();
    expect(DomainSchema.safeParse({ ...domain, spells: domain.spells.slice(0, 8) }).success).toBe(
      false,
    );
    const swapped = [...domain.spells];
    [swapped[0], swapped[1]] = [swapped[1]!, swapped[0]!];
    expect(DomainSchema.safeParse({ ...domain, spells: swapped }).success).toBe(false);
  });

  it("R23: exige al menos un poder concedido", () => {
    expect(DomainSchema.safeParse({ ...makeDomain(), grantedPowers: [] }).success).toBe(false);
  });
});
