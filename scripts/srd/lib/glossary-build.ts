import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { posix, resolve } from "node:path";
import {
  mergeGlossaryShards,
  serializeGlossary,
  type GlossaryShard,
} from "../../../src/data/schema/glossary";
import { writeTextFile } from "./json";

function walk(dir: string, base: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = resolve(dir, name);
    const rel = posix.join(base, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, rel));
    else if (name.endsWith(".es.json")) out.push(rel);
  }
  return out;
}

/** Shards `src/data/glossary/**.es.json` (rutas relativas a `src/data`). */
export function listGlossaryShards(dataDir: string): GlossaryShard[] {
  return walk(resolve(dataDir, "glossary"), "glossary").map((file) => ({
    file,
    data: JSON.parse(readFileSync(resolve(dataDir, file), "utf8")) as unknown,
  }));
}

export interface GlossaryBuild {
  text: string;
  keys: number;
}

/** Fusión determinista de shards -> texto de `glossary.es.json` (R36). Lanza si hay claves repetidas. */
export function buildGlossary(shards: readonly GlossaryShard[]): GlossaryBuild {
  const merged = mergeGlossaryShards(shards);
  return { text: serializeGlossary(merged), keys: Object.keys(merged).length };
}

export function glossaryPath(dataDir: string): string {
  return resolve(dataDir, "glossary.es.json");
}

/** `npm run data:glossary`: escribe `src/data/glossary.es.json` a partir de los shards. */
export function writeGlossary(dataDir: string): GlossaryBuild & { path: string } {
  const build = buildGlossary(listGlossaryShards(dataDir));
  const path = glossaryPath(dataDir);
  writeTextFile(path, build.text);
  return { ...build, path };
}
