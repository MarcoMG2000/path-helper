import { z } from "zod";

// Catálogo cerrado de categorías (R1). El registro con rutas y schemas vive en ../categories.ts.
export const CATEGORY_IDS = [
  "classes",
  "class-features",
  "domains",
  "races",
  "skills",
  "feats",
  "spells",
  "spell-lists",
  "weapons",
  "armor",
  "shields",
  "gear",
  "magic-items",
] as const;
export type Category = (typeof CATEGORY_IDS)[number];

/** Categorías cuyos shards son arrays de entradas (todas salvo `spell-lists`, que es un registro). */
export type EntryCategory = Exclude<Category, "spell-lists">;

export const ABILITY_ENUM_VALUES = ["str", "dex", "con", "int", "wis", "cha"] as const;
export const AbilityEnum = z.enum(ABILITY_ENUM_VALUES);
export type Ability = z.infer<typeof AbilityEnum>;

/** Hosts permitidos para `source` (R6). */
export const ALLOWED_SOURCE_HOSTS = [
  "aonprd.com",
  "www.aonprd.com",
  "d20pfsrd.com",
  "www.d20pfsrd.com",
] as const;

/** Prefijo literal obligatorio de `sourceRef` (R7). */
export const CRB_SOURCE_REF_PREFIX = "PRPG Core Rulebook";

export function isAllowedSourceUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" && (ALLOWED_SOURCE_HOSTS as readonly string[]).includes(url.hostname)
  );
}

/** Verdadero si NO hay etiquetas HTML (R8): `<tag ...>`, `</tag>` o comentarios/doctype. */
export function noHtmlTags(text: string): boolean {
  return !/<\/?[A-Za-z][^>]*>|<!--|<![A-Za-z]/.test(text);
}

/** Slug kebab-case del nombre inglés (R4): minúsculas, sin apóstrofes, no alfanuméricos a guion. */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’‘`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const KEBAB_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const Kebab = z.string().regex(KEBAB_REGEX);

export const BaseEntrySchema = z.strictObject({
  id: Kebab, // R4
  name: z.string().min(1), // EN del SRD
  textEn: z
    .string()
    .min(1)
    .refine(noHtmlTags, { message: "textEn no puede contener etiquetas HTML" }), // R8
  source: z
    .string()
    .url()
    .refine(isAllowedSourceUrl, { message: "source debe ser https en un host permitido" }), // R6
  sourceRef: z.string().startsWith(CRB_SOURCE_REF_PREFIX, {
    message: `sourceRef debe empezar por ${CRB_SOURCE_REF_PREFIX}`,
  }), // R7
  book: z.literal("CRB"), // R3
  needsReview: z.boolean().optional(),
});
export type BaseEntry = z.infer<typeof BaseEntrySchema>;
