import { z } from "zod";
import { AbilityEnum, BaseEntrySchema, Kebab, noHtmlTags } from "./common";

const FeatText = z
  .string()
  .min(1)
  .refine(noHtmlTags, { message: "el texto no puede contener etiquetas HTML" });

// Dotes del CRB (R17-R19, design.md §4.3).

/** Tipos de dote admitidos (R17). `General` es el tipo de las dotes sin etiqueta de tipo. */
export const FEAT_TYPES = ["General", "Combat", "Metamagic", "Item Creation", "Critical"] as const;
export type FeatType = (typeof FEAT_TYPES)[number];

export const FeatSkillPrerequisiteSchema = z.strictObject({
  skillId: Kebab, // id de `skills` (p. ej. `knowledge-arcana`, `spellcraft`)
  ranks: z.number().int().positive(),
});

/**
 * Prerrequisitos estructurados. `raw` conserva siempre el texto literal de la fuente; lo que el
 * parser no sabe estructurar queda en `other` (nunca se descarta, R17).
 */
export const FeatPrerequisitesSchema = z.strictObject({
  raw: z.string(),
  abilities: z.partialRecord(AbilityEnum, z.number().int().positive()).optional(),
  bab: z.number().int().optional(),
  casterLevel: z.number().int().positive().optional(),
  featIds: z.array(Kebab).default([]),
  skills: z.array(FeatSkillPrerequisiteSchema).default([]),
  other: z.array(z.string().min(1)).default([]),
});
export type FeatPrerequisites = z.infer<typeof FeatPrerequisitesSchema>;

export const FeatSchema = BaseEntrySchema.extend({
  types: z.array(z.enum(FEAT_TYPES)).min(1),
  prerequisites: FeatPrerequisitesSchema,
  benefit: FeatText,
  normal: FeatText.optional(),
  special: FeatText.optional(),
});
export type Feat = z.infer<typeof FeatSchema>;
