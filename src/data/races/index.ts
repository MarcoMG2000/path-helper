// GENERADO por `npm run data:parse` / `npm run data:glossary` (scripts/srd/lib/shard-index.ts).
// No editar a mano: lista estática de shards para la carga perezosa.
import type { ShardRef } from "../shard-loader";

export const SHARDS: readonly ShardRef[] = [
  {
    file: "races.json",
    load: () => import("../races.json"),
  },
];

export const SUMMARIES: readonly ShardRef[] = [
  {
    file: "summaries/races/races.json",
    load: () => import("../summaries/races/races.json"),
  },
];
