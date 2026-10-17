// CRB: Chapter 8 Combat, Initiative: "An initiative check is a Dexterity check. Each character
// applies his or her Dexterity modifier to the roll, as well as other modifiers from feats, spells,
// and other effects" (p. ej. Improved Initiative, +4). El límite de Des máx. de la armadura "doesn't
// affect any other Dexterity-related abilities" (CRB Ch.6, Armor), por eso no se aplica aquí.
// https://www.d20pfsrd.com/gamemastering/combat/
import { resolveModifiers } from "./modifiers";
import type { Result } from "./result";
import type { Breakdown, Modifier } from "./types";

export interface InitiativeInput {
  readonly dexModifier: number;
  readonly modifiers?: readonly Modifier[];
}

export function initiativeModifier(input: InitiativeInput): Result<Breakdown> {
  const dex: Modifier = {
    id: "initiative.dex",
    name: "Dexterity modifier",
    value: input.dexModifier,
    type: "ability",
  };
  return resolveModifiers("initiative", [dex, ...(input.modifiers ?? [])]);
}
