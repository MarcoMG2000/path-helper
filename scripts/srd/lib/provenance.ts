import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  PROVENANCE_LICENSE,
  ProvenanceSchema,
  mergeProvenance,
  type OverrideApplied,
  type Provenance,
  type ProvenancePage,
  type ProvenancePart,
} from "../../../src/data/schema/provenance";
import type { Category } from "../../../src/data/schema/common";
import { CacheMissError, type CachedPage, type FetchCache } from "./fetch-cache";
import { toPosix } from "./paths";
import { writeJsonFile } from "./json";

export { mergeProvenance };

export const IMPORTER_VERSION = "1";

/** Ruta del fichero de procedencia: `provenance/<cat>.json` o `provenance/<cat>/<lote>.json` (R98). */
export function provenanceFile(dataDir: string, category: Category, batch?: string): string {
  return batch === undefined
    ? resolve(dataDir, "provenance", `${category}.json`)
    : resolve(dataDir, "provenance", category, `${batch}.json`);
}

/** Lee tanto `<cat>.json` como el directorio `<cat>/*.json`: la unión es el fichero de la categoría. */
export function readProvenanceParts(dataDir: string, category: Category): ProvenancePart[] {
  const parts: ProvenancePart[] = [];
  const single = provenanceFile(dataDir, category);
  if (existsSync(single)) {
    parts.push({
      file: `provenance/${category}.json`,
      data: JSON.parse(readFileSync(single, "utf8")),
    });
  }
  const dir = resolve(dataDir, "provenance", category);
  if (existsSync(dir)) {
    for (const name of readdirSync(dir)
      .filter((n) => n.endsWith(".json"))
      .sort()) {
      parts.push({
        file: toPosix(`provenance/${category}/${name}`),
        data: JSON.parse(readFileSync(resolve(dir, name), "utf8")),
      });
    }
  }
  return parts;
}

export function readMergedProvenance(dataDir: string, category: Category): Provenance | undefined {
  const parts = readProvenanceParts(dataDir, category);
  return parts.length === 0 ? undefined : mergeProvenance(parts);
}

/**
 * Partes de procedencia que alimentan un parseo. En categorías por lotes con subconjunto se usan
 * la parte del propio lote y la del índice (`index`); en el resto, todas.
 */
export function selectParts(
  parts: readonly ProvenancePart[],
  batched: boolean,
  subset: string | undefined,
): ProvenancePart[] {
  if (!batched || subset === undefined) return [...parts];
  return parts.filter((part) => {
    const batch = (part.data as { batch?: unknown }).batch;
    return batch === subset || batch === "index";
  });
}

export interface ProvenanceExpectations {
  expectedCount?: number;
  expectedCountByKind?: Record<string, number>;
  expectedCountByBatch?: Record<string, number>;
}

export interface ProvenancePatch extends ProvenanceExpectations {
  importedKinds?: readonly string[];
  overridesApplied?: readonly OverrideApplied[];
}

export interface UpdateProvenanceInput {
  dataDir: string;
  category: Category;
  batch?: string;
  pages?: readonly (CachedPage | ProvenancePage)[];
  /** Los recuentos esperados se congelan: solo se fijan si faltan (R26). */
  expectations?: ProvenanceExpectations;
  patch?: ProvenancePatch;
}

export interface UpdateProvenanceResult {
  file: string;
  /** Recuentos congelados que difieren de los observados (no se sobrescriben). */
  frozenMismatches: string[];
}

/** Crea o actualiza el fichero de procedencia conservando lo ya congelado o revisado. */
export function updateProvenance(input: UpdateProvenanceInput): UpdateProvenanceResult {
  const { dataDir, category, batch } = input;
  const file = provenanceFile(dataDir, category, batch);
  const existing = existsSync(file)
    ? ProvenanceSchema.parse(JSON.parse(readFileSync(file, "utf8")))
    : undefined;

  const pages = new Map<string, ProvenancePage>();
  for (const page of existing?.pages ?? []) pages.set(page.url, page);
  for (const page of input.pages ?? []) {
    pages.set(page.url, {
      url: page.url,
      sha256: page.sha256,
      bytes: page.bytes,
      fetchedAt: page.fetchedAt,
    });
  }

  const next: Provenance = {
    license: PROVENANCE_LICENSE,
    category,
    ...(batch === undefined ? {} : { batch }),
    importerVersion: IMPORTER_VERSION,
    humanReviewed: existing?.humanReviewed ?? false,
    ...(existing?.reviewedBy === undefined ? {} : { reviewedBy: existing.reviewedBy }),
    ...(existing?.reviewedAt === undefined ? {} : { reviewedAt: existing.reviewedAt }),
    pages: [...pages.values()].sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0)),
  };

  const frozenMismatches: string[] = [];
  const freeze = (
    name: "expectedCount" | "expectedCountByKind" | "expectedCountByBatch",
    observed: number | Record<string, number> | undefined,
  ): void => {
    const current = existing?.[name];
    if (observed === undefined) {
      if (current !== undefined) (next as unknown as Record<string, unknown>)[name] = current;
      return;
    }
    if (typeof observed === "number") {
      if (current === undefined) next.expectedCount = observed;
      else {
        next.expectedCount = current as number;
        if (current !== observed) {
          frozenMismatches.push(`expectedCount: congelado ${current}, observado ${observed}`);
        }
      }
      return;
    }
    const merged: Record<string, number> = { ...((current as Record<string, number>) ?? {}) };
    for (const [key, count] of Object.entries(observed)) {
      if (merged[key] === undefined) merged[key] = count;
      else if (merged[key] !== count) {
        frozenMismatches.push(`${name}[${key}]: congelado ${merged[key]}, observado ${count}`);
      }
    }
    (next as unknown as Record<string, unknown>)[name] = merged;
  };
  freeze("expectedCount", input.expectations?.expectedCount);
  freeze("expectedCountByKind", input.expectations?.expectedCountByKind);
  freeze("expectedCountByBatch", input.expectations?.expectedCountByBatch);

  const kinds = new Set([
    ...(existing?.importedKinds ?? []),
    ...(input.patch?.importedKinds ?? []),
  ]);
  if (kinds.size > 0) next.importedKinds = [...kinds].sort();

  const applied = new Map<string, OverrideApplied>();
  for (const record of [
    ...(existing?.overridesApplied ?? []),
    ...(input.patch?.overridesApplied ?? []),
  ]) {
    applied.set(`${record.id}|${record.field}`, record);
  }
  if (applied.size > 0) next.overridesApplied = [...applied.values()];

  writeJsonFile(file, next);
  return { file, frozenMismatches };
}

export class DriftError extends Error {
  constructor(readonly drifted: readonly string[]) {
    super(
      `el sha256 de ${drifted.length} página(s) cacheada(s) no coincide con la procedencia ` +
        `(usa --accept-drift si es intencionado):\n${drifted.map((u) => `  - ${u}`).join("\n")}`,
    );
  }
}

export interface LoadedPages {
  pages: CachedPage[];
  /** URLs registradas en la procedencia que no están en la caché local. */
  missing: string[];
  drifted: string[];
}

/**
 * Carga offline las páginas registradas en la procedencia (R43) y comprueba su sha256 (R47).
 * Con `acceptDrift` las páginas modificadas se devuelven igualmente (y se listan en `drifted`).
 */
export function loadCachedPages(
  cache: Pick<FetchCache, "readCached">,
  registered: readonly ProvenancePage[],
  options: { acceptDrift?: boolean } = {},
): LoadedPages {
  const pages: CachedPage[] = [];
  const missing: string[] = [];
  const drifted: string[] = [];
  for (const entry of registered) {
    try {
      const page = cache.readCached(entry.url);
      if (page.sha256 !== entry.sha256) drifted.push(entry.url);
      pages.push(page);
    } catch (error) {
      if (error instanceof CacheMissError) missing.push(entry.url);
      else throw error;
    }
  }
  if (drifted.length > 0 && !options.acceptDrift) throw new DriftError(drifted);
  return { pages, missing, drifted };
}

export interface VerifyResult {
  checked: number;
  differing: { url: string; registered: string; current: string }[];
  failed: { url: string; error: string }[];
}

/** `--verify` (R48): vuelve a descargar y lista las diferencias; no escribe nada. */
export async function verifyProvenance(
  cache: Pick<FetchCache, "fetchFresh">,
  registered: readonly ProvenancePage[],
): Promise<VerifyResult> {
  const result: VerifyResult = { checked: 0, differing: [], failed: [] };
  for (const entry of registered) {
    result.checked++;
    try {
      const fresh = await cache.fetchFresh(entry.url);
      if (fresh.sha256 !== entry.sha256) {
        result.differing.push({ url: entry.url, registered: entry.sha256, current: fresh.sha256 });
      }
    } catch (error) {
      result.failed.push({
        url: entry.url,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return result;
}
