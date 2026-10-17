import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** Serialización canónica de los ficheros de datos: 2 espacios y `\n` final (R44). */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}

export function writeTextFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

export function writeJsonFile(path: string, value: unknown): void {
  writeTextFile(path, stableStringify(value));
}
