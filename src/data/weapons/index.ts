// GENERADO por `npm run data:parse` / `npm run data:glossary` (scripts/srd/lib/shard-index.ts).
// No editar a mano: lista estática de shards para la carga perezosa.
import type { ShardRef } from "../shard-loader";

export const SHARDS: readonly ShardRef[] = [
  {
    file: "equipment/weapons.json",
    load: () => import("../equipment/weapons.json"),
  },
];

export const SUMMARIES: readonly ShardRef[] = [
  {
    file: "summaries/weapons/weapons.json",
    load: () => import("../summaries/weapons/weapons.json"),
  },
];
