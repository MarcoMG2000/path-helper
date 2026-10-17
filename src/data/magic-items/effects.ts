import {
  MAX_ENHANCEMENT_BONUS,
  type EnhancementOn,
  type MagicBonusType,
  type MagicEffect,
  type MagicItem,
} from "../schema/magic-item";

// Efectos numéricos de los objetos mágicos con la forma que consume el resolvedor de f2
// (`Modifier { id, name, value, type }`, f2 design §3). f3 no importa `src/rules` (R79, design §14.4):
// la traducción a llamadas de f2 es cosa de f4/f6. El apilamiento lo decide f2, no estos datos.

export type MagicEffectTarget =
  | "attack"
  | "damage"
  | "ac"
  | "initiative"
  | "save.fortitude"
  | "save.reflex"
  | "save.will"
  | "ability.str"
  | "ability.dex"
  | "ability.con"
  | "ability.int"
  | "ability.wis"
  | "ability.cha"
  | `skill.${string}`;

export interface ItemEffect {
  /** Estable y único: `magic:<entryId>:<variantId>:<n>` (+ `:fortitude|reflex|will` si venía de `save.all`). */
  readonly id: string;
  /** Nombre SRD en inglés; la UI traduce por id. */
  readonly name: string;
  readonly value: number;
  readonly type: MagicBonusType;
  readonly target: MagicEffectTarget;
  readonly appliesTo: "wearer" | "item";
  readonly conditional: boolean;
  readonly conditionText?: string;
  readonly foldInto?: "armor" | "shield" | "naturalArmor";
}

const SAVE_ALL_EXPANSION = [
  ["save.fortitude", "fortitude"],
  ["save.reflex", "reflex"],
  ["save.will", "will"],
] as const;

function toItemEffects(
  idPrefix: string,
  name: string,
  index: number,
  effect: MagicEffect,
): ItemEffect[] {
  const common = {
    name,
    value: effect.value,
    type: effect.bonusType,
    appliesTo: effect.appliesTo,
    conditional: effect.conditional,
    ...(effect.conditionText === undefined ? {} : { conditionText: effect.conditionText }),
    ...(effect.foldInto === undefined ? {} : { foldInto: effect.foldInto }),
  };
  if (effect.target === "save.all") {
    return SAVE_ALL_EXPANSION.map(([target, suffix]) => ({
      id: `${idPrefix}:${index}:${suffix}`,
      target,
      ...common,
    }));
  }
  return [{ id: `${idPrefix}:${index}`, target: effect.target as MagicEffectTarget, ...common }];
}

/**
 * Efectos de una variante de un objeto (R79). `undefined` si la variante no existe (sin lanzar).
 * `save.all` se expande en tres efectos (Fortitude, Reflex, Will).
 */
export function getItemEffects(
  entry: Pick<MagicItem, "id" | "name" | "variants">,
  variantId: string,
): ItemEffect[] | undefined {
  const variant = entry.variants.find((v) => v.variantId === variantId);
  if (variant === undefined) return undefined;
  const prefix = `magic:${entry.id}:${variant.variantId}`;
  return variant.effects.flatMap((effect, index) =>
    toItemEffects(prefix, entry.name, index, effect),
  );
}

/**
 * Regla de mejora del CRB (capítulo 15, «Magic Armor», «Magic Weapons») derivada de `enhancement`
 * (R80): arma = ataque y daño; armadura y escudo = bono a la CA que f4 pliega en el modificador
 * `armor` / `shield` (f2 §5.4). Vive aquí para no duplicarla en cada objeto específico.
 */
export function getEnhancementEffects(on: EnhancementOn, bonus: number): ItemEffect[] {
  if (!Number.isInteger(bonus) || bonus < 1 || bonus > MAX_ENHANCEMENT_BONUS) {
    throw new RangeError(`la mejora debe ser un entero de 1 a ${MAX_ENHANCEMENT_BONUS}: ${bonus}`);
  }
  const prefix = `magic:enhancement:${on}:${bonus}`;
  const base = {
    name: `${on} enhancement`,
    value: bonus,
    type: "enhancement" as const,
    appliesTo: "item" as const,
    conditional: false,
  };
  if (on === "weapon") {
    return [
      { id: `${prefix}:0`, target: "attack", ...base },
      { id: `${prefix}:1`, target: "damage", ...base },
    ];
  }
  return [{ id: `${prefix}:0`, target: "ac", ...base, foldInto: on }];
}
