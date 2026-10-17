import { z } from "zod";
import { AbilityEnum, BaseEntrySchema, noHtmlTags } from "./common";

// Razas del CRB (R15, design.md §4.2). Todo sale de la página de la raza en la fuente; el tipo
// ("humanoid (dwarf)") y el subtipo NO se almacenan porque el texto de la raza del CRB no los dice.

export const RACE_SIZES = [
  "Fine",
  "Diminutive",
  "Tiny",
  "Small",
  "Medium",
  "Large",
  "Huge",
  "Gargantuan",
  "Colossal",
] as const;
export type RaceSize = (typeof RACE_SIZES)[number];

const NonEmpty = z.string().min(1);

/** Rasgo racial tal como lo escribe la fuente (`name` = etiqueta en negrita). */
export const RaceTraitSchema = z.strictObject({
  name: NonEmpty,
  textEn: NonEmpty.refine(noHtmlTags, { message: "el texto no puede contener etiquetas HTML" }),
});
export type RaceTrait = z.infer<typeof RaceTraitSchema>;

export const RaceLanguagesSchema = z.strictObject({
  /** Idiomas con los que empieza la raza (los de la lista de la fuente; "su idioma étnico" no es un nombre). */
  automatic: z.array(NonEmpty).min(1),
  /** Idiomas adicionales de la lista de la fuente para quien tiene Inteligencia alta. */
  bonus: z.array(NonEmpty),
  /** `true` si la fuente permite elegir cualquier idioma (humano, semielfo; sin lista de `bonus`). */
  bonusAny: z.boolean(),
});

export const RaceSchema = BaseEntrySchema.extend({
  /** Modificadores fijos de característica (valores no nulos; negativo = penalizador). */
  abilityModifiers: z.partialRecord(
    AbilityEnum,
    z
      .number()
      .int()
      .refine((n) => n !== 0),
  ),
  /** Bonificador a una característica elegida ("+2 to One Ability Score"). */
  abilityChoice: z.strictObject({ amount: z.number().int().positive() }).optional(),
  size: z.enum(RACE_SIZES),
  baseSpeedFt: z.number().int().positive(),
  languages: RaceLanguagesSchema,
  traits: z.array(RaceTraitSchema).min(1),
}).refine(
  (race) => Object.keys(race.abilityModifiers).length > 0 || race.abilityChoice !== undefined,
  { message: "la raza debe tener modificadores de característica fijos o un bonificador a elegir" },
);
export type Race = z.infer<typeof RaceSchema>;
