// CRB: Chapter 3 Classes - tablas de progresión de cada clase (BAB rápido/medio/lento; salvación
// buena/mala) y "Multiclassing": se suman los BAB y las salvaciones base de cada clase.
// Contrastado nivel a nivel (1-20) con las tablas de clase del SRD:
// https://www.d20pfsrd.com/classes/core-classes/ y https://aonprd.com/Rules.aspx?Name=Multiclassing&Category=Character%20Advancement
import { resolveModifiers } from "./modifiers";
import { err, ok, type Result } from "./result";
import type { Breakdown, Modifier } from "./types";

export type BabProgression = "good" | "medium" | "poor"; // Core: fast / medium / slow
export type SaveProgression = "good" | "poor";
export type SaveId = "fortitude" | "reflex" | "will";

export interface ClassLevel {
  readonly classId: string;
  readonly level: number; // 1..20
  readonly bab: BabProgression;
  readonly saves: Readonly<Record<SaveId, SaveProgression>>;
}

function checkLevel(level: number, field = "level"): Result<number> {
  if (!Number.isInteger(level) || level < 1 || level > 20) {
    return err("invalid_level", "Class level must be an integer between 1 and 20", field);
  }
  return ok(level);
}

function babValue(p: BabProgression, level: number): number {
  switch (p) {
    case "good":
      return level;
    case "medium":
      return Math.floor((3 * level) / 4);
    case "poor":
      return Math.floor(level / 2);
  }
}

function saveValue(p: SaveProgression, level: number): number {
  switch (p) {
    case "good":
      return 2 + Math.floor(level / 2);
    case "poor":
      return Math.floor(level / 3);
  }
}

export function baseAttackBonusFor(p: BabProgression, level: number): Result<number> {
  const lvl = checkLevel(level);
  if (!lvl.ok) return lvl;
  return ok(babValue(p, level));
}

export function baseSaveFor(p: SaveProgression, level: number): Result<number> {
  const lvl = checkLevel(level);
  if (!lvl.ok) return lvl;
  return ok(saveValue(p, level));
}

// Una línea `base` por clase. Valida niveles y clases repetidas (R29, R32).
function classBaseModifiers(
  classes: readonly ClassLevel[],
  pick: (c: ClassLevel) => { label: string; value: number },
): Result<Modifier[]> {
  const seen = new Set<string>();
  const out: Modifier[] = [];
  for (const c of classes) {
    const lvl = checkLevel(c.level, c.classId);
    if (!lvl.ok) return lvl;
    if (seen.has(c.classId)) {
      return err("duplicate_class", `Class "${c.classId}" appears more than once`, c.classId);
    }
    seen.add(c.classId);
    const { label, value } = pick(c);
    out.push({
      id: `class:${c.classId}`,
      name: `${c.classId} ${c.level} (${label})`,
      value,
      type: "base",
    });
  }
  return ok(out);
}

// Líneas `base` de salvación por clase (las reutiliza saves.ts).
export function classSaveModifiers(
  save: SaveId,
  classes: readonly ClassLevel[],
): Result<Modifier[]> {
  return classBaseModifiers(classes, (c) => ({
    label: `${save} ${c.saves[save]}`,
    value: saveValue(c.saves[save], c.level),
  }));
}

export function characterBaseAttackBonus(classes: readonly ClassLevel[]): Result<Breakdown> {
  const mods = classBaseModifiers(classes, (c) => ({
    label: `bab ${c.bab}`,
    value: babValue(c.bab, c.level),
  }));
  if (!mods.ok) return mods;
  return resolveModifiers("bab", mods.value);
}

export function characterBaseSave(save: SaveId, classes: readonly ClassLevel[]): Result<Breakdown> {
  const mods = classSaveModifiers(save, classes);
  if (!mods.ok) return mods;
  return resolveModifiers(`save.${save}.base`, mods.value);
}
