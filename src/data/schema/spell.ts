import { z } from "zod";
import { BaseEntrySchema, Kebab } from "./common";

// Catálogo cerrado de clases del CRB (R92) y escuelas (R101): valores fijados por design.md §4.4.
export const CRB_CLASS_IDS = [
  "barbarian",
  "bard",
  "cleric",
  "druid",
  "fighter",
  "monk",
  "paladin",
  "ranger",
  "rogue",
  "sorcerer",
  "wizard",
] as const;
export type CrbClassId = (typeof CRB_CLASS_IDS)[number];

export const SPELL_SCHOOLS = [
  "abjuration",
  "conjuration",
  "divination",
  "enchantment",
  "evocation",
  "illusion",
  "necromancy",
  "transmutation",
  "universal",
] as const;
export type SpellSchoolId = (typeof SPELL_SCHOOLS)[number];

// Subescuelas y descriptores del capítulo 9 del CRB (catálogos cerrados). Una línea como
// «[see text]» no es un descriptor (lo decide el texto del conjuro) y no se guarda.
export const SPELL_SUBSCHOOLS = [
  "calling",
  "charm",
  "compulsion",
  "creation",
  "figment",
  "glamer",
  "healing",
  "pattern",
  "phantasm",
  "polymorph",
  "scrying",
  "shadow",
  "summoning",
  "teleportation",
] as const;
export const SPELL_DESCRIPTORS = [
  "acid",
  "air",
  "chaotic",
  "cold",
  "curse",
  "darkness",
  "death",
  "disease",
  "earth",
  "electricity",
  "emotion",
  "evil",
  "fear",
  "fire",
  "force",
  "good",
  "language-dependent",
  "lawful",
  "light",
  "mind-affecting",
  "pain",
  "poison",
  "shadow",
  "sonic",
  "water",
] as const;

export const CASTING_TIME_UNITS = [
  "free",
  "immediate",
  "swift",
  "standard",
  "full-round",
  "round",
  "minute",
  "hour",
  "other",
] as const;
export const RANGE_KINDS = [
  "personal",
  "touch",
  "close",
  "medium",
  "long",
  "unlimited",
  "fixed",
  "other",
] as const;
export const TARGETING_KINDS = ["target", "area", "effect", "other"] as const;
export const DURATION_KINDS = [
  "instantaneous",
  "permanent",
  "concentration",
  "timed",
  "other",
] as const;
export const DURATION_UNITS = ["round", "minute", "hour", "day"] as const;
export const SAVE_KINDS = ["none", "fortitude", "reflex", "will", "multiple", "other"] as const;
export const SAVE_EFFECTS = ["negates", "half", "partial", "disbelief", "other"] as const;
export const SR_APPLIES = ["yes", "no", "other"] as const;

// Los campos estructurados se derivan de su `raw` con `classifySpellFields` (R96); `raw` es siempre
// el texto literal de la fuente. Las propiedades opcionales ausentes se omiten del JSON.
export const CastingTimeSchema = z.strictObject({
  raw: z.string(),
  unit: z.enum(CASTING_TIME_UNITS),
  amount: z.number().int().positive().nullable(),
});

export const ComponentsSchema = z.strictObject({
  verbal: z.boolean(),
  somatic: z.boolean(),
  material: z.boolean(),
  focus: z.boolean(),
  divineFocus: z.boolean(),
  xp: z.boolean(),
  raw: z.string(),
  details: z
    .strictObject({
      material: z.string().optional(),
      focus: z.string().optional(),
      divineFocus: z.string().optional(),
    })
    .optional(),
});

export const RangeSchema = z
  .strictObject({
    raw: z.string(),
    kind: z.enum(RANGE_KINDS),
    fixedFt: z.number().int().positive().optional(),
  })
  .refine((r) => (r.kind === "fixed") === (r.fixedFt !== undefined), {
    message: "fixedFt es obligatorio con kind fixed y no se admite con otro kind",
    path: ["fixedFt"],
  });

export const TargetingSchema = z.strictObject({
  kind: z.enum(TARGETING_KINDS),
  raw: z.string().min(1),
});

export const DurationSchema = z
  .strictObject({
    raw: z.string(),
    kind: z.enum(DURATION_KINDS),
    dismissible: z.boolean(),
    amount: z.number().int().positive().optional(),
    unit: z.enum(DURATION_UNITS).optional(),
    perLevel: z.boolean().optional(),
  })
  .refine(
    (d) =>
      d.kind === "timed"
        ? d.amount !== undefined && d.unit !== undefined && d.perLevel !== undefined
        : d.amount === undefined && d.unit === undefined && d.perLevel === undefined,
    { message: "amount, unit y perLevel solo se declaran (todos) con kind timed", path: ["kind"] },
  );

export const SavingThrowSchema = z.strictObject({
  raw: z.string(),
  kind: z.enum(SAVE_KINDS),
  effect: z.enum(SAVE_EFFECTS).optional(),
  harmless: z.boolean(),
  object: z.boolean(),
});

export const SpellResistanceSchema = z.strictObject({
  raw: z.string(),
  applies: z.enum(SR_APPLIES),
  harmless: z.boolean(),
  object: z.boolean(),
});

/**
 * Conjuro del capítulo 10 del CRB (R20, design.md §4.4). `levels` mapea clave de nivel -> nivel de
 * conjuro; la clave es un id de `CRB_CLASS_IDS` (también `sorcerer` y `wizard` aunque no tengan
 * entrada en `classes`) o el id de un dominio (R91, R92: el catálogo se comprueba en integridad).
 */
export const SpellSchema = BaseEntrySchema.extend({
  school: z.enum(SPELL_SCHOOLS), // R101
  subschool: z.enum(SPELL_SUBSCHOOLS).optional(),
  /** Otras subescuelas impresas tras la primera: «(calling or creation)», «(figment, glamer)». */
  additionalSubschools: z.array(z.enum(SPELL_SUBSCHOOLS)).min(1).optional(),
  /** «[fire or cold]» -> ["fire","cold"]; «[see text]» -> [] (R101). */
  descriptors: z.array(z.enum(SPELL_DESCRIPTORS)),
  levels: z.record(Kebab, z.number().int().min(0).max(9)), // R91
  castingTime: CastingTimeSchema,
  components: ComponentsSchema,
  range: RangeSchema,
  targeting: z.array(TargetingSchema), // [] si la página no trae objetivo, área ni efecto
  duration: DurationSchema,
  savingThrow: SavingThrowSchema,
  spellResistance: SpellResistanceSchema,
  shortDescriptionEn: z.string().min(1).optional(),
});
export type Spell = z.infer<typeof SpellSchema>;
