import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import type { z } from "zod";
import { CATEGORIES, getCategory } from "../../src/data/categories";
import { runIntegrity } from "../../src/data/integrity";
import { formatIssues } from "../../src/data/integrity/format";
import type { IntegrityIssue } from "../../src/data/integrity/types";
import { CATEGORY_IDS, type Category } from "../../src/data/schema/common";
import { mergeGlossaryShards } from "../../src/data/schema/glossary";
import { loadConfig, parseCategoryArg, type CategoryScope, type SrdConfig } from "./lib/config";
import { createFetchCache, type CachedPage, type FetchCache } from "./lib/fetch-cache";
import { writeGlossary } from "./lib/glossary-build";
import { nodesToText, findContent, loadHtml } from "./lib/html";
import { writeJsonFile, writeTextFile } from "./lib/json";
import { loadDataset, loadIntegrityContext } from "./lib/load-dataset";
import { applyOverrides, parseOverrideParts, readOverrideParts } from "./lib/overrides";
import { pathsFor, type Paths } from "./lib/paths";
import type { ParsedEntry, ParserInput, ParserModule } from "./lib/parser-contract";
import {
  ParserNotImplementedError,
  createParserLoader,
  type ParserLoader,
} from "./lib/parser-registry";
import {
  loadCachedPages,
  mergeProvenance,
  readProvenanceParts,
  selectParts,
  updateProvenance,
  verifyProvenance,
} from "./lib/provenance";
import type { Clock } from "./lib/rate-limiter";
import { systemClock } from "./lib/rate-limiter";
import {
  appendReport,
  importReportPath,
  renderImportReport,
  renderParseReport,
} from "./lib/report";
import {
  applyCrosscheck,
  buildSample,
  renderSample,
  sampleFileName,
  type SampleSource,
} from "./lib/sample";
import { findStaleIndexes, writeCategoryIndexes } from "./lib/shard-index";

export interface CliDeps {
  /** Raíz del repo (los tests usan un directorio temporal). */
  root?: string;
  fetch?: typeof fetch;
  clock?: Clock;
  log?: (line: string) => void;
  error?: (line: string) => void;
  parserLoader?: ParserLoader;
  /** Sustituye los schemas del registro (tests con datos sintéticos). */
  schemas?: Partial<Record<Category, z.ZodType>>;
}

export const COMMANDS = ["import", "parse", "glossary", "validate", "sample"] as const;
export type Command = (typeof COMMANDS)[number];

interface Ctx {
  paths: Paths;
  config: SrdConfig;
  cache: FetchCache;
  clock: Clock;
  log: (line: string) => void;
  error: (line: string) => void;
  parserLoader: ParserLoader;
  fetchImpl: typeof fetch;
  schemas: Partial<Record<Category, z.ZodType>>;
}

const USAGE = `Uso: tsx scripts/srd/cli.ts <import|parse|glossary|validate|sample> [opciones]

  import   [--category <c[:subconjunto]>[,...]] [--verify]
  parse    [--category <c[:subconjunto]>[,...]] [--accept-drift]
  glossary
  validate
  sample   --seed <n> --per-category <k> [--crosscheck]`;

function batchOf(category: Category, subset: string | undefined): string | undefined {
  return getCategory(category).batched === true ? subset : undefined;
}

function label(scope: CategoryScope): string {
  return scope.subset === undefined ? scope.category : `${scope.category}:${scope.subset}`;
}

async function loadParser(ctx: Ctx, category: Category): Promise<ParserModule | undefined> {
  try {
    return await ctx.parserLoader(category);
  } catch (error) {
    if (error instanceof ParserNotImplementedError) return undefined;
    throw error;
  }
}

function seedUrls(config: SrdConfig, scope: CategoryScope): string[] {
  const seeds = config.seeds[scope.category];
  if (!seeds) return [];
  const urls = [...seeds.urls];
  if (scope.subset !== undefined) urls.push(...(seeds.subsets?.[scope.subset] ?? []));
  else for (const extra of Object.values(seeds.subsets ?? {})) urls.push(...extra);
  return [...new Set(urls)];
}

function toParserPages(pages: readonly CachedPage[]): ParserInput["pages"] {
  return pages.map(({ url, html, sha256 }) => ({ url, html, sha256 }));
}

// --- import -----------------------------------------------------------------------------------

async function importScope(ctx: Ctx, scope: CategoryScope, verify: boolean): Promise<boolean> {
  const { category, subset } = scope;
  const def = getCategory(category);
  const batch = batchOf(category, subset);

  if (verify) {
    const parts = selectParts(
      readProvenanceParts(ctx.paths.data, category),
      def.batched === true,
      subset,
    );
    if (parts.length === 0) {
      ctx.error(`${label(scope)}: no hay procedencia registrada; ejecuta data:import primero`);
      return false;
    }
    const registered = mergeProvenance(parts).pages;
    const result = await verifyProvenance(ctx.cache, registered);
    ctx.log(`${label(scope)}: ${result.checked} página(s) comprobada(s)`);
    for (const d of result.differing) ctx.log(`  DIFIERE ${d.url}`);
    for (const f of result.failed) ctx.log(`  ERROR ${f.url}: ${f.error}`);
    if (result.differing.length === 0 && result.failed.length === 0) ctx.log("  sin diferencias");
    return result.differing.length === 0 && result.failed.length === 0;
  }

  const urls = seedUrls(ctx.config, scope);
  if (urls.length === 0) {
    ctx.error(`${label(scope)}: no hay semillas en scripts/srd/config/seeds.json`);
    return false;
  }
  let fetched = 0;
  let fromCache = 0;
  const pages = new Map<string, CachedPage>();
  const fetchAll = async (list: readonly string[]): Promise<CachedPage[]> => {
    const out: CachedPage[] = [];
    for (const url of list) {
      const page = await ctx.cache.get(url);
      if (page.fromCache) fromCache++;
      else fetched++;
      pages.set(url, page);
      out.push(page);
    }
    return out;
  };
  const seedPages = await fetchAll(urls);

  const parser = await loadParser(ctx, category);
  let discovered = 0;
  let expectations;
  if (parser?.discover) {
    const found = parser.discover({
      category,
      subset,
      seedPages: toParserPages(seedPages),
      config: parserConfig(ctx.config, category),
    });
    const extra = found.urls.filter((u) => !pages.has(u));
    discovered = extra.length;
    await fetchAll(extra);
    expectations = found.expectations;
  }

  const result = updateProvenance({
    dataDir: ctx.paths.data,
    category,
    batch,
    pages: [...pages.values()],
    expectations,
  });
  appendReport(
    importReportPath(ctx.paths.reports, new Date(ctx.clock.now()).toISOString()),
    renderImportReport({
      title: label(scope),
      seeds: urls.length,
      discovered,
      fetched,
      fromCache,
      frozenMismatches: result.frozenMismatches,
      provenanceFile: result.file,
    }),
  );
  ctx.log(
    `${label(scope)}: ${pages.size} página(s) (${fetched} descargadas, ${fromCache} de caché) -> ${result.file}`,
  );
  for (const m of result.frozenMismatches) ctx.error(`  AVISO ${m}`);
  return true;
}

function parserConfig(config: SrdConfig, category: Category): ParserInput["config"] {
  return {
    allowedSections: config.sectionAllowlist[category] ?? [],
    slugAliases: config.slugAliases,
  };
}

// --- parse ------------------------------------------------------------------------------------

class ParseFailure extends Error {}

async function parseScope(ctx: Ctx, scope: CategoryScope, acceptDrift: boolean): Promise<boolean> {
  const { category, subset } = scope;
  const def = getCategory(category);
  const batch = batchOf(category, subset);

  const parts = selectParts(
    readProvenanceParts(ctx.paths.data, category),
    def.batched === true,
    subset,
  );
  if (parts.length === 0) {
    throw new ParseFailure(`sin procedencia: ejecuta data:import --category ${label(scope)}`);
  }
  const registered = mergeProvenance(parts).pages;
  const loaded = loadCachedPages(ctx.cache, registered, { acceptDrift });
  if (loaded.missing.length > 0) {
    throw new ParseFailure(
      `faltan ${loaded.missing.length} página(s) en la caché local (ejecuta data:import):\n` +
        loaded.missing.map((u) => `  - ${u}`).join("\n"),
    );
  }
  for (const url of loaded.drifted) ctx.error(`  AVISO sha256 distinto (aceptado): ${url}`);

  const parser = await ctx.parserLoader(category);
  const output = parser.parse({
    category,
    subset,
    pages: toParserPages(loaded.pages),
    config: parserConfig(ctx.config, category),
  });

  // needsReview: la CLI fuerza la marca en las entradas indicadas.
  const flagged = new Set(output.needsReview.map((n) => n.id));
  let entries: ParsedEntry[] = output.entries.map((e) =>
    flagged.has(e.id) ? { ...e, needsReview: true } : { ...e },
  );

  // Overrides (R49): se aplican tras el parseo; los obsoletos o sin destino detienen el parseo.
  const overrides = parseOverrideParts(readOverrideParts(ctx.paths.data, category));
  const applied = applyOverrides(entries, overrides);
  if (applied.obsolete.length > 0) {
    throw new ParseFailure(
      "override(s) obsoleto(s) (el parser ya produce ese valor): " +
        applied.obsolete.map((o) => `${o.id}.${o.field}`).join(", "),
    );
  }
  const unknown = subset === undefined ? applied.unknownTarget : [];
  if (unknown.length > 0) {
    throw new ParseFailure(
      "override(s) con id inexistente: " + unknown.map((o) => `${o.id}.${o.field}`).join(", "),
    );
  }
  entries = applied.entries;

  // Schema: todo se valida antes de escribir nada (falla cerrado).
  const failures: string[] = [];
  if (def.shape === "entries") {
    for (const entry of entries) {
      const result = (ctx.schemas[category] ?? def.schema).safeParse(entry);
      if (!result.success) {
        for (const issue of result.error.issues) {
          failures.push(
            `${entry.id}: campo "${issue.path.join(".") || "(raíz)"}": ${issue.message}`,
          );
        }
      }
    }
  } else if (output.record !== undefined) {
    const result = (ctx.schemas[category] ?? def.schema).safeParse(output.record);
    if (!result.success) {
      for (const issue of result.error.issues) {
        failures.push(`campo "${issue.path.join(".") || "(raíz)"}": ${issue.message}`);
      }
    }
  }
  if (failures.length > 0) {
    throw new ParseFailure(
      `${failures.length} error(es) de schema:\n` +
        failures
          .slice(0, 30)
          .map((f) => `  - ${f}`)
          .join("\n"),
    );
  }

  // Escritura determinista (R44): agrupar por fichero y ordenar por id.
  const written: string[] = [];
  if (def.shape === "record") {
    const file = def.shardPatterns[0]!;
    if (output.record !== undefined) {
      writeJsonFile(resolve(ctx.paths.data, file), output.record);
      written.push(file);
    }
  } else {
    const exact = def.shardPatterns.filter((p) => !p.endsWith("/*.json"));
    const byFile = new Map<string, ParsedEntry[]>();
    for (const entry of entries) {
      const file = output.shardOf?.(entry) ?? (exact.length === 1 ? exact[0] : undefined);
      if (file === undefined) {
        throw new ParseFailure(
          `el parser de ${category} debe indicar shardOf (varios ficheros posibles)`,
        );
      }
      byFile.set(file, [...(byFile.get(file) ?? []), entry]);
    }
    for (const [file, list] of [...byFile].sort(([a], [b]) => a.localeCompare(b))) {
      list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      writeJsonFile(resolve(ctx.paths.data, file), list);
      written.push(file);
    }
  }

  updateProvenance({
    dataDir: ctx.paths.data,
    category,
    batch,
    patch: {
      importedKinds: output.provenancePatch?.importedKinds,
      overridesApplied: applied.applied,
    },
  });
  writeCategoryIndexes(ctx.paths.root, [def]);

  appendReport(
    importReportPath(ctx.paths.reports, new Date(ctx.clock.now()).toISOString()),
    renderParseReport({
      title: label(scope),
      entries: def.shape === "entries" ? entries.length : 0,
      shardsWritten: written,
      excluded: output.excluded,
      needsReview: output.needsReview,
      counters: output.counters ?? {},
      notes: output.notes ?? [],
      overridesApplied: applied.applied.length,
    }),
  );
  ctx.log(
    `${label(scope)}: ${entries.length} entrada(s) en ${written.length} fichero(s); ` +
      `${output.excluded.length} página(s) excluida(s); ${output.needsReview.length} needsReview`,
  );
  return true;
}

// --- validate / glossary / sample ---------------------------------------------------------------

function validateCommand(ctx: Ctx): boolean {
  const { data, issues: loadIssues } = loadDataset(ctx.paths.root);
  const issues: IntegrityIssue[] = [
    ...loadIssues,
    ...runIntegrity(data, { ...loadIntegrityContext(ctx.paths.root), schemas: ctx.schemas }),
    ...findStaleIndexes(ctx.paths.root).map((category): IntegrityIssue => ({
      category: category as Category,
      rule: "index.stale",
      message: `${category}/index.ts no coincide con los ficheros en disco: ejecuta npm run data:parse`,
    })),
  ];
  (issues.length === 0 ? ctx.log : ctx.error)(formatIssues(issues));
  return issues.length === 0;
}

function glossaryCommand(ctx: Ctx): boolean {
  const result = writeGlossary(ctx.paths.data);
  writeCategoryIndexes(ctx.paths.root);
  ctx.log(`glossary.es.json generado: ${result.keys} clave(s) -> ${result.path}`);
  return true;
}

async function sampleCommand(
  ctx: Ctx,
  options: { seed: number; perCategory: number; crosscheck: boolean },
): Promise<boolean> {
  const { data } = loadDataset(ctx.paths.root);
  const source: SampleSource = {
    entries: {},
    summaries: {},
    glossary: {},
    overridesApplied: {},
  };
  for (const def of CATEGORIES) {
    const entries =
      def.shape === "record" ? undefined : data.entries[def.id as Exclude<Category, "spell-lists">];
    if (entries) source.entries[def.id] = entries as Record<string, unknown>[];
    const merged: Record<string, { summaryEs: string; status: string }> = {};
    for (const part of data.summaryParts[def.id] ?? []) {
      Object.assign(merged, part.data as typeof merged);
    }
    if (Object.keys(merged).length > 0) source.summaries[def.id] = merged;
    const parts = data.provenanceParts[def.id];
    if (parts && parts.length > 0) {
      const applied = mergeProvenance(parts).overridesApplied;
      if (applied) source.overridesApplied[def.id] = applied;
    }
  }
  try {
    source.glossary = mergeGlossaryShards(data.glossary.shards) as SampleSource["glossary"];
  } catch {
    // los duplicados los informa data:validate
  }
  const gapsModule = resolve(
    ctx.paths.root,
    "scripts",
    "srd",
    "parsers",
    "magic-items",
    "effects.ts",
  );
  if (existsSync(gapsModule)) {
    const mod = (await import(pathToFileURL(gapsModule).href)) as {
      findEffectGaps?: (entries: readonly Record<string, unknown>[]) => readonly string[];
    };
    if (mod.findEffectGaps) source.effectGaps = mod.findEffectGaps;
  }

  let set = buildSample(source, { seed: options.seed, perCategory: options.perCategory });
  if (options.crosscheck) {
    set = await applyCrosscheck(set, {
      templates: ctx.config.seeds.crosscheck,
      fetchText: async (url) => {
        const page = await ctx.cache.get(url);
        const $ = loadHtml(page.html);
        return nodesToText($, findContent($));
      },
    });
  }
  const file = resolve(ctx.paths.reports, sampleFileName(options.seed));
  writeTextFile(file, renderSample(set));
  ctx.log(`muestra de ${set.items.length} entrada(s) -> ${file}`);
  return true;
}

// --- entrada ----------------------------------------------------------------------------------

/** Ejecuta un subcomando y devuelve el código de salida (distinto de 0 si algo falla). */
export async function runCli(argv: readonly string[], deps: CliDeps = {}): Promise<number> {
  const log = deps.log ?? ((line: string) => console.log(line));
  const error = deps.error ?? ((line: string) => console.error(line));
  const [command, ...rest] = argv;
  if (!command || !(COMMANDS as readonly string[]).includes(command)) {
    error(USAGE);
    return command === undefined || command === "--help" ? 0 : 1;
  }

  let values;
  try {
    ({ values } = parseArgs({
      args: [...rest],
      options: {
        category: { type: "string" },
        verify: { type: "boolean", default: false },
        "accept-drift": { type: "boolean", default: false },
        seed: { type: "string" },
        "per-category": { type: "string" },
        crosscheck: { type: "boolean", default: false },
      },
      allowPositionals: false,
    }));
  } catch (e) {
    error(`${e instanceof Error ? e.message : e}\n${USAGE}`);
    return 1;
  }

  const paths = pathsFor(deps.root);
  const clock = deps.clock ?? systemClock;
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  let ctx: Ctx;
  try {
    ctx = {
      paths,
      config: loadConfig(paths.config),
      clock,
      log,
      error,
      fetchImpl,
      schemas: deps.schemas ?? {},
      cache: createFetchCache({ cacheDir: paths.cache, fetch: fetchImpl, clock }),
      parserLoader: deps.parserLoader ?? createParserLoader(resolve(paths.root, "scripts", "srd")),
    };
  } catch (e) {
    error(e instanceof Error ? e.message : String(e));
    return 1;
  }

  try {
    switch (command as Command) {
      case "validate":
        return validateCommand(ctx) ? 0 : 1;
      case "glossary":
        return glossaryCommand(ctx) ? 0 : 1;
      case "sample": {
        const seed = Number(values.seed ?? "42");
        const perCategory = Number(values["per-category"] ?? "8");
        if (!Number.isInteger(seed) || !Number.isInteger(perCategory) || perCategory < 0) {
          error("--seed y --per-category deben ser enteros (>= 0)");
          return 1;
        }
        return (await sampleCommand(ctx, {
          seed,
          perCategory,
          crosscheck: values.crosscheck === true,
        }))
          ? 0
          : 1;
      }
      case "import":
      case "parse": {
        let scopes = parseCategoryArg(values.category);
        if (scopes.length === 0) {
          scopes = CATEGORY_IDS.filter((id) =>
            command === "import"
              ? (ctx.config.seeds[id]?.urls.length ?? 0) > 0 ||
                Object.keys(ctx.config.seeds[id]?.subsets ?? {}).length > 0
              : readProvenanceParts(paths.data, id).length > 0,
          ).map((category) => ({ category, subset: undefined }));
          if (scopes.length === 0) {
            log(
              `${command}: no hay categorías con ${command === "import" ? "semillas" : "procedencia"}.`,
            );
            return 0;
          }
        }
        let ok = true;
        for (const scope of scopes) {
          try {
            const done =
              command === "import"
                ? await importScope(ctx, scope, values.verify === true)
                : await parseScope(ctx, scope, values["accept-drift"] === true);
            ok = ok && done;
          } catch (e) {
            ok = false;
            error(`${label(scope)}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        return ok ? 0 : 1;
      }
    }
  } catch (e) {
    error(e instanceof Error ? e.message : String(e));
    return 1;
  }
  return 0;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  runCli(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (e: unknown) => {
      console.error(e);
      process.exitCode = 1;
    },
  );
}
