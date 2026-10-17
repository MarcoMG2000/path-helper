import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Category } from "../../../src/data/schema/common";
import type { OverrideApplied } from "../../../src/data/schema/provenance";
import {
  OverrideFileSchema,
  getAtPath,
  jsonEqual,
  setAtPath,
  type Override,
} from "../../../src/data/schema/override";
import { toPosix } from "./paths";

export interface OverrideFile {
  file: string;
  data: unknown;
}

export function overridesFile(dataDir: string, category: Category, batch?: string): string {
  return batch === undefined
    ? resolve(dataDir, "overrides", `${category}.json`)
    : resolve(dataDir, "overrides", category, `${batch}.json`);
}

/** Lee `overrides/<cat>.json` y/o `overrides/<cat>/*.json` (R98): la unión es el fichero de la categoría. */
export function readOverrideParts(dataDir: string, category: Category): OverrideFile[] {
  const parts: OverrideFile[] = [];
  const single = overridesFile(dataDir, category);
  if (existsSync(single)) {
    parts.push({
      file: `overrides/${category}.json`,
      data: JSON.parse(readFileSync(single, "utf8")),
    });
  }
  const dir = resolve(dataDir, "overrides", category);
  if (existsSync(dir)) {
    for (const name of readdirSync(dir)
      .filter((n) => n.endsWith(".json"))
      .sort()) {
      parts.push({
        file: toPosix(`overrides/${category}/${name}`),
        data: JSON.parse(readFileSync(resolve(dir, name), "utf8")),
      });
    }
  }
  return parts;
}

/** Valida las partes y devuelve la unión de correcciones; lanza si alguna es inválida (R49). */
export function parseOverrideParts(parts: readonly OverrideFile[]): Override[] {
  const all: Override[] = [];
  for (const part of parts) {
    const parsed = OverrideFileSchema.safeParse(part.data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new Error(
        `${part.file}: override inválido en ${issue?.path.join(".") || "(raíz)"}: ${issue?.message ?? ""}`,
      );
    }
    all.push(...parsed.data);
  }
  return all;
}

export interface ApplyOverridesResult<T> {
  entries: T[];
  applied: OverrideApplied[];
  /** Overrides cuyo valor ya coincidía con el parseado (R49: obsoletos). */
  obsolete: Override[];
  /** Overrides con un id que no existe entre las entradas. */
  unknownTarget: Override[];
}

/** Aplica las correcciones sobre una copia profunda de las entradas parseadas. */
export function applyOverrides<T extends { id: string }>(
  parsed: readonly T[],
  overrides: readonly Override[],
): ApplyOverridesResult<T> {
  const entries = structuredClone(parsed) as T[];
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const applied: OverrideApplied[] = [];
  const obsolete: Override[] = [];
  const unknownTarget: Override[] = [];
  for (const override of overrides) {
    const target = byId.get(override.id);
    if (!target) {
      unknownTarget.push(override);
      continue;
    }
    const before = getAtPath(target, override.field);
    if (jsonEqual(before, override.value)) {
      obsolete.push(override);
      continue;
    }
    setAtPath(target, override.field, structuredClone(override.value));
    applied.push({ id: override.id, field: override.field, parsedValue: before ?? null });
  }
  return { entries, applied, obsolete, unknownTarget };
}
