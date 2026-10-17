import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { posix, resolve } from "node:path";
import { CATEGORIES, type CategoryDef } from "../../../src/data/categories";
import { pathsFor, toPosix } from "./paths";
import { writeTextFile } from "./json";

// Genera `src/data/<categoría>/index.ts`: lista estática de shards para la carga perezosa (R61).

function sorted(values: string[]): string[] {
  return [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function walk(dir: string, base: string, recursive: boolean): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    const rel = posix.join(base, name);
    if (statSync(full).isDirectory()) {
      if (recursive) out.push(...walk(full, rel, true));
    } else if (name.endsWith(".json")) {
      out.push(rel);
    }
  }
  return out;
}

/** Ficheros de datos de una categoría (rutas POSIX relativas a `src/data`). */
export function listShardFiles(dataDir: string, def: CategoryDef): string[] {
  const found = new Set<string>();
  for (const pattern of def.shardPatterns) {
    if (pattern.endsWith("/*.json")) {
      const dir = pattern.slice(0, -"/*.json".length);
      for (const file of walk(resolve(dataDir, dir), dir, false)) found.add(file);
    } else if (existsSync(resolve(dataDir, pattern))) {
      found.add(pattern);
    }
  }
  for (const excluded of def.shardExclude ?? []) found.delete(excluded);
  return sorted([...found]);
}

/** Ficheros de resúmenes ES de una categoría (recursivo). */
export function listSummaryFiles(dataDir: string, def: CategoryDef): string[] {
  return sorted(walk(resolve(dataDir, def.summaryDir), def.summaryDir, true));
}

function renderRefs(dir: string, files: readonly string[]): string {
  if (files.length === 0) return "[]";
  const items = files.map((file) => {
    let rel = posix.relative(dir, file);
    if (!rel.startsWith(".")) rel = `./${rel}`;
    return `  {\n    file: ${JSON.stringify(file)},\n    load: () => import(${JSON.stringify(rel)}),\n  },`;
  });
  return `[\n${items.join("\n")}\n]`;
}

export function renderCategoryIndex(
  def: Pick<CategoryDef, "dir">,
  shards: readonly string[],
  summaries: readonly string[],
): string {
  return [
    "// GENERADO por `npm run data:parse` / `npm run data:glossary` (scripts/srd/lib/shard-index.ts).",
    "// No editar a mano: lista estática de shards para la carga perezosa.",
    'import type { ShardRef } from "../shard-loader";',
    "",
    `export const SHARDS: readonly ShardRef[] = ${renderRefs(def.dir, shards)};`,
    "",
    `export const SUMMARIES: readonly ShardRef[] = ${renderRefs(def.dir, summaries)};`,
    "",
  ].join("\n");
}

export function indexPath(dataDir: string, def: CategoryDef): string {
  return resolve(dataDir, def.dir, "index.ts");
}

export function expectedIndex(dataDir: string, def: CategoryDef): string {
  return renderCategoryIndex(def, listShardFiles(dataDir, def), listSummaryFiles(dataDir, def));
}

/** Escribe (o actualiza) el `index.ts` de las categorías indicadas (todas por defecto). */
export function writeCategoryIndexes(
  root?: string,
  categories: readonly CategoryDef[] = CATEGORIES,
): string[] {
  const { data } = pathsFor(root);
  const written: string[] = [];
  for (const def of categories) {
    const path = indexPath(data, def);
    const content = expectedIndex(data, def);
    if (!existsSync(path) || readFileSync(path, "utf8") !== content) {
      writeTextFile(path, content);
      written.push(toPosix(posix.join(def.dir, "index.ts")));
    }
  }
  return written;
}

/** Categorías cuyo `index.ts` no coincide con los ficheros en disco (regla `index.stale`). */
export function findStaleIndexes(root?: string): string[] {
  const { data } = pathsFor(root);
  return CATEGORIES.filter((def) => {
    const path = indexPath(data, def);
    return !existsSync(path) || readFileSync(path, "utf8") !== expectedIndex(data, def);
  }).map((def) => def.id);
}
