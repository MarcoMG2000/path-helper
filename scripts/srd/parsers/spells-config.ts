import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { CRB_CLASS_IDS } from "../../../src/data/schema/spell";

// Catálogos cerrados de conjuros (R94, R97, R99): `config/spell-class-ids.json` y
// `config/spell-batches.json`, con validación estricta de su forma y de sus invariantes.

const configPath = (name: string): string =>
  fileURLToPath(new URL(`../config/${name}`, import.meta.url));

// --- Clases (línea `Level`) --------------------------------------------------------------------

export const SpellClassCatalogSchema = z.strictObject({
  crbClassIds: z.array(z.string().min(1)).min(1),
  abbreviations: z.record(z.string().min(1), z.array(z.string().min(1)).min(1)),
  nonCrbClassIds: z.array(z.string().min(1)),
});
export type SpellClassCatalog = z.infer<typeof SpellClassCatalogSchema>;

/** Valida el catálogo: sin duplicados, abreviaturas que expanden a clases CRB, grupos disjuntos. */
export function parseSpellClassCatalog(json: unknown): SpellClassCatalog {
  const catalog = SpellClassCatalogSchema.parse(json);
  const crb = new Set<string>(catalog.crbClassIds);
  if (crb.size !== catalog.crbClassIds.length) throw new Error("crbClassIds tiene duplicados");
  const same =
    [...crb].sort().join() === [...CRB_CLASS_IDS].sort().join() &&
    crb.size === CRB_CLASS_IDS.length;
  if (!same) throw new Error("crbClassIds debe coincidir con CRB_CLASS_IDS de schema/spell.ts");
  const nonCrb = new Set(catalog.nonCrbClassIds);
  if (nonCrb.size !== catalog.nonCrbClassIds.length) {
    throw new Error("nonCrbClassIds tiene duplicados");
  }
  for (const id of nonCrb) {
    if (crb.has(id)) throw new Error(`"${id}" está en crbClassIds y en nonCrbClassIds`);
    if (id !== id.toLowerCase())
      throw new Error(`nonCrbClassIds debe estar en minúsculas: "${id}"`);
  }
  for (const [abbr, ids] of Object.entries(catalog.abbreviations)) {
    if (crb.has(abbr) || nonCrb.has(abbr)) {
      throw new Error(`la abreviatura "${abbr}" choca con un id de clase`);
    }
    for (const id of ids) {
      if (!crb.has(id))
        throw new Error(`la abreviatura "${abbr}" expande a "${id}", que no es CRB`);
    }
  }
  return catalog;
}

export function loadSpellClassCatalog(): SpellClassCatalog {
  return parseSpellClassCatalog(
    JSON.parse(readFileSync(configPath("spell-class-ids.json"), "utf8")),
  );
}

export interface LevelLineResult {
  /** Clave de nivel (clase CRB) -> nivel de conjuro, ordenado por clave (R44). */
  levels: Record<string, number>;
  /** Clases de otro libro descartadas (R97), en el orden de la línea. */
  discarded: string[];
}

export class LevelLineError extends Error {
  constructor(
    readonly token: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Línea `Level` de la fuente (R94, R97): `bard 1, sor/wiz 3, summoner (unchained) 2`.
 * - Una clase CRB conserva su clave; una abreviatura (`sor/wiz`) se expande a todas sus claves.
 * - Una clase de otro libro (`nonCrbClassIds`) se descarta y se devuelve para contarla.
 * - Cualquier otro token lanza `LevelLineError` (no se adivina).
 * Un mismo id con dos niveles distintos también falla.
 */
export function parseLevelLine(line: string, catalog: SpellClassCatalog): LevelLineResult {
  const crb = new Set(catalog.crbClassIds);
  const nonCrb = new Set(catalog.nonCrbClassIds);
  const levels = new Map<string, number>();
  const discarded: string[] = [];
  const text = line.replace(/\s+/g, " ").trim();
  if (text === "") return { levels: {}, discarded };
  for (const rawToken of text.split(",")) {
    const token = rawToken.trim();
    const match = /^(.+?) (\d+)$/.exec(token);
    if (!match) throw new LevelLineError(token, `token ilegible en la línea Level: "${token}"`);
    const name = match[1]!.trim().toLowerCase();
    const level = Number(match[2]);
    if (level > 9) throw new LevelLineError(token, `nivel fuera de 0-9 en "${token}"`);
    let keys: readonly string[];
    if (crb.has(name)) keys = [name];
    else if (Object.hasOwn(catalog.abbreviations, name)) keys = catalog.abbreviations[name]!;
    else if (nonCrb.has(name)) {
      discarded.push(name);
      continue;
    } else {
      throw new LevelLineError(name, `clase desconocida "${name}" en la línea Level`);
    }
    for (const key of keys) {
      const previous = levels.get(key);
      if (previous !== undefined && previous !== level) {
        throw new LevelLineError(token, `"${key}" aparece con los niveles ${previous} y ${level}`);
      }
      levels.set(key, level);
    }
  }
  const sorted = [...levels].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return { levels: Object.fromEntries(sorted), discarded };
}

// --- Lotes -------------------------------------------------------------------------------------

export const SpellBatchesSchema = z.strictObject({
  batches: z
    .array(
      z.strictObject({
        id: z.string().regex(/^[a-z]-[a-z]$/),
        from: z.string().regex(/^[a-z]$/),
        to: z.string().regex(/^[a-z]$/),
      }),
    )
    .min(1),
  expectedCountByBatch: z.record(z.string(), z.number().int().nonnegative()),
});
export type SpellBatches = z.infer<typeof SpellBatchesSchema>;

/** R99: rangos contiguos que cubren `a`-`z` sin solaparse, y un recuento esperado por lote. */
export function parseSpellBatches(json: unknown): SpellBatches {
  const config = SpellBatchesSchema.parse(json);
  let expectedFrom = "a";
  const ids = new Set<string>();
  for (const batch of config.batches) {
    if (batch.id !== `${batch.from}-${batch.to}`) {
      throw new Error(`el lote "${batch.id}" no coincide con su rango ${batch.from}-${batch.to}`);
    }
    if (batch.from > batch.to) throw new Error(`el lote "${batch.id}" tiene el rango invertido`);
    if (batch.from !== expectedFrom) {
      throw new Error(
        `el lote "${batch.id}" empieza en "${batch.from}" y debía empezar en "${expectedFrom}" ` +
          "(rangos contiguos, sin huecos ni solapes)",
      );
    }
    if (ids.has(batch.id)) throw new Error(`lote duplicado "${batch.id}"`);
    ids.add(batch.id);
    expectedFrom = String.fromCharCode(batch.to.charCodeAt(0) + 1);
  }
  const last = config.batches.at(-1)!;
  if (last.to !== "z") throw new Error(`los lotes terminan en "${last.to}" y deben llegar a "z"`);
  const counted = Object.keys(config.expectedCountByBatch).sort().join();
  if (counted !== [...ids].sort().join()) {
    throw new Error("expectedCountByBatch debe tener exactamente una clave por lote");
  }
  return config;
}

export function loadSpellBatches(): SpellBatches {
  return parseSpellBatches(JSON.parse(readFileSync(configPath("spell-batches.json"), "utf8")));
}

/** Lote al que pertenece una inicial de `id` (`a`-`z`); `undefined` si no es una letra. */
export function batchOfInitial(batches: SpellBatches, initial: string): string | undefined {
  return batches.batches.find((b) => initial >= b.from && initial <= b.to)?.id;
}
