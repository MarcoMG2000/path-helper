import type { CritMultiplier, ExtraDamage, MagicItem, MagicVariant } from "../schema/magic-item";

// Daño adicional por dados de armas y habilidades de arma (R78) con la forma que consume la
// calculadora de daño (f6). El CRB (capítulo 15, «Weapon Special Abilities») hace depender el daño
// de los *burst* y de *thundering* del multiplicador de crítico del arma:
//
//   «... deals an extra 1d10 points of fire damage on a successful critical hit. If the weapon's
//   critical multiplier is ×3, add an extra 2d10 points of fire damage instead, and if the
//   multiplier is ×4, add an extra 3d10 points of fire damage.»  (flaming burst, CRB pg. 470)
//
// Por eso `ExtraDamage.critMultiplier` distingue las alternativas y ESTAS FUNCIONES son la única
// vía correcta de consulta: sumar a mano todos los `extraDamage` de una variante daría 6d10.

/** Un golpe: si es crítico confirmado y con qué multiplicador de crítico (el del arma, ×2/×3/×4). */
export interface HitContext {
  /** Golpe crítico confirmado: solo entonces cuentan las entradas `onCritical`. */
  readonly critical: boolean;
  /**
   * Multiplicador de crítico del arma usado (`weapon.critical.multiplier`, o `secondaryMultiplier`
   * en el extremo `x4` de un arma doble). Obligatorio si `critical` es verdadero.
   */
  readonly critMultiplier?: CritMultiplier;
}

export interface ResolvedExtraDamage {
  /** Se suman automáticamente a este golpe: `always` y las `onCritical` que aplican. */
  readonly applied: readonly ExtraDamage[];
  /**
   * `conditional` (contra criaturas alineadas, solo al aire libre...): nunca se suman solas; la
   * UI las muestra como interruptor con su `conditionText`.
   */
  readonly conditional: readonly ExtraDamage[];
}

/** Multiplicador de crítico de un arma (`Weapon.critical`); `undefined` si el arma no crítica. */
export function weaponCritMultiplier(
  weapon: {
    readonly critical: {
      readonly multiplier: CritMultiplier;
      readonly secondaryMultiplier?: CritMultiplier;
    } | null;
  },
  end: "primary" | "secondary" = "primary",
): CritMultiplier | undefined {
  if (weapon.critical === null) return undefined;
  return end === "secondary"
    ? (weapon.critical.secondaryMultiplier ?? weapon.critical.multiplier)
    : weapon.critical.multiplier;
}

function appliesOnCritical(damage: ExtraDamage, hit: HitContext): boolean {
  if (!hit.critical) return false;
  if (damage.critMultiplier === undefined) return true; // no depende del multiplicador
  return damage.critMultiplier === hit.critMultiplier;
}

/**
 * Daño adicional de UNA variante (`variant.extraDamage`) en un golpe. Lanza `RangeError` si el golpe
 * es crítico y no trae multiplicador (un cálculo incorrecto es peor que ninguno).
 */
export function getExtraDamage(
  variant: Pick<MagicVariant, "extraDamage">,
  hit: HitContext,
): ResolvedExtraDamage {
  if (hit.critical && hit.critMultiplier === undefined) {
    throw new RangeError("un golpe crítico necesita el multiplicador de crítico del arma");
  }
  const applied: ExtraDamage[] = [];
  const conditional: ExtraDamage[] = [];
  for (const damage of variant.extraDamage) {
    if (damage.trigger === "always") applied.push(damage);
    else if (damage.trigger === "onCritical") {
      if (appliesOnCritical(damage, hit)) applied.push(damage);
    } else conditional.push(damage);
  }
  return { applied, conditional };
}

/** Lo mínimo de una habilidad de arma que necesita la consulta (cabe un `MagicItem` completo). */
export type WeaponAbilityLike = Pick<MagicItem, "id" | "variants"> & {
  readonly functionsAs?: readonly string[];
};

/**
 * Daño adicional de un arma con varias habilidades especiales (`abilityIds`), p. ej. `["flaming-burst"]`
 * en una espada *Flame Tongue*. Resuelve `functionsAs` de forma transitiva y sin repetir: una
 * *flaming burst* «funciona como» una *flaming*, así que incluye su 1d6 `always`, y si por error
 * llegaran las dos no se cuenta dos veces. Con las variantes por bono (`+N`) usa `variantId`
 * (por defecto la primera: las habilidades de arma tienen una sola variante).
 *
 * `lookup` devuelve la entrada de `magic-items` por id (`weapon-ability`); un id desconocido lanza
 * (los datos validados no los tienen).
 */
export function getWeaponAbilitiesExtraDamage(
  abilityIds: readonly string[],
  lookup: (id: string) => WeaponAbilityLike | undefined,
  hit: HitContext,
  variantId?: string,
): ResolvedExtraDamage {
  const seen = new Set<string>();
  const applied: ExtraDamage[] = [];
  const conditional: ExtraDamage[] = [];
  const visit = (id: string): void => {
    if (seen.has(id)) return;
    seen.add(id);
    const ability = lookup(id);
    if (ability === undefined) throw new RangeError(`habilidad de arma desconocida: ${id}`);
    const variant =
      variantId === undefined
        ? ability.variants[0]
        : ability.variants.find((v) => v.variantId === variantId);
    if (variant !== undefined) {
      const resolved = getExtraDamage(variant, hit);
      applied.push(...resolved.applied);
      conditional.push(...resolved.conditional);
    }
    for (const other of ability.functionsAs ?? []) visit(other);
  };
  for (const id of abilityIds) visit(id);
  return { applied, conditional };
}
