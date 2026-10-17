import type { z } from "zod";
import type { Category, EntryCategory } from "../schema/common";
import type { GlossaryShard } from "../schema/glossary";
import type { ProvenancePart } from "../schema/provenance";

export type IssueCategory = Category | "glossary" | "global";

export interface IntegrityIssue {
  category: IssueCategory;
  id?: string;
  rule: string;
  message: string;
}

/** Fichero + contenido JSON leído tal cual (sin validar). */
export interface DataPart {
  file: string;
  data: unknown;
}

/**
 * Datos cargados por la CLI (o sintéticos en los tests). Las reglas son puras: no hacen I/O.
 * Todo llega SIN validar; la regla `schema` informa de lo inválido y el resto de reglas se
 * protegen con `validEntries` o con comprobaciones propias.
 */
export interface LoadedDataset {
  /** Entradas crudas por categoría (los shards ya concatenados). */
  entries: Partial<Record<EntryCategory, readonly unknown[]>>;
  /** Fichero de origen de cada entrada (misma longitud que `entries[c]`), para los mensajes. */
  origins?: Partial<Record<EntryCategory, readonly string[]>>;
  /** Contenido de `spells/lists.json` (categoría `spell-lists`). */
  spellLists?: unknown;
  /** Ficheros de procedencia por categoría (`provenance/<cat>.json` y/o `provenance/<cat>/*.json`). */
  provenanceParts: Partial<Record<Category, readonly ProvenancePart[]>>;
  /** Ficheros de overrides por categoría (cada uno es un array de correcciones). */
  overrideParts: Partial<Record<Category, readonly DataPart[]>>;
  /** Ficheros de resúmenes por categoría (cada uno es un objeto `id -> resumen`). */
  summaryParts: Partial<Record<Category, readonly DataPart[]>>;
  glossary: {
    shards: readonly GlossaryShard[];
    /** Contenido textual de `glossary.es.json` si existe. */
    committedText?: string;
  };
}

export interface IntegrityContext {
  /** `slug-aliases.json`: categoría -> (`slug` o `kind.slug`) -> id (R4). */
  slugAliases: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** JSON de `scripts/srd/config/*.json` por nombre en camelCase (`magicSections`, `spellBatches`...). */
  config: Readonly<Record<string, unknown>>;
  /** Sustituye los schemas del registro (tests con datos sintéticos). */
  schemas?: Partial<Record<Category, z.ZodType>>;
}

export type IntegrityRule = (data: LoadedDataset, ctx: IntegrityContext) => IntegrityIssue[];

export function emptyDataset(): LoadedDataset {
  return {
    entries: {},
    provenanceParts: {},
    overrideParts: {},
    summaryParts: {},
    glossary: { shards: [] },
  };
}

export function defaultContext(): IntegrityContext {
  return { slugAliases: {}, config: {} };
}
