import { z } from "zod";
import { AbilityEnum, BaseEntrySchema, Kebab } from "./common";
import { ClassFeatureId } from "./class-feature";

// Clases de la campaña (R9-R12). La tabla se guarda desnormalizada (valores numéricos) y
// `progression` se deriva y se contrasta con las fórmulas de R11 (integrity/class-tables.ts).

export const CLASS_IDS = [
  "barbarian",
  "bard",
  "cleric",
  "druid",
  "paladin",
  "ranger",
  "rogue",
] as const;
export type ClassId = (typeof CLASS_IDS)[number];

export const BabProgression = z.enum(["full", "threeQuarters", "half"]);
export const SaveProgression = z.enum(["good", "poor"]);
export const ARMOR_CATEGORIES = ["light", "medium", "heavy"] as const;

/** Token de `proficiencies.weapons` para "el arma predilecta de su deidad" (clérigo). */
export const DEITY_FAVORED_WEAPON = "deity-favored-weapon";
/** Tokens de `proficiencies.shields` (no se enumeran ids: `shields` es del Lote E). */
export const SHIELD_ALL = "all";
export const SHIELD_ALL_EXCEPT_TOWER = "all-except-tower";

const SpellSlots = z.array(z.number().int().nonnegative().nullable()).length(10);
const OptionalSlots = SpellSlots.optional();

export const ClassLevelRowSchema = z.strictObject({
  level: z.number().int().min(1).max(20),
  bab: z.array(z.number().int()).min(1), // [6, 1] = +6/+1
  fort: z.number().int(),
  ref: z.number().int(),
  will: z.number().int(),
  special: z.array(z.string().min(1)), // nombres tal como en la tabla del SRD ("—" -> [])
  specialIds: z.array(ClassFeatureId), // resueltos a class-features (R14), alineados con `special`
  /** Índice = nivel de conjuro (0-9). "—" -> null; 0 -> 0 (R10). */
  spellsPerDay: OptionalSlots,
  /**
   * Hueco extra de dominio de la tabla del clérigo ("1+1"): `spellsPerDay[i]` guarda el 1 base y
   * este array el "+1". null donde la tabla no trae sumando. Ausente en clases sin dominios.
   * (Extensión sobre design.md §4.1, pendiente de decisión humana: ver progress/impl lote A.)
   */
  domainSpellsPerDay: OptionalSlots,
  /** Conjuros conocidos (tabla aparte del bardo), mismo indexado. */
  spellsKnown: OptionalSlots,
});

export const ClassSchema = BaseEntrySchema.extend({
  hitDie: z.union([z.literal(6), z.literal(8), z.literal(10), z.literal(12)]),
  skillRanksPerLevel: z.number().int().positive(), // sin modificador de Int
  classSkills: z.array(Kebab).min(1), // ids de `skills` (Knowledge expandido)
  alignment: z.string().min(1), // texto SRD
  startingWealthDice: z.string().regex(/^\d+d\d+$/), // "5d6" (x10 gp)
  proficiencies: z.strictObject({
    // ids de armas, "simple", "martial" o DEITY_FAVORED_WEAPON
    weapons: z.array(Kebab),
    armor: z.array(z.enum(ARMOR_CATEGORIES)),
    // [] (ninguno), [SHIELD_ALL] o [SHIELD_ALL_EXCEPT_TOWER]
    shields: z.array(z.enum([SHIELD_ALL, SHIELD_ALL_EXCEPT_TOWER])),
  }),
  progression: z.strictObject({
    bab: BabProgression,
    fort: SaveProgression,
    ref: SaveProgression,
    will: SaveProgression,
  }),
  casting: z
    .strictObject({
      ability: AbilityEnum,
      tradition: z.enum(["arcane", "divine"]),
      prepared: z.boolean(),
      spellListId: Kebab,
    })
    .optional(),
  table: z.array(ClassLevelRowSchema).length(20), // R10
});
export type ClassEntry = z.infer<typeof ClassSchema>;
export type ClassLevelRow = z.infer<typeof ClassLevelRowSchema>;
