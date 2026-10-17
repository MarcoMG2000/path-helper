// CRB: Chapter 8 Combat, Saving Throws: "Your saving throw modifier is: base save bonus + ability
// modifier" (Fortitude/Con, Reflex/Dex, Will/Wis) + otros modificadores (resistance, etc.).
// https://www.d20pfsrd.com/gamemastering/combat/
import { resolveModifiers } from "./modifiers";
import { classSaveModifiers, type ClassLevel, type SaveId } from "./progression";
import type { Result } from "./result";
import type { AbilityId, AbilityModifiers, Breakdown, Modifier } from "./types";

export const SAVE_ABILITY: Readonly<Record<SaveId, AbilityId>> = {
  fortitude: "con",
  reflex: "dex",
  will: "wis",
};

export interface SavingThrowInput {
  readonly save: SaveId;
  readonly classes: readonly ClassLevel[];
  readonly abilityModifiers: AbilityModifiers;
  readonly modifiers?: readonly Modifier[];
}

export function savingThrow(input: SavingThrowInput): Result<Breakdown> {
  const { save } = input;
  const base = classSaveModifiers(save, input.classes);
  if (!base.ok) return base;
  const abilityId = SAVE_ABILITY[save];
  const ability: Modifier = {
    id: `save.${save}.${abilityId}`,
    name: `${abilityId} modifier`,
    value: input.abilityModifiers[abilityId],
    type: "ability",
  };
  return resolveModifiers(`save.${save}`, [...base.value, ability, ...(input.modifiers ?? [])]);
}
