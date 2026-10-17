// CRB: Chapter 4 Skills - Skill Checks ("1d20 + skill ranks + ability modifier + miscellaneous
// modifiers"), Class Skills (+3 si es habilidad de clase y se tiene al menos 1 rango), Trained Only
// (hace falta al menos 1 rango), Armor Check Penalty (se aplica a las habilidades marcadas "ACP";
// con armadura y escudo "both armor check penalties apply") y máximo de rangos = Dados de Golpe.
// https://www.d20pfsrd.com/skills/ y https://www.d20pfsrd.com/equipment---final/armor/
import { resolveModifiers } from "./modifiers";
import { err, ok, type Result } from "./result";
import type { AbilityId, AbilityModifiers, Breakdown, Modifier } from "./types";

export interface SkillDefinition {
  readonly id: string;
  readonly ability: AbilityId;
  readonly trainedOnly: boolean;
  readonly armorCheckPenalty: boolean;
}

export interface ArmorCheckPenaltyEntry {
  readonly id: string;
  readonly name: string;
  readonly value: number; // magnitud, entero >= 0
}

export interface SkillInput {
  readonly skill: SkillDefinition;
  readonly ranks: number;
  readonly classSkill: boolean;
  readonly abilityModifiers: AbilityModifiers;
  readonly armorCheckPenalties?: readonly ArmorCheckPenaltyEntry[];
  readonly characterLevel?: number;
  readonly modifiers?: readonly Modifier[];
}

export type SkillResult =
  | { readonly usable: true; readonly breakdown: Breakdown }
  | { readonly usable: false; readonly reason: "trainedOnly" };

function validLevel(level: number): boolean {
  return Number.isInteger(level) && level >= 1;
}

export function maxSkillRanks(characterLevel: number): Result<number> {
  if (!validLevel(characterLevel)) {
    return err("invalid_level", "Character level must be an integer >= 1", "characterLevel");
  }
  return ok(characterLevel);
}

export function skillModifier(input: SkillInput): Result<SkillResult> {
  const { skill, ranks } = input;
  const penalties = input.armorCheckPenalties ?? [];

  if (!Number.isInteger(ranks) || ranks < 0) {
    return err("invalid_ranks", "Ranks must be an integer >= 0", "ranks");
  }
  if (input.characterLevel !== undefined) {
    const max = maxSkillRanks(input.characterLevel);
    if (!max.ok) return max;
    if (ranks > max.value) {
      return err("ranks_exceed_level", "Ranks cannot exceed character level", "ranks");
    }
  }
  for (const p of penalties) {
    if (!Number.isInteger(p.value) || p.value < 0) {
      return err(
        "invalid_armor_check_penalty",
        `Armor check penalty "${p.id}" must be an integer >= 0`,
        p.id,
      );
    }
  }

  if (skill.trainedOnly && ranks === 0) return ok({ usable: false, reason: "trainedOnly" });

  const lines: Modifier[] = [
    { id: "skill.ranks", name: "Ranks", value: ranks, type: "base" },
    {
      id: "skill.ability",
      name: `${skill.ability} modifier`,
      value: input.abilityModifiers[skill.ability],
      type: "ability",
    },
  ];
  if (input.classSkill && ranks >= 1) {
    lines.push({ id: "skill.classSkill", name: "Class skill", value: 3, type: "untyped" });
  }
  lines.push(...(input.modifiers ?? []));
  if (skill.armorCheckPenalty) {
    for (const p of penalties) {
      // 0 - v (no -v) evita el cero negativo, que no sobrevive a JSON.
      lines.push({ id: `skill.acp:${p.id}`, name: p.name, value: 0 - p.value, type: "untyped" });
    }
  }

  const breakdown = resolveModifiers(`skill.${skill.id}`, lines);
  if (!breakdown.ok) return breakdown;
  return ok({ usable: true, breakdown: breakdown.value });
}
