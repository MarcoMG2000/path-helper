import { describe, expect, it } from "vitest";
import { SkillSchema } from "../../../src/data/schema/skill";
import { baseEntry } from "../helpers/entries";

// Entrada sintética válida (los datos reales se comprueban en tests/data/skills.test.ts).
function skill(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...baseEntry({ id: "stealth", name: "Stealth", sourceRef: "PRPG Core Rulebook pg. 106" }),
    keyAbility: "dex",
    trainedOnly: false,
    armorCheckPenalty: true,
    ...overrides,
  };
}

describe("SkillSchema (R2, R16)", () => {
  it("R16: una habilidad válida pasa", () => {
    expect(SkillSchema.safeParse(skill()).success).toBe(true);
  });

  it("R16: la entrada de Knowledge lleva su materia, y solo ella", () => {
    const arcana = skill({
      id: "knowledge-arcana",
      name: "Knowledge (arcana)",
      keyAbility: "int",
      trainedOnly: true,
      armorCheckPenalty: false,
      knowledgeSubject: "arcana",
    });
    expect(SkillSchema.safeParse(arcana).success).toBe(true);
    expect(SkillSchema.safeParse({ ...arcana, knowledgeSubject: "history" }).success).toBe(false);
    expect(SkillSchema.safeParse({ ...arcana, knowledgeSubject: undefined }).success).toBe(false);
    expect(SkillSchema.safeParse(skill({ knowledgeSubject: "arcana" })).success).toBe(false);
  });

  it("R16: característica clave e indicadores obligatorios y bien tipados", () => {
    expect(SkillSchema.safeParse(skill({ keyAbility: "luck" })).success).toBe(false);
    expect(SkillSchema.safeParse(skill({ keyAbility: undefined })).success).toBe(false);
    expect(SkillSchema.safeParse(skill({ trainedOnly: "no" })).success).toBe(false);
    expect(SkillSchema.safeParse(skill({ armorCheckPenalty: undefined })).success).toBe(false);
  });

  it("R2/R3/R7: hereda las reglas de la base (libro, sourceRef, claves desconocidas)", () => {
    expect(SkillSchema.safeParse(skill({ book: "UC" })).success).toBe(false);
    expect(SkillSchema.safeParse(skill({ sourceRef: "Ultimate Combat pg. 1" })).success).toBe(
      false,
    );
    expect(SkillSchema.safeParse(skill({ extra: 1 })).success).toBe(false);
  });
});
