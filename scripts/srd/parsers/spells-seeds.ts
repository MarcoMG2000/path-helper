import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createFetchCache } from "../lib/fetch-cache";
import { pathsFor } from "../lib/paths";
import { loadSlugAliases } from "../lib/slug";
import { stableStringify } from "../lib/json";
import { systemClock } from "../lib/rate-limiter";
import {
  CRB_SOURCE_URL,
  SPELL_INDEX_URL,
  crbSpellsOfBatch,
  extractCrbSpells,
  type CrbSpellList,
} from "./spells";
import { parseSpellBatches, type SpellBatches } from "./spells-config";

// Semillas de conjuros derivadas del índice (R93). `import` solo descarga las URLs de `seeds.json`
// y el parser es puro, así que las páginas de cada lote se materializan en `seeds.json` desde el
// filtro CRB ya cacheado (`SourceDisplay.aspx?FixedSource=PRPG Core Rulebook`, sección «Spells»).
// `parse` vuelve a comprobar, con esa misma página, que cada lote tiene exactamente sus conjuros.
//
// Uso (offline, lee la caché):
//   npx tsx scripts/srd/parsers/spells-seeds.ts           # informa y sale con 1 si hay desfase
//   npx tsx scripts/srd/parsers/spells-seeds.ts --write   # reescribe seeds.json y spell-batches.json
// El reparto de rangos (`batches`) se edita a mano en `spell-batches.json`; aquí solo se
// recalculan las semillas y los recuentos esperados desde el índice.

type Json = Record<string, unknown>;

export interface SeedPlan {
  index: string[];
  byBatch: Record<string, string[]>;
  counts: Record<string, number>;
}

export function planSpellSeeds(
  crb: CrbSpellList,
  batches: SpellBatches,
  slugAliases: Record<string, Record<string, string>>,
): SeedPlan {
  const byBatch: Record<string, string[]> = {};
  const counts: Record<string, number> = {};
  for (const batch of batches.batches) {
    const urls = crbSpellsOfBatch(crb, batches, batch.id, slugAliases).map((s) => s.url);
    byBatch[batch.id] = urls;
    counts[batch.id] = urls.length;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total !== crb.spells.length) {
    throw new Error(
      `los lotes cubren ${total} conjuros y el filtro CRB tiene ${crb.spells.length}`,
    );
  }
  return { index: [SPELL_INDEX_URL, CRB_SOURCE_URL], byBatch, counts };
}

function main(): number {
  const write = process.argv.includes("--write");
  const paths = pathsFor();
  const cache = createFetchCache({
    cacheDir: paths.cache,
    fetch: globalThis.fetch,
    clock: systemClock,
  });
  const crb = extractCrbSpells(cache.readCached(CRB_SOURCE_URL).html);
  const batchesPath = resolve(paths.config, "spell-batches.json");
  const batches = parseSpellBatches(JSON.parse(readFileSync(batchesPath, "utf8")));
  const plan = planSpellSeeds(
    crb,
    batches,
    loadSlugAliases(resolve(paths.config, "slug-aliases.json")),
  );

  const seedsPath = resolve(paths.config, "seeds.json");
  const seeds = JSON.parse(readFileSync(seedsPath, "utf8")) as Json;
  const spells = (seeds["spells"] ?? { urls: [], subsets: {} }) as {
    urls: string[];
    subsets: Json;
  };
  const current = JSON.stringify([
    spells.subsets["index"],
    ...batches.batches.map((b) => spells.subsets[b.id]),
  ]);
  const wanted = JSON.stringify([plan.index, ...batches.batches.map((b) => plan.byBatch[b.id])]);
  const countsInSync = JSON.stringify(batches.expectedCountByBatch) === JSON.stringify(plan.counts);
  const inSync = current === wanted && countsInSync;
  console.log(
    `filtro CRB: ${crb.spells.length} conjuros; lotes: ` +
      batches.batches.map((b) => `${b.id}=${plan.counts[b.id]}`).join(", "),
  );
  if (inSync) {
    console.log("seeds.json y spell-batches.json están al día");
    return 0;
  }
  if (!write) {
    console.error("desfase: ejecuta de nuevo con --write");
    return 1;
  }
  spells.subsets = { index: plan.index, ...plan.byBatch };
  seeds["spells"] = spells;
  writeFileSync(seedsPath, stableStringify(seeds), "utf8");
  writeFileSync(
    batchesPath,
    stableStringify({ batches: batches.batches, expectedCountByBatch: plan.counts }),
    "utf8",
  );
  console.log("seeds.json y spell-batches.json actualizados");
  return 0;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) process.exitCode = main();
