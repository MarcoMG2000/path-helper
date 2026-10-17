// Tipos compartidos del motor de reglas (design §3). Sin lógica de reglas.

export const ABILITY_IDS = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type AbilityId = (typeof ABILITY_IDS)[number];
export type AbilityScores = Readonly<Record<AbilityId, number>>;
export type AbilityModifiers = Readonly<Record<AbilityId, number>>;

// Los 19 tipos de bonificador del catálogo (R7). "untyped" = sin tipo.
export const BONUS_TYPES = [
  "alchemical",
  "armor",
  "circumstance",
  "competence",
  "deflection",
  "dodge",
  "enhancement",
  "inherent",
  "insight",
  "luck",
  "morale",
  "naturalArmor",
  "profane",
  "racial",
  "resistance",
  "sacred",
  "shield",
  "size",
  "untyped",
] as const;
export type BonusType = (typeof BONUS_TYPES)[number];

// "base" (el 10 de la CA, BAB, salvación base, rangos) y "ability" (modificador de
// característica) no son tipos de bonificador: son componentes que siempre suman (R12, OQ-13).
export type ModifierType = BonusType | "base" | "ability";

export type LineStatus = "applied" | "suppressed" | "excluded";
export type ExcludedReason = "touch" | "lostDexBonus";

export interface LineAdjustment {
  readonly reason: "maxDex";
  readonly originalValue: number; // modificador de Des antes del límite
  readonly cappedBy: string; // id de la fuente que impone el límite
}

export interface Modifier {
  readonly id: string; // identificador estable y único de la fuente
  readonly name: string; // nombre SRD en inglés; solo para mostrar
  readonly value: number; // entero; < 0 = penalizador
  readonly type: ModifierType;
  readonly adjustment?: LineAdjustment;
}

export interface BreakdownLine {
  readonly id: string;
  readonly name: string;
  readonly type: ModifierType;
  readonly value: number;
  readonly status: LineStatus;
  readonly suppressedBy?: string;
  readonly excludedReason?: ExcludedReason;
  readonly adjustment?: LineAdjustment;
}

export interface Breakdown {
  readonly stat: string; // "ac.normal", "save.fortitude", "skill.stealth", "initiative"...
  readonly total: number; // = Σ value de las líneas "applied"
  readonly lines: readonly BreakdownLine[]; // orden de entrada
}

export type Size =
  | "fine"
  | "diminutive"
  | "tiny"
  | "small"
  | "medium"
  | "large"
  | "huge"
  | "gargantuan"
  | "colossal";
