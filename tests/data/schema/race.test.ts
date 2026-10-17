import { describe, expect, it } from "vitest";
import { RACE_SIZES, RaceSchema } from "../../../src/data/schema/race";
import { baseEntry } from "../helpers/entries";

// Entrada sintética válida (los datos reales se comprueban en tests/data/races.test.ts).
function race(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...baseEntry({ id: "dwarf", name: "Dwarf", sourceRef: "PRPG Core Rulebook pg. 21" }),
    abilityModifiers: { con: 2, wis: 2, cha: -2 },
    size: "Medium",
    baseSpeedFt: 20,
    languages: { automatic: ["Common", "Dwarven"], bonus: ["Giant"], bonusAny: false },
    traits: [{ name: "Darkvision", textEn: "Dwarves can see in the dark up to 60 feet." }],
    ...overrides,
  };
}

describe("RaceSchema (R2, R15)", () => {
  it("R15: una raza con modificadores fijos pasa", () => {
    expect(RaceSchema.safeParse(race()).success).toBe(true);
  });

  it("R15: la raza con +2 a elegir (humano, semielfo) pasa sin modificadores fijos", () => {
    const choice = race({
      abilityModifiers: {},
      abilityChoice: { amount: 2 },
      languages: { automatic: ["Common"], bonus: [], bonusAny: true },
    });
    expect(RaceSchema.safeParse(choice).success).toBe(true);
  });

  it("R15: sin modificadores fijos ni elección, o con un valor 0, se rechaza", () => {
    expect(RaceSchema.safeParse(race({ abilityModifiers: {} })).success).toBe(false);
    expect(RaceSchema.safeParse(race({ abilityModifiers: { con: 0 } })).success).toBe(false);
    expect(RaceSchema.safeParse(race({ abilityModifiers: { luck: 2 } })).success).toBe(false);
  });

  it("R15: tamaño, velocidad, idiomas y rasgos mal formados se rechazan", () => {
    expect([...RACE_SIZES]).toContain("Small");
    expect(RaceSchema.safeParse(race({ size: "Gigantic" })).success).toBe(false);
    expect(RaceSchema.safeParse(race({ baseSpeedFt: 0 })).success).toBe(false);
    expect(RaceSchema.safeParse(race({ baseSpeedFt: 20.5 })).success).toBe(false);
    expect(
      RaceSchema.safeParse(race({ languages: { automatic: [], bonus: [], bonusAny: false } }))
        .success,
    ).toBe(false);
    expect(RaceSchema.safeParse(race({ traits: [] })).success).toBe(false);
    expect(
      RaceSchema.safeParse(race({ traits: [{ name: "Hardy", textEn: "<b>x</b>" }] })).success,
    ).toBe(false);
  });

  it("R2/R3/R7: hereda las reglas de la base (libro, sourceRef, claves desconocidas)", () => {
    expect(RaceSchema.safeParse(race({ book: "ARG" })).success).toBe(false);
    expect(RaceSchema.safeParse(race({ sourceRef: "Advanced Race Guide pg. 10" })).success).toBe(
      false,
    );
    expect(RaceSchema.safeParse(race({ type: "humanoid" })).success).toBe(false);
  });
});
