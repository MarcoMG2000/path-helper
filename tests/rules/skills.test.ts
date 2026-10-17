import { describe, expect, it } from "vitest";
import {
  maxSkillRanks,
  skillModifier,
  type SkillDefinition,
  type SkillInput,
} from "../../src/rules/skills";
import type { AbilityModifiers } from "../../src/rules/types";

// Definiciones de habilidad [F] según la tabla de habilidades del SRD (Table: Skills):
//   Stealth (Des, ACP), Climb (Fue, ACP), Acrobatics (Des, ACP, sin Trained Only),
//   Perception (Sab, sin ACP), Knowledge (arcana) (Int, Trained Only, sin ACP).
const stealth: SkillDefinition = {
  id: "stealth",
  ability: "dex",
  trainedOnly: false,
  armorCheckPenalty: true,
};
const climb: SkillDefinition = {
  id: "climb",
  ability: "str",
  trainedOnly: false,
  armorCheckPenalty: true,
};
const acrobatics: SkillDefinition = {
  id: "acrobatics",
  ability: "dex",
  trainedOnly: false,
  armorCheckPenalty: true,
};
const perception: SkillDefinition = {
  id: "perception",
  ability: "wis",
  trainedOnly: false,
  armorCheckPenalty: false,
};
const knowledgeArcana: SkillDefinition = {
  id: "knowledgeArcana",
  ability: "int",
  trainedOnly: true,
  armorCheckPenalty: false,
};

const am = (o: Partial<AbilityModifiers>): AbilityModifiers => ({
  str: 0,
  dex: 0,
  con: 0,
  int: 0,
  wis: 0,
  cha: 0,
  ...o,
});

function total(input: SkillInput): number {
  const r = skillModifier(input);
  if (!r.ok) throw new Error(r.error.code);
  if (!r.value.usable) throw new Error("not usable");
  return r.value.breakdown.total;
}

describe("skillModifier - casos S1-S7 (CRB Ch.4: ranks + ability + class skill +3 + otros - ACP)", () => {
  it("R47/R48/R49/S1: Sigilo 4 rangos, Des +3, de clase, cuero tachonado ACP 1 -> 4+3+3-1 = 9", () => {
    expect(
      total({
        skill: stealth,
        ranks: 4,
        classSkill: true,
        abilityModifiers: am({ dex: 3 }),
        armorCheckPenalties: [{ id: "armor:studdedLeather", name: "Studded leather", value: 1 }],
      }),
    ).toBe(9);
  });

  it("R47/R48/S2: Trepar 0 rangos, Fue +2, de clase -> 2 (sin +3); con 1 rango -> 1+2+3 = 6", () => {
    const base = { skill: climb, classSkill: true, abilityModifiers: am({ str: 2 }) };
    expect(total({ ...base, ranks: 0 })).toBe(2);
    expect(total({ ...base, ranks: 1 })).toBe(6);
  });

  it("R49/S3: Acrobacias 5 rangos, Des +1, de clase, armadura completa (6) + escudo (2) -> 5+1+3-8 = 1", () => {
    // CRB Armor Check Penalty: "If a character is wearing armor and using a shield, both armor
    // check penalties apply."
    expect(
      total({
        skill: acrobatics,
        ranks: 5,
        classSkill: true,
        abilityModifiers: am({ dex: 1 }),
        armorCheckPenalties: [
          { id: "armor:fullPlate", name: "Full plate", value: 6 },
          { id: "shield:heavySteel", name: "Heavy steel shield", value: 2 },
        ],
      }),
    ).toBe(1);
  });

  it("R49/S4: Percepción (sin ACP) con ACP 6 en la lista -> 5+2+3 = 10", () => {
    expect(
      total({
        skill: perception,
        ranks: 5,
        classSkill: true,
        abilityModifiers: am({ wis: 2 }),
        armorCheckPenalties: [{ id: "armor:fullPlate", name: "Full plate", value: 6 }],
      }),
    ).toBe(10);
  });

  it("R50/S5: Conocimiento (arcano) con 0 rangos -> usable false (trainedOnly), sin total", () => {
    const r = skillModifier({
      skill: knowledgeArcana,
      ranks: 0,
      classSkill: true,
      abilityModifiers: am({ int: 1 }),
    });
    expect(r).toEqual({ ok: true, value: { usable: false, reason: "trainedOnly" } });
  });

  it("R50/S5: con 1 rango, Int +1 y no de clase -> 1+1 = 2", () => {
    expect(
      total({
        skill: knowledgeArcana,
        ranks: 1,
        classSkill: false,
        abilityModifiers: am({ int: 1 }),
      }),
    ).toBe(2);
  });

  it("R48/S6: Sigilo 5 rangos, no de clase, Des +3 -> 8 (sin +3)", () => {
    expect(
      total({ skill: stealth, ranks: 5, classSkill: false, abilityModifiers: am({ dex: 3 }) }),
    ).toBe(8);
  });

  it("R48: el +3 de habilidad de clase solo con >= 1 rango (0, 1 y 5 rangos, con y sin clase)", () => {
    const a = am({ str: 0 });
    const t = (ranks: number, classSkill: boolean) =>
      total({ skill: climb, ranks, classSkill, abilityModifiers: a });
    expect(t(0, true)).toBe(0);
    expect(t(1, true)).toBe(4);
    expect(t(5, true)).toBe(8);
    expect(t(0, false)).toBe(0);
    expect(t(1, false)).toBe(1);
    expect(t(5, false)).toBe(5);
  });

  it("R48: el desglose etiqueta el +3 como bonificador untyped de habilidad de clase", () => {
    const r = skillModifier({
      skill: climb,
      ranks: 2,
      classSkill: true,
      abilityModifiers: am({ str: 1 }),
    });
    if (!r.ok || !r.value.usable) throw new Error("unexpected");
    expect(r.value.breakdown.stat).toBe("skill.climb");
    expect(r.value.breakdown.lines.map((l) => [l.id, l.type, l.value])).toEqual([
      ["skill.ranks", "base", 2],
      ["skill.ability", "ability", 1],
      ["skill.classSkill", "untyped", 3],
    ]);
  });

  it("R47/S7: competence +2 y +4 no apilan (solo +4); circumstance +2 y +1 sí suman", () => {
    expect(
      total({
        skill: stealth,
        ranks: 0,
        classSkill: false,
        abilityModifiers: am({}),
        modifiers: [
          { id: "c1", name: "Competence", value: 2, type: "competence" },
          { id: "c2", name: "Competence", value: 4, type: "competence" },
        ],
      }),
    ).toBe(4);
    expect(
      total({
        skill: stealth,
        ranks: 0,
        classSkill: false,
        abilityModifiers: am({}),
        modifiers: [
          { id: "k1", name: "Circumstance", value: 2, type: "circumstance" },
          { id: "k2", name: "Circumstance", value: 1, type: "circumstance" },
        ],
      }),
    ).toBe(3);
  });

  it("R49: ACP 0 no resta nada y deja el valor en cero positivo", () => {
    const r = skillModifier({
      skill: stealth,
      ranks: 1,
      classSkill: false,
      abilityModifiers: am({}),
      armorCheckPenalties: [{ id: "armor:leather", name: "Leather", value: 0 }],
    });
    if (!r.ok || !r.value.usable) throw new Error("unexpected");
    expect(r.value.breakdown.total).toBe(1);
    expect(Object.is(r.value.breakdown.lines[2]?.value, 0)).toBe(true);
  });
});

describe("skillModifier - validación", () => {
  const ok = { skill: stealth, classSkill: false, abilityModifiers: am({}) };

  it("R51/S8: rangos -1 o 2.5 -> invalid_ranks", () => {
    for (const ranks of [-1, 2.5, Number.NaN]) {
      const r = skillModifier({ ...ok, ranks });
      expect(!r.ok && r.error.code).toBe("invalid_ranks");
    }
  });

  it("R52/S9: nivel 5 con 6 rangos -> ranks_exceed_level (rangos máximos = Dados de Golpe)", () => {
    const r = skillModifier({ ...ok, ranks: 6, characterLevel: 5 });
    expect(!r.ok && r.error.code).toBe("ranks_exceed_level");
    expect(skillModifier({ ...ok, ranks: 5, characterLevel: 5 }).ok).toBe(true);
  });

  it("R54/S10: ACP -1 o 1.5 -> invalid_armor_check_penalty", () => {
    for (const value of [-1, 1.5]) {
      const r = skillModifier({
        ...ok,
        ranks: 1,
        armorCheckPenalties: [{ id: "armor:x", name: "x", value }],
      });
      expect(!r.ok && r.error.code).toBe("invalid_armor_check_penalty");
    }
  });

  it("R54: el ACP inválido se detecta aunque la habilidad no tenga ACP", () => {
    const r = skillModifier({
      skill: perception,
      ranks: 1,
      classSkill: false,
      abilityModifiers: am({}),
      armorCheckPenalties: [{ id: "armor:x", name: "x", value: -1 }],
    });
    expect(!r.ok && r.error.code).toBe("invalid_armor_check_penalty");
  });

  it("R53/S11: maxSkillRanks(5) = 5; maxSkillRanks(0) -> invalid_level", () => {
    expect(maxSkillRanks(5)).toEqual({ ok: true, value: 5 });
    expect(maxSkillRanks(1)).toEqual({ ok: true, value: 1 });
    const r = maxSkillRanks(0);
    expect(!r.ok && r.error.code).toBe("invalid_level");
    const s = maxSkillRanks(2.5);
    expect(!s.ok && s.error.code).toBe("invalid_level");
  });

  it("R52: un characterLevel inválido -> invalid_level", () => {
    const r = skillModifier({ ...ok, ranks: 0, characterLevel: 0 });
    expect(!r.ok && r.error.code).toBe("invalid_level");
  });
});
