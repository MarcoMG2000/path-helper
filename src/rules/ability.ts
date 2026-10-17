// CRB: Chapter 1 Getting Started, "Determine Bonuses (or Penalties)" - Table: Ability Modifiers
// and Bonus Spells (columna de modificador: floor((puntuación - 10) / 2), válida hasta 45 y más).
// https://www.d20pfsrd.com/basics-ability-scores/ability-scores/
import { resolveModifiers } from "./modifiers";
import { err, ok, type Result } from "./result";
import {
  ABILITY_IDS,
  type AbilityId,
  type AbilityModifiers,
  type AbilityScores,
  type Breakdown,
  type Modifier,
} from "./types";

export function abilityModifier(score: number): Result<number> {
  if (!Number.isInteger(score) || score < 1) {
    return err("invalid_ability_score", "Ability score must be an integer >= 1");
  }
  // Math.floor (suelo, no truncado): 1 -> -5, 9 -> -1.
  return ok(Math.floor((score - 10) / 2));
}

export function abilityModifiers(scores: AbilityScores): Result<AbilityModifiers> {
  const out: Partial<Record<AbilityId, number>> = {};
  for (const id of ABILITY_IDS) {
    const mod = abilityModifier(scores[id]);
    if (!mod.ok) return err("invalid_ability_score", mod.error.message, id);
    out[id] = mod.value;
  }
  return ok(out as AbilityModifiers);
}

export function effectiveAbility(
  id: AbilityId,
  baseScore: number,
  modifiers: readonly Modifier[] = [],
): Result<{ score: Breakdown; modifier: number }> {
  if (!Number.isInteger(baseScore) || baseScore < 1) {
    return err("invalid_ability_score", "Base ability score must be an integer >= 1", id);
  }
  const base: Modifier = {
    id: `ability.${id}.base`,
    name: "Base score",
    value: baseScore,
    type: "base",
  };
  const score = resolveModifiers(`ability.${id}`, [base, ...modifiers]);
  if (!score.ok) return score;
  // OQ-4 (provisional): una puntuación efectiva < 1 no tiene modificador numérico en el Core.
  if (score.value.total < 1) {
    return err("ability_score_below_one", "Effective ability score is below 1", id);
  }
  const modifier = Math.floor((score.value.total - 10) / 2);
  return ok({ score: score.value, modifier });
}
