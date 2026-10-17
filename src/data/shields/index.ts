// GENERADO por `npm run data:parse` / `npm run data:glossary` (scripts/srd/lib/shard-index.ts).
// No editar a mano: lista estática de shards para la carga perezosa.
import type { ShardRef } from "../shard-loader";

export const SHARDS: readonly ShardRef[] = [
  {
    file: "equipment/shields.json",
    load: () => import("../equipment/shields.json"),
  },
];

export const SUMMARIES: readonly ShardRef[] = [
  {
    file: "summaries/shields/shields.json",
    load: () => import("../summaries/shields/shields.json"),
  },
];
