import { z } from "zod";
import { AbilityEnum, BaseEntrySchema, Kebab } from "./common";

// Habilidades del CRB (R16, design.md §4.2). `Knowledge` se expande en una entrada por materia
// (`knowledge-arcana`...); `Craft`, `Perform` y `Profession` son una entrada cada una.

export const SkillSchema = BaseEntrySchema.extend({
  keyAbility: AbilityEnum,
  trainedOnly: z.boolean(),
  armorCheckPenalty: z.boolean(),
  /** Materia de una entrada `knowledge-<materia>`; ausente en el resto de habilidades. */
  knowledgeSubject: Kebab.optional(),
}).refine(
  (skill) =>
    skill.knowledgeSubject === undefined
      ? !skill.id.startsWith("knowledge-")
      : skill.id === `knowledge-${skill.knowledgeSubject}`,
  { message: "knowledgeSubject debe corresponder al id `knowledge-<materia>` (y solo a él)" },
);
export type Skill = z.infer<typeof SkillSchema>;
