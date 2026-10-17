import { z } from "zod";
import { Kebab } from "./common";

// Clases con lista de conjuros (R21): las lanzadoras presentes en `classes` (Q15: sin sorcerer/wizard).
export const CASTER_CLASS_IDS = ["bard", "cleric", "druid", "paladin", "ranger"] as const;
export type CasterClassId = (typeof CASTER_CLASS_IDS)[number];

/** Niveles de conjuro como claves de texto "0".."9" (R21). */
const SpellLevelKey = z.string().regex(/^[0-9]$/, { message: 'el nivel debe ser "0".."9"' });

// Forma de `spells/lists.json`: clase -> nivel de conjuro -> ids de conjuros. Solo las clases con
// lista; una clave de `sorcerer` o `wizard` se rechaza (R21, Q15). La existencia de los ids en
// `spells` y la coherencia con `spells[].levels` las comprueba la regla `spell-lists` (R21, R22).
export const SpellListsSchema = z.partialRecord(
  z.enum(CASTER_CLASS_IDS),
  z.record(SpellLevelKey, z.array(Kebab)),
);
export type SpellLists = z.infer<typeof SpellListsSchema>;
