// CRB: Chapter 8 Combat, Armor Class - Table: Size Modifiers (modificador de tamaño a CA y ataque).
// https://www.d20pfsrd.com/gamemastering/combat/
import type { Size } from "./types";

const SIZE_MODIFIERS: Readonly<Record<Size, number>> = {
  fine: 8,
  diminutive: 4,
  tiny: 2,
  small: 1,
  medium: 0,
  large: -1,
  huge: -2,
  gargantuan: -4,
  colossal: -8,
};

export function sizeModifier(size: Size): number {
  return SIZE_MODIFIERS[size];
}
