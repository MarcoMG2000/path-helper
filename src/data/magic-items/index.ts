// GENERADO por `npm run data:parse` / `npm run data:glossary` (scripts/srd/lib/shard-index.ts).
// No editar a mano: lista estática de shards para la carga perezosa.
import type { ShardRef } from "../shard-loader";

export const SHARDS: readonly ShardRef[] = [
  {
    file: "magic-items/armor-ability.json",
    load: () => import("./armor-ability.json"),
  },
  {
    file: "magic-items/artifact.json",
    load: () => import("./artifact.json"),
  },
  {
    file: "magic-items/cursed.json",
    load: () => import("./cursed.json"),
  },
  {
    file: "magic-items/general.json",
    load: () => import("./general.json"),
  },
  {
    file: "magic-items/ring.json",
    load: () => import("./ring.json"),
  },
  {
    file: "magic-items/rod.json",
    load: () => import("./rod.json"),
  },
  {
    file: "magic-items/shield-ability.json",
    load: () => import("./shield-ability.json"),
  },
  {
    file: "magic-items/specific-armor.json",
    load: () => import("./specific-armor.json"),
  },
  {
    file: "magic-items/specific-shield.json",
    load: () => import("./specific-shield.json"),
  },
  {
    file: "magic-items/specific-weapon.json",
    load: () => import("./specific-weapon.json"),
  },
  {
    file: "magic-items/staff.json",
    load: () => import("./staff.json"),
  },
  {
    file: "magic-items/weapon-ability.json",
    load: () => import("./weapon-ability.json"),
  },
  {
    file: "magic-items/wondrous.json",
    load: () => import("./wondrous.json"),
  },
];

export const SUMMARIES: readonly ShardRef[] = [
  {
    file: "summaries/magic-items/armor-ability.json",
    load: () => import("../summaries/magic-items/armor-ability.json"),
  },
  {
    file: "summaries/magic-items/artifact.json",
    load: () => import("../summaries/magic-items/artifact.json"),
  },
  {
    file: "summaries/magic-items/cursed.json",
    load: () => import("../summaries/magic-items/cursed.json"),
  },
  {
    file: "summaries/magic-items/general.json",
    load: () => import("../summaries/magic-items/general.json"),
  },
  {
    file: "summaries/magic-items/ring.json",
    load: () => import("../summaries/magic-items/ring.json"),
  },
  {
    file: "summaries/magic-items/rod.json",
    load: () => import("../summaries/magic-items/rod.json"),
  },
  {
    file: "summaries/magic-items/shield-ability.json",
    load: () => import("../summaries/magic-items/shield-ability.json"),
  },
  {
    file: "summaries/magic-items/specific-armor.json",
    load: () => import("../summaries/magic-items/specific-armor.json"),
  },
  {
    file: "summaries/magic-items/specific-shield.json",
    load: () => import("../summaries/magic-items/specific-shield.json"),
  },
  {
    file: "summaries/magic-items/specific-weapon.json",
    load: () => import("../summaries/magic-items/specific-weapon.json"),
  },
  {
    file: "summaries/magic-items/staff.json",
    load: () => import("../summaries/magic-items/staff.json"),
  },
  {
    file: "summaries/magic-items/weapon-ability.json",
    load: () => import("../summaries/magic-items/weapon-ability.json"),
  },
  {
    file: "summaries/magic-items/wondrous.json",
    load: () => import("../summaries/magic-items/wondrous.json"),
  },
];
