// CRB: Chapter 8 Combat, Armor Class: "10 + armor bonus + shield bonus + Dexterity modifier + other
// modifiers" (tamaño, armadura natural, desvío, esquiva...).
//   - Touch Attacks: la CA no incluye bonificadores de armor, shield ni natural armor; el resto
//     (tamaño, Des, desvío...) se aplica con normalidad. Las mejoras de armadura/escudo/armadura
//     natural incrementan ese bonificador y por tanto tampoco cuentan.
//   - Flat-Footed: no se puede usar el bonificador de Des ("if any": un Des negativo se conserva) y
//     "any situation that denies you your Dexterity bonus also denies dodge bonuses".
//   - CRB Ch.6 Armor, Maximum Dex Bonus: el exceso de Des sobre el máximo se reduce a ese máximo
//     (solo para la CA); armadura y carga: "use the worse figure", se aplica el menor.
// https://www.d20pfsrd.com/gamemastering/combat/ y https://www.d20pfsrd.com/equipment---final/armor/
import { resolveModifiers } from "./modifiers";
import { err, ok, type Result } from "./result";
import { sizeModifier } from "./size";
import type { Breakdown, ExcludedReason, LineAdjustment, Modifier, Size } from "./types";

export interface MaxDexCap {
  readonly id: string;
  readonly name: string;
  readonly value: number; // entero >= 0
}

export interface ArmorClassInput {
  readonly size: Size;
  readonly dexModifier: number; // sin limitar
  readonly maxDexCaps?: readonly MaxDexCap[];
  readonly modifiers?: readonly Modifier[]; // NO incluir Des ni tamaño
}

export interface ArmorClassResult {
  readonly normal: Breakdown;
  readonly touch: Breakdown;
  readonly flatFooted: Breakdown;
  readonly flatFootedTouch: Breakdown;
}

type Variant = keyof ArmorClassResult;

const TOUCH_IGNORED: ReadonlySet<string> = new Set(["armor", "shield", "naturalArmor"]);

function lowestCap(caps: readonly MaxDexCap[]): Result<MaxDexCap | undefined> {
  let lowest: MaxDexCap | undefined;
  for (const c of caps) {
    if (!Number.isInteger(c.value) || c.value < 0) {
      return err("invalid_max_dex", `Max Dex cap "${c.id}" must be an integer >= 0`, c.id);
    }
    if (lowest === undefined || c.value < lowest.value) lowest = c;
  }
  return ok(lowest);
}

function variantBreakdown(
  variant: Variant,
  dexEffective: number,
  dexAdjustment: LineAdjustment | undefined,
  input: ArmorClassInput,
): Result<Breakdown> {
  const touch = variant === "touch" || variant === "flatFootedTouch";
  const flatFooted = variant === "flatFooted" || variant === "flatFootedTouch";
  const modifiers = input.modifiers ?? [];

  const lines: Modifier[] = [
    { id: "ac.base", name: "Base", value: 10, type: "base" },
    {
      id: "ac.dex",
      name: "Dexterity modifier",
      value: dexEffective,
      type: "ability",
      ...(dexAdjustment === undefined ? {} : { adjustment: dexAdjustment }),
    },
    { id: "ac.size", name: "Size modifier", value: sizeModifier(input.size), type: "size" },
    ...modifiers,
  ];

  const excluded = new Map<string, ExcludedReason>();
  for (const m of modifiers) {
    if (touch && m.value > 0 && TOUCH_IGNORED.has(m.type)) excluded.set(m.id, "touch");
    if (flatFooted && m.value > 0 && m.type === "dodge") excluded.set(m.id, "lostDexBonus");
  }
  if (flatFooted && dexEffective > 0) excluded.set("ac.dex", "lostDexBonus");

  return resolveModifiers(`ac.${variant}`, lines, { excluded });
}

export function armorClass(input: ArmorClassInput): Result<ArmorClassResult> {
  const cap = lowestCap(input.maxDexCaps ?? []);
  if (!cap.ok) return cap;

  let dexEffective = input.dexModifier;
  let dexAdjustment: LineAdjustment | undefined;
  if (cap.value !== undefined && input.dexModifier > cap.value.value) {
    dexEffective = cap.value.value;
    dexAdjustment = {
      reason: "maxDex",
      originalValue: input.dexModifier,
      cappedBy: cap.value.id,
    };
  }

  const variants: readonly Variant[] = ["normal", "touch", "flatFooted", "flatFootedTouch"];
  const out: Partial<Record<Variant, Breakdown>> = {};
  for (const v of variants) {
    const b = variantBreakdown(v, dexEffective, dexAdjustment, input);
    if (!b.ok) return b;
    out[v] = b.value;
  }
  return ok(out as ArmorClassResult);
}
