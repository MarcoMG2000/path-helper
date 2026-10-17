import { describe, expect, it } from "vitest";
import { FEAT_TYPES, FeatSchema } from "../../../src/data/schema/feat";
import { baseEntry } from "../helpers/entries";

// Entrada sintética válida (los datos reales se comprueban en tests/data/feats.test.ts).
function feat(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...baseEntry(),
    types: ["Combat"],
    prerequisites: {
      raw: "Str 13, base attack bonus +1.",
      abilities: { str: 13 },
      bab: 1,
      featIds: [],
      skills: [],
      other: [],
    },
    benefit: "Texto del beneficio.",
    ...overrides,
  };
}

describe("FeatSchema (R2, R17)", () => {
  it("R17: los tipos admitidos son los cinco del CRB", () => {
    expect([...FEAT_TYPES]).toEqual([
      "General",
      "Combat",
      "Metamagic",
      "Item Creation",
      "Critical",
    ]);
  });

  it("R17: una dote válida pasa, con normal y special opcionales", () => {
    expect(FeatSchema.safeParse(feat()).success).toBe(true);
    expect(FeatSchema.safeParse(feat({ normal: "N.", special: "S." })).success).toBe(true);
  });

  it("R17: featIds, skills y other toman [] por defecto", () => {
    const parsed = FeatSchema.parse(feat({ prerequisites: { raw: "" } }));
    expect(parsed.prerequisites).toEqual({ raw: "", featIds: [], skills: [], other: [] });
  });

  it("R17: varios tipos (Combat + Critical) son válidos; sin tipos o un tipo ajeno no", () => {
    expect(FeatSchema.safeParse(feat({ types: ["Combat", "Critical"] })).success).toBe(true);
    expect(FeatSchema.safeParse(feat({ types: [] })).success).toBe(false);
    expect(FeatSchema.safeParse(feat({ types: ["Teamwork"] })).success).toBe(false);
  });

  it("R2/R3/R7: hereda las reglas de la base (libro, sourceRef, claves desconocidas)", () => {
    expect(FeatSchema.safeParse(feat({ book: "APG" })).success).toBe(false);
    expect(FeatSchema.safeParse(feat({ sourceRef: "Ultimate Combat pg. 1" })).success).toBe(false);
    expect(FeatSchema.safeParse(feat({ extra: 1 })).success).toBe(false);
  });

  it("R17: prerrequisitos mal formados se rechazan", () => {
    const bad = (p: Record<string, unknown>): boolean =>
      FeatSchema.safeParse(feat({ prerequisites: { raw: "x", ...p } })).success;
    expect(bad({ abilities: { luck: 13 } })).toBe(false);
    expect(bad({ featIds: ["Power Attack"] })).toBe(false);
    expect(bad({ skills: [{ skillId: "ride", ranks: 0 }] })).toBe(false);
    expect(bad({ skills: [{ skillId: "ride", ranks: 1, extra: true }] })).toBe(false);
    expect(bad({ other: [""] })).toBe(false);
    expect(bad({ unknown: 1 })).toBe(false);
    expect(bad({ skills: [{ skillId: "knowledge-arcana", ranks: 5 }], casterLevel: 3 })).toBe(true);
  });

  it("R8: sin HTML en benefit, normal ni special; benefit obligatorio", () => {
    expect(FeatSchema.safeParse(feat({ benefit: "<b>x</b>" })).success).toBe(false);
    expect(FeatSchema.safeParse(feat({ normal: "<i>x</i>" })).success).toBe(false);
    expect(FeatSchema.safeParse(feat({ special: "<br>" })).success).toBe(false);
    expect(FeatSchema.safeParse(feat({ benefit: "" })).success).toBe(false);
  });
});
