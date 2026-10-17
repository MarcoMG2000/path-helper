import { z } from "zod";
import { CATEGORY_IDS, type Category } from "./common";

// Glosario ES (R31, R32). Claves: `<categoría>:<id>` (kind entry) o `term:<id>` (kind term).
export const GlossaryEntrySchema = z
  .strictObject({
    es: z.string().min(1),
    verified: z.boolean(),
    origin: z.enum(["human", "draft"]),
    kind: z.enum(["entry", "term"]),
    note: z.string().optional(),
  })
  .refine((g) => !g.verified || g.origin === "human", {
    message: "verified:true exige origin:human", // R32
  });
export type GlossaryEntry = z.infer<typeof GlossaryEntrySchema>;

export const GLOSSARY_KEY_REGEX = /^[a-z0-9-]+:[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

export const GlossaryFileSchema = z.record(
  z.string().regex(GLOSSARY_KEY_REGEX),
  GlossaryEntrySchema,
);
export type GlossaryFile = Record<string, GlossaryEntry>;

export function glossaryKey(category: Category, id: string): string {
  return `${category}:${id}`;
}

export function parseGlossaryKey(key: string): { prefix: string; id: string } {
  const at = key.indexOf(":");
  return { prefix: key.slice(0, at), id: key.slice(at + 1) };
}

export function isCategoryId(value: string): value is Category {
  return (CATEGORY_IDS as readonly string[]).includes(value);
}

export interface GlossaryShard {
  file: string;
  data: unknown;
}

export class GlossaryMergeError extends Error {}

/** Fusión determinista de shards (R36): claves ordenadas; clave repetida entre shards = error. */
export function mergeGlossaryShards(shards: readonly GlossaryShard[]): Record<string, unknown> {
  const origin = new Map<string, string>();
  const merged: Record<string, unknown> = {};
  for (const shard of [...shards].sort((a, b) =>
    a.file < b.file ? -1 : a.file > b.file ? 1 : 0,
  )) {
    if (typeof shard.data !== "object" || shard.data === null || Array.isArray(shard.data)) {
      throw new GlossaryMergeError(`${shard.file}: el shard de glosario debe ser un objeto`);
    }
    for (const [key, value] of Object.entries(shard.data)) {
      const previous = origin.get(key);
      if (previous !== undefined) {
        throw new GlossaryMergeError(
          `clave de glosario duplicada "${key}" en ${previous} y ${shard.file}`,
        );
      }
      origin.set(key, shard.file);
      merged[key] = value;
    }
  }
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(merged).sort()) sorted[key] = merged[key];
  return sorted;
}

/** Serialización canónica de `glossary.es.json`: 2 espacios y `\n` final. */
export function serializeGlossary(glossary: Record<string, unknown>): string {
  return JSON.stringify(glossary, null, 2) + "\n";
}
