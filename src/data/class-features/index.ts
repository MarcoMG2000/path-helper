// GENERADO por `npm run data:parse` / `npm run data:glossary` (scripts/srd/lib/shard-index.ts).
// No editar a mano: lista estática de shards para la carga perezosa.
import type { ShardRef } from "../shard-loader";

export const SHARDS: readonly ShardRef[] = [
  {
    file: "class-features/barbarian.json",
    load: () => import("./barbarian.json"),
  },
  {
    file: "class-features/bard.json",
    load: () => import("./bard.json"),
  },
  {
    file: "class-features/cleric.json",
    load: () => import("./cleric.json"),
  },
  {
    file: "class-features/druid.json",
    load: () => import("./druid.json"),
  },
  {
    file: "class-features/paladin.json",
    load: () => import("./paladin.json"),
  },
  {
    file: "class-features/ranger.json",
    load: () => import("./ranger.json"),
  },
  {
    file: "class-features/rogue.json",
    load: () => import("./rogue.json"),
  },
];

export const SUMMARIES: readonly ShardRef[] = [
  {
    file: "summaries/class-features/barbarian.json",
    load: () => import("../summaries/class-features/barbarian.json"),
  },
  {
    file: "summaries/class-features/bard.json",
    load: () => import("../summaries/class-features/bard.json"),
  },
  {
    file: "summaries/class-features/cleric.json",
    load: () => import("../summaries/class-features/cleric.json"),
  },
  {
    file: "summaries/class-features/druid.json",
    load: () => import("../summaries/class-features/druid.json"),
  },
  {
    file: "summaries/class-features/paladin.json",
    load: () => import("../summaries/class-features/paladin.json"),
  },
  {
    file: "summaries/class-features/ranger.json",
    load: () => import("../summaries/class-features/ranger.json"),
  },
  {
    file: "summaries/class-features/rogue.json",
    load: () => import("../summaries/class-features/rogue.json"),
  },
];
