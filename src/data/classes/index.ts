// GENERADO por `npm run data:parse` / `npm run data:glossary` (scripts/srd/lib/shard-index.ts).
// No editar a mano: lista estática de shards para la carga perezosa.
import type { ShardRef } from "../shard-loader";

export const SHARDS: readonly ShardRef[] = [
  {
    file: "classes/barbarian.json",
    load: () => import("./barbarian.json"),
  },
  {
    file: "classes/bard.json",
    load: () => import("./bard.json"),
  },
  {
    file: "classes/cleric.json",
    load: () => import("./cleric.json"),
  },
  {
    file: "classes/druid.json",
    load: () => import("./druid.json"),
  },
  {
    file: "classes/paladin.json",
    load: () => import("./paladin.json"),
  },
  {
    file: "classes/ranger.json",
    load: () => import("./ranger.json"),
  },
  {
    file: "classes/rogue.json",
    load: () => import("./rogue.json"),
  },
];

export const SUMMARIES: readonly ShardRef[] = [
  {
    file: "summaries/classes/classes.json",
    load: () => import("../summaries/classes/classes.json"),
  },
];
