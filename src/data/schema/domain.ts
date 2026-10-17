import { z } from "zod";
import { BaseEntrySchema, Kebab } from "./common";
import { AbilityTypeSchema } from "./class-feature";

// Dominios del CRB (R23): poderes concedidos y conjuros de dominio de nivel 1 a 9.

export const DomainPowerSchema = z.strictObject({
  name: z.string().min(1),
  abilityType: AbilityTypeSchema,
  /** Nivel de clérigo en que se obtiene (1 si el texto no indica otro). */
  level: z.number().int().min(1).max(20),
  textEn: z.string().min(1),
});

export const DomainSpellSchema = z.strictObject({
  level: z.number().int().min(1).max(9),
  /** Slug del nombre del conjuro: se contrasta con `spells` en la integración (R23). */
  spellId: Kebab,
  name: z.string().min(1),
  /** Cualificador literal de la fuente, p. ej. "air only" o "evil spell only". */
  note: z.string().min(1).optional(),
});

export const DomainSchema = BaseEntrySchema.extend({
  grantedPowers: z.array(DomainPowerSchema).min(1),
  spells: z.array(DomainSpellSchema).length(9),
}).superRefine((entry, ctx) => {
  entry.spells.forEach((spell, index) => {
    if (spell.level !== index + 1) {
      ctx.addIssue({
        code: "custom",
        path: ["spells", index, "level"],
        message: `los conjuros de dominio deben ir en orden de nivel 1-9 (posición ${index + 1})`,
      });
    }
  });
});
export type Domain = z.infer<typeof DomainSchema>;
