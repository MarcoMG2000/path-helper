import { z } from "zod";
import { BaseEntrySchema } from "./common";

// Equipo del CRB (R24, R25, design.md §4.5): armas, armaduras, escudos y bienes mundanos.
// Dinero SIEMPRE en piezas de cobre enteras (`costCp`) más el literal de la fuente (`costRaw`).
// `costCp`/`weightLb` son `null` cuando la fuente no da una cantidad fija en esa unidad ("—",
// "special", "×2", "caster level × spell level × 10 gp", pesos expresados en cp...). El literal
// (`costRaw`/`weightRaw`) y `stats` (campos de la página tal cual) nunca se pierden.

/** Dados de daño: `1d6`, `1d8/1d8` (armas dobles) o un daño fijo (`1`, p. ej. la cerbatana pequeña). */
export const DiceSchema = z
  .string()
  .regex(/^(?:\d+d\d+(?:\/\d+d\d+)?|\d+)$/, "dados de daño no válidos");

const MoneyAndWeight = {
  costCp: z.number().int().nonnegative().nullable(),
  costRaw: z.string(),
  weightLb: z.number().nonnegative().nullable(),
  weightRaw: z.string(),
  /** Campos de la página (`Cost`, `Damage`, `Armor Bonus`...) con su texto literal. */
  stats: z.record(z.string().min(1), z.string()),
};

// --- armas ---------------------------------------------------------------------------------------

/** `Proficiency` de la fuente: simple/marcial/exótica y los tipos especiales de la tabla del CRB. */
export const WEAPON_CATEGORIES = ["simple", "martial", "exotic", "ammunition", "siege"] as const;
export const WEAPON_HANDEDNESS = [
  "unarmed",
  "light",
  "oneHanded",
  "twoHanded",
  "ranged",
  "ammunition",
  "siege",
] as const;
export const DAMAGE_TYPES = ["B", "P", "S"] as const;

export const WeaponSchema = BaseEntrySchema.extend({
  category: z.enum(WEAPON_CATEGORIES),
  handedness: z.enum(WEAPON_HANDEDNESS),
  ...MoneyAndWeight,
  /** `null` en munición y máquinas de asedio (un solo dado sin tamaños: ver `stats.Damage`). */
  damage: z.strictObject({ small: DiceSchema, medium: DiceSchema }).nullable(),
  /** `range` = valor mínimo de amenaza (19 en `19-20/x2`; 20 en `x2`). `null` si no hay crítico. */
  critical: z
    .strictObject({
      range: z.union([z.literal(18), z.literal(19), z.literal(20)]),
      multiplier: z.union([z.literal(2), z.literal(3), z.literal(4)]),
      /** Segundo extremo de un arma doble (`x3/x4`: multiplicador 3 y secundario 4). */
      secondaryMultiplier: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
    })
    .nullable(),
  rangeIncrementFt: z.number().int().positive().nullable(),
  /** Alcance mínimo de las máquinas de asedio indirecto (`300 ft. (100 ft. min.)`). */
  minRangeFt: z.number().int().positive().nullable(),
  /** B/P/S; `P or S` y `B and P` quedan como lista (el literal está en `stats.Type`). */
  damageTypes: z.array(z.enum(DAMAGE_TYPES)),
  special: z.array(z.string().min(1)),
  weaponGroups: z.array(z.string().min(1)),
});
export type Weapon = z.infer<typeof WeaponSchema>;

// --- armaduras y escudos ---------------------------------------------------------------------------

export const ARMOR_CATEGORIES = ["light", "medium", "heavy"] as const;

const DefenseStats = {
  maxDex: z.number().int().nonnegative().nullable(),
  armorCheckPenalty: z.number().int().max(0),
  arcaneSpellFailurePct: z.number().int().min(0).max(100),
  /** Velocidad con velocidad base 30 pies y 20 pies; `null` ("—") en escudos. */
  speed30: z.number().int().positive().nullable(),
  speed20: z.number().int().positive().nullable(),
};

export const ArmorSchema = BaseEntrySchema.extend({
  category: z.enum(ARMOR_CATEGORIES),
  ...MoneyAndWeight,
  armorBonus: z.number().int().nonnegative(),
  ...DefenseStats,
});
export type Armor = z.infer<typeof ArmorSchema>;

export const ShieldSchema = BaseEntrySchema.extend({
  ...MoneyAndWeight,
  shieldBonus: z.number().int().nonnegative(),
  ...DefenseStats,
});
export type Shield = z.infer<typeof ShieldSchema>;

// --- bienes y servicios ------------------------------------------------------------------------------

/**
 * Categoría de la tabla de AoN en la que figura el objeto (listados `EquipmentMisc.aspx?Category=`),
 * en kebab-case. `armor-extra`: complementos de la tabla de armaduras (punta de armadura/escudo,
 * guantelete cerrado), cuyo coste y peso son SUMANDOS (`+50 gp`, `+10 lbs.`).
 */
export const GEAR_CATEGORIES = [
  "adventuring-gear",
  "alchemical-remedies",
  "alchemical-tools",
  "alchemical-weapons",
  "animal-gear",
  "armor-extra",
  "clothing",
  "food-drink",
  "lodging-services",
  "mounts-pets",
  "tools",
  "transport-land",
  "transport-sea",
] as const;
export type GearCategory = (typeof GEAR_CATEGORIES)[number];

export const GearSchema = BaseEntrySchema.extend({
  category: z.enum(GEAR_CATEGORIES),
  ...MoneyAndWeight,
});
export type Gear = z.infer<typeof GearSchema>;
