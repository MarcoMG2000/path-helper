import { z } from "zod";

// Procedencia por categoría (R39, R42, R98). Se almacena en provenance/<cat>.json o en
// provenance/<cat>/<lote>.json; la validación trata la unión de los ficheros como uno solo.
export const PROVENANCE_LICENSE = "OGL-1.0a" as const;

export const ProvenancePageSchema = z.strictObject({
  url: z.string().url(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  bytes: z.number().int().nonnegative(),
  fetchedAt: z.string().min(1),
});
export type ProvenancePage = z.infer<typeof ProvenancePageSchema>;

export const OverrideAppliedSchema = z.strictObject({
  id: z.string().min(1),
  field: z.string().min(1),
  parsedValue: z.unknown(), // valor que produjo el parser antes del override (detecta obsoletos)
});
export type OverrideApplied = z.infer<typeof OverrideAppliedSchema>;

const Counts = z.record(z.string(), z.number().int().nonnegative());

export const ProvenanceSchema = z.strictObject({
  license: z.literal(PROVENANCE_LICENSE),
  category: z.string().min(1),
  batch: z.string().min(1).optional(), // nombre del lote si el fichero es provenance/<cat>/<lote>.json
  importerVersion: z.string().min(1),
  expectedCount: z.number().int().nonnegative().optional(),
  expectedCountByKind: Counts.optional(), // magic-items (R67)
  expectedCountByBatch: Counts.optional(), // spells (R99)
  importedKinds: z.array(z.string()).optional(), // magic-items (R66)
  humanReviewed: z.boolean(),
  reviewedBy: z.string().optional(),
  reviewedAt: z.string().optional(),
  pages: z.array(ProvenancePageSchema),
  overridesApplied: z.array(OverrideAppliedSchema).optional(),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

export interface ProvenancePart {
  file: string;
  data: unknown;
}

export class ProvenanceMergeError extends Error {}

/**
 * Unión de los ficheros de una categoría (R98). Reglas: cada parte DEBE declarar
 * `license: "OGL-1.0a"`; el mismo `batch` o la misma URL de página en dos partes es error;
 * `expectedCount` se suma; los mapas por lote/`kind` se fusionan (clave repetida = error);
 * `importedKinds` es la unión; `humanReviewed` es la conjunción.
 */
export function mergeProvenance(parts: readonly ProvenancePart[]): Provenance {
  if (parts.length === 0) throw new ProvenanceMergeError("no hay ficheros de procedencia");
  const parsed = parts.map((part) => {
    const result = ProvenanceSchema.safeParse(part.data);
    if (!result.success) {
      const issue = result.error.issues[0];
      const where = issue && issue.path.length > 0 ? issue.path.join(".") : "(raíz)";
      throw new ProvenanceMergeError(
        `${part.file}: procedencia inválida en ${where}: ${issue?.message ?? "error"}`,
      );
    }
    return { file: part.file, value: result.data };
  });
  const seenBatches = new Map<string, string>();
  const seenUrls = new Map<string, string>();
  const pages: ProvenancePage[] = [];
  const byKind: Record<string, number> = {};
  const byBatch: Record<string, number> = {};
  const importedKinds = new Set<string>();
  let expectedCount: number | undefined;
  let humanReviewed = true;
  const first = parsed[0]!.value;
  for (const { file, value } of parsed) {
    if (value.category !== first.category) {
      throw new ProvenanceMergeError(
        `${file}: category "${value.category}" difiere de "${first.category}"`,
      );
    }
    if (value.batch !== undefined) {
      const previous = seenBatches.get(value.batch);
      if (previous !== undefined) {
        throw new ProvenanceMergeError(`lote "${value.batch}" duplicado en ${previous} y ${file}`);
      }
      seenBatches.set(value.batch, file);
    }
    for (const page of value.pages) {
      const previous = seenUrls.get(page.url);
      if (previous !== undefined) {
        throw new ProvenanceMergeError(`página ${page.url} duplicada en ${previous} y ${file}`);
      }
      seenUrls.set(page.url, file);
      pages.push(page);
    }
    if (value.expectedCount !== undefined) {
      expectedCount = (expectedCount ?? 0) + value.expectedCount;
    }
    const maps: [Record<string, number>, Record<string, number> | undefined][] = [
      [byKind, value.expectedCountByKind],
      [byBatch, value.expectedCountByBatch],
    ];
    for (const [target, source] of maps) {
      for (const [key, count] of Object.entries(source ?? {})) {
        if (key in target) {
          throw new ProvenanceMergeError(
            `${file}: clave de recuento "${key}" repetida entre ficheros`,
          );
        }
        target[key] = count;
      }
    }
    for (const kind of value.importedKinds ?? []) importedKinds.add(kind);
    humanReviewed = humanReviewed && value.humanReviewed;
  }
  pages.sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
  const merged: Provenance = {
    license: PROVENANCE_LICENSE,
    category: first.category,
    importerVersion: first.importerVersion,
    humanReviewed,
    pages,
  };
  if (expectedCount !== undefined) merged.expectedCount = expectedCount;
  if (Object.keys(byKind).length > 0) merged.expectedCountByKind = byKind;
  if (Object.keys(byBatch).length > 0) merged.expectedCountByBatch = byBatch;
  if (importedKinds.size > 0) merged.importedKinds = [...importedKinds].sort();
  const applied = parsed.flatMap(({ value }) => value.overridesApplied ?? []);
  if (applied.length > 0) merged.overridesApplied = applied;
  return merged;
}
