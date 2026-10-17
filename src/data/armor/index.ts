// GENERADO por `npm run data:parse` / `npm run data:glossary` (scripts/srd/lib/shard-index.ts).
// No editar a mano: lista estática de shards para la carga perezosa.
import type { ShardRef } from "../shard-loader";

export const SHARDS: readonly ShardRef[] = [
  {
    file: "equipment/armor.json",
    load: () => import("../equipment/armor.json"),
  },
];

export const SUMMARIES: readonly ShardRef[] = [
  {
    file: "summaries/armor/armor.json",
    load: () => import("../summaries/armor/armor.json"),
  },
];
