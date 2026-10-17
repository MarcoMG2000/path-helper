import type { z } from "zod";
import { getCategory } from "../categories";
import type { Category, EntryCategory } from "../schema/common";
import { mergeProvenance, type Provenance } from "../schema/provenance";
import type { IntegrityContext, LoadedDataset } from "./types";

export function schemaFor(category: Category, ctx: IntegrityContext): z.ZodType {
  return ctx.schemas?.[category] ?? getCategory(category).schema;
}

const validCache = new WeakMap<LoadedDataset, Map<string, readonly unknown[]>>();

/**
 * Entradas de una categoría que superan su schema. Las inválidas las informa la regla `schema`;
 * las demás reglas trabajan solo con las válidas para no duplicar hallazgos.
 */
export function validEntries(
  data: LoadedDataset,
  category: EntryCategory,
  ctx: IntegrityContext,
): readonly unknown[] {
  let byCategory = validCache.get(data);
  if (!byCategory) {
    byCategory = new Map();
    validCache.set(data, byCategory);
  }
  const key = `${category}:${ctx.schemas?.[category] ? "custom" : "registry"}`;
  const cached = byCategory.get(key);
  if (cached) return cached;
  const schema = schemaFor(category, ctx);
  const result = (data.entries[category] ?? []).flatMap((raw) => {
    const parsed = schema.safeParse(raw);
    return parsed.success ? [parsed.data] : [];
  });
  byCategory.set(key, result);
  return result;
}

export interface ProvenanceResult {
  value?: Provenance;
  error?: string;
}

/** Unión de la procedencia de una categoría (R98); `undefined` si no hay ficheros. */
export function provenanceOf(
  data: LoadedDataset,
  category: Category,
): ProvenanceResult | undefined {
  const parts = data.provenanceParts[category];
  if (!parts || parts.length === 0) return undefined;
  try {
    return { value: mergeProvenance(parts) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function idOf(raw: unknown, index: number): string {
  return isRecord(raw) && typeof raw["id"] === "string" ? raw["id"] : `#${index}`;
}
