import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createFetchCache } from "../../lib/fetch-cache";
import { REPO_ROOT, pathsFor } from "../../lib/paths";
import { systemClock } from "../../lib/rate-limiter";
import { CRB_SOURCE_URL, INDEX_SEED_URLS, crbMagicIndex } from "./catalog";

// Genera las semillas `magic-items` de `config/seeds.json` desde la página de fuente CRB ya cacheada:
// páginas de índice + una URL por fila de las tablas «Magic Items (X) [N]». Uso (offline):
//   npx tsx scripts/srd/parsers/magic-items/seeds-cli.ts [--write]

const paths = pathsFor(REPO_ROOT);
const cache = createFetchCache({ cacheDir: paths.cache, fetch, clock: systemClock });
const index = crbMagicIndex(cache.readCached(CRB_SOURCE_URL));
const rows = index.flatMap((f) => f.rows.map((r) => r.url));
const urls = [...new Set([...INDEX_SEED_URLS, ...rows])];

if (process.argv.includes("--write")) {
  const file = resolve(paths.config, "seeds.json");
  const seeds = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  seeds["magic-items"] = { urls, subsets: {} };
  writeFileSync(file, JSON.stringify(seeds, null, 2) + "\n", "utf8");
  console.log(`seeds.json: magic-items -> ${urls.length} URL`);
} else {
  console.log(
    `${urls.length} URL (${index.map((f) => `${f.family}: ${f.rows.length}`).join(", ")})`,
  );
}
