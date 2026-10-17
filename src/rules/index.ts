// Capa rules: motor Pathfinder 1e PURO (sin I/O, sin red, sin BD).
// No puede importar de server ni de web (ver eslint.config.js).
// Único punto de import público del motor (design §4).
export { ABILITY_IDS, BONUS_TYPES } from "./types";
export type {
  AbilityId,
  AbilityModifiers,
  AbilityScores,
  BonusType,
  Breakdown,
  BreakdownLine,
  ExcludedReason,
  LineAdjustment,
  LineStatus,
  Modifier,
  ModifierType,
  Size,
} from "./types";

export { err, ok } from "./result";
export type { Result, RulesError, RulesErrorCode } from "./result";

export { resolveModifiers } from "./modifiers";
export type { ResolveOptions } from "./modifiers";

export { abilityModifier, abilityModifiers, effectiveAbility } from "./ability";
export { sizeModifier } from "./size";

export {
  baseAttackBonusFor,
  baseSaveFor,
  characterBaseAttackBonus,
  characterBaseSave,
} from "./progression";
export type { BabProgression, ClassLevel, SaveId, SaveProgression } from "./progression";

export { SAVE_ABILITY, savingThrow } from "./saves";
export type { SavingThrowInput } from "./saves";

export { armorClass } from "./armor-class";
export type { ArmorClassInput, ArmorClassResult, MaxDexCap } from "./armor-class";

export { applyD20 } from "./check";
export type { CheckResult } from "./check";

export { initiativeModifier } from "./initiative";
export type { InitiativeInput } from "./initiative";

export { maxSkillRanks, skillModifier } from "./skills";
export type { ArmorCheckPenaltyEntry, SkillDefinition, SkillInput, SkillResult } from "./skills";
