import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CATEGORIES } from "../../../src/data/categories";
import type {
  DataPart,
  IntegrityContext,
  IntegrityIssue,
  LoadedDataset,
} from "../../../src/data/integrity/types";
import type { Category, EntryCategory } from "../../../src/data/schema/common";
import type { SummaryFile } from "../../../src/data/schema/summary";
import { listGlossaryShards, glossaryPath } from "./glossary-build";
import { loadConfig } from "./config";
import { readOverrideParts } from "./overrides";
import { pathsFor } from "./paths";
import { readProvenanceParts } from "./provenance";
import { listShardFiles, listSummaryFiles } from "./shard-index";

export interface LoadResult {
  data: LoadedDataset;
  /** Problemas de lectura (JSON roto...) para que `validate` los informe sin detenerse (R52). */
  issues: IntegrityIssue[];
}

/** Lee `src/data` del disco y arma el `LoadedDataset` sin validar nada (lo hacen las reglas). */
export function loadDataset(root?: string, only?: readonly Category[]): LoadResult {
  const paths = pathsFor(root);
  const issues: IntegrityIssue[] = [];
  const data: LoadedDataset = {
    entries: {},
    origins: {},
    provenanceParts: {},
    overrideParts: {},
    summaryParts: {},
    glossary: { shards: [] },
  };

  const read = (category: Category, file: string): unknown => {
    try {
      return JSON.parse(readFileSync(resolve(paths.data, file), "utf8"));
    } catch (error) {
      issues.push({
        category,
        rule: "load.json",
        message: `${file}: no se pudo leer (${error instanceof Error ? error.message : error})`,
      });
      return undefined;
    }
  };

  for (const def of CATEGORIES) {
    if (only && !only.includes(def.id)) continue;
    if (def.shape === "record") {
      const files = listShardFiles(paths.data, def);
      const file = files[0];
      if (file) data.spellLists = read(def.id, file);
    } else {
      const entries: unknown[] = [];
      const origins: string[] = [];
      for (const file of listShardFiles(paths.data, def)) {
        const content = read(def.id, file);
        if (content === undefined) continue;
        if (!Array.isArray(content)) {
          issues.push({
            category: def.id,
            rule: "load.shape",
            message: `${file}: un shard de datos debe ser un array de entradas`,
          });
          continue;
        }
        for (const item of content) {
          entries.push(item);
          origins.push(file);
        }
      }
      data.entries[def.id as EntryCategory] = entries;
      data.origins![def.id as EntryCategory] = origins;
    }

    try {
      const parts = readProvenanceParts(paths.data, def.id);
      if (parts.length > 0) data.provenanceParts[def.id] = parts;
    } catch (error) {
      issues.push({
        category: def.id,
        rule: "load.json",
        message: `provenance: ${error instanceof Error ? error.message : error}`,
      });
    }
    try {
      const parts = readOverrideParts(paths.data, def.id);
      if (parts.length > 0) data.overrideParts[def.id] = parts;
    } catch (error) {
      issues.push({
        category: def.id,
        rule: "load.json",
        message: `overrides: ${error instanceof Error ? error.message : error}`,
      });
    }
    const summaries: DataPart[] = [];
    for (const file of listSummaryFiles(paths.data, def)) {
      const content = read(def.id, file);
      if (content !== undefined) summaries.push({ file, data: content as SummaryFile });
    }
    if (summaries.length > 0) data.summaryParts[def.id] = summaries;
  }

  try {
    data.glossary.shards = listGlossaryShards(paths.data);
  } catch (error) {
    issues.push({
      category: "glossary",
      rule: "load.json",
      message: `glosario: ${error instanceof Error ? error.message : error}`,
    });
  }
  const committed = glossaryPath(paths.data);
  if (existsSync(committed)) data.glossary.committedText = readFileSync(committed, "utf8");
  return { data, issues };
}

/** Contexto de integridad: alias de slug y el resto de `config/*.json` por nombre. */
export function loadIntegrityContext(root?: string): IntegrityContext {
  const config = loadConfig(pathsFor(root).config);
  return {
    slugAliases: config.slugAliases,
    config: {
      ...config.extra,
      seeds: config.seeds,
      sectionAllowlist: config.sectionAllowlist,
    },
  };
}
