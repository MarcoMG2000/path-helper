import { z } from "zod";
import { BaseEntrySchema, Kebab } from "./common";

// Capacidades de clase y sus opciones elegibles (R13). Los ids llevan prefijo de clase:
//   feature: `<classId>.<slug>`                        (`paladin.smite-evil`)
//   option:  `<classId>.<grupo>.<slug>`                (`rogue.talent.bleeding-attack`,
//            `cleric.domain.air.lightning-arc`)
export const CLASS_FEATURE_ID_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)+$/;
export const ClassFeatureId = z.string().regex(CLASS_FEATURE_ID_REGEX, {
  message: "id de capacidad de clase: <classId>.<slug> en kebab-case",
});

export const ABILITY_TYPES = ["Ex", "Su", "Sp"] as const;
export const AbilityTypeSchema = z.enum(ABILITY_TYPES).nullable();
export type AbilityType = z.infer<typeof AbilityTypeSchema>;

export const ClassFeatureSchema = BaseEntrySchema.extend({
  id: ClassFeatureId,
  classId: Kebab,
  /** Primer nivel de clase en que se obtiene (o desde el que puede elegirse, si es una opción). */
  level: z.number().int().min(1).max(20),
  abilityType: AbilityTypeSchema, // R13: Ex | Su | Sp | null
  kind: z.enum(["feature", "option"]),
  parentId: ClassFeatureId.optional(), // R13: obligatorio en las opciones
}).superRefine((entry, ctx) => {
  if (!entry.id.startsWith(`${entry.classId}.`)) {
    ctx.addIssue({
      code: "custom",
      path: ["id"],
      message: `el id debe empezar por "${entry.classId}."`,
    });
  }
  if (entry.kind === "option" && entry.parentId === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["parentId"],
      message: "una opción exige parentId (R13)",
    });
  }
  if (entry.kind === "feature" && entry.parentId !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["parentId"],
      message: "una capacidad (kind feature) no lleva parentId",
    });
  }
  if (entry.parentId !== undefined && !entry.parentId.startsWith(`${entry.classId}.`)) {
    ctx.addIssue({
      code: "custom",
      path: ["parentId"],
      message: `parentId debe pertenecer a la clase "${entry.classId}"`,
    });
  }
});
export type ClassFeature = z.infer<typeof ClassFeatureSchema>;
