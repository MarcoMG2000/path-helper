import type { Category } from "../../../src/data/schema/common";
import type { CachedPage } from "./fetch-cache";
import type { ProvenanceExpectations, ProvenancePatch } from "./provenance";
import type { SlugAliases } from "./slug";

// Contrato entre la CLI y los parsers de cada categoría (T0.14). Un parser es un módulo
// `scripts/srd/parsers/<módulo>.ts` (ver `parser-registry.ts`) que exporta `parse` y, si descubre
// URLs desde índices, `discover`. Ambos son funciones puras sobre HTML ya cacheado: sin red ni disco.

export interface ParserConfig {
  /** Encabezados de sección permitidos de la categoría (`section-allowlist.json`, R45). */
  allowedSections: readonly string[];
  slugAliases: SlugAliases;
}

/** HTML cacheado + URL de cada página registrada en la procedencia del ámbito procesado. */
export type ParserPage = Pick<CachedPage, "url" | "html" | "sha256">;

export interface ParserInput {
  category: Category;
  /** Subconjunto de `--category <c>:<subconjunto>` (`ring`, `a-c`...). `undefined` = toda la categoría. */
  subset: string | undefined;
  pages: readonly ParserPage[];
  config: ParserConfig;
}

/** Entrada serializable a JSON. Debe incluir `id` (R4) y los campos del schema de la categoría. */
export type ParsedEntry = { id: string } & Record<string, unknown>;

export interface NeedsReviewItem {
  id: string;
  reason: string;
}

/** Página descartada por pertenecer a otro libro (R46, R87) o por otro motivo documentado. */
export interface ExcludedPage {
  url: string;
  book: string;
  reason: string;
}

export interface ParserOutput {
  /** Entradas de categorías con `shape: "entries"`. */
  entries: readonly ParsedEntry[];
  /** Valor completo de categorías con `shape: "record"` (`spell-lists`). */
  record?: unknown;
  /**
   * Fichero (relativo a `src/data`, p. ej. `classes/druid.json`) donde va cada entrada. Si se
   * omite, la categoría debe tener un único fichero (`domains.json`, `equipment/weapons.json`...).
   */
  shardOf?: (entry: ParsedEntry) => string;
  /** Entradas con parseo dudoso: la CLI fuerza `needsReview: true` en ellas y las lista. */
  needsReview: readonly NeedsReviewItem[];
  excluded: readonly ExcludedPage[];
  /** Contadores para el informe de importación (`clases descartadas`, `kind: other`...). */
  counters?: Readonly<Record<string, number>>;
  /** Líneas libres para el informe (huecos de efectos, discrepancias...). */
  notes?: readonly string[];
  /** Metadatos a fusionar en la procedencia (`importedKinds`...). */
  provenancePatch?: Pick<ProvenancePatch, "importedKinds">;
}

export type CategoryParser = (input: ParserInput) => ParserOutput;

export interface DiscoverInput {
  category: Category;
  subset: string | undefined;
  /** Páginas de las semillas (índices) ya descargadas o cacheadas. */
  seedPages: readonly ParserPage[];
  config: ParserConfig;
}

export interface DiscoverOutput {
  /** URLs de entradas a descargar (la CLI las baja con tasa y caché). */
  urls: readonly string[];
  /** Recuentos observados en el índice filtrado por CRB; se congelan en la procedencia (R26). */
  expectations?: ProvenanceExpectations;
}

export interface ParserModule {
  parse: CategoryParser;
  discover?: (input: DiscoverInput) => DiscoverOutput;
}
