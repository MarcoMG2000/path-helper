import type { z } from "zod";
import { CATEGORY_IDS, type Category, type EntryCategory } from "./schema/common";
import { ClassSchema } from "./schema/class";
import { ClassFeatureSchema } from "./schema/class-feature";
import { DomainSchema } from "./schema/domain";
import { RaceSchema } from "./schema/race";
import { SkillSchema } from "./schema/skill";
import { FeatSchema } from "./schema/feat";
import { SpellSchema } from "./schema/spell";
import { SpellListsSchema } from "./schema/spell-list";
import { ArmorSchema, GearSchema, ShieldSchema, WeaponSchema } from "./schema/equipment";
import { MagicItemSchema } from "./schema/magic-item";
import type { CategoryShards } from "./shard-loader";

// Registro de categorías (R1, R63). Los lotes NO lo editan: sustituyen los stubs de `schema/*.ts`
// y regeneran `<categoría>/index.ts` con `npm run data:parse`.

export interface CategoryDef<S extends z.ZodType = z.ZodType> {
  id: Category;
  /** Nombre del dataset en camelCase (`magicItems`). */
  dataset: string;
  /** `entries`: cada shard es un array de entradas. `record`: un único objeto (spell-lists). */
  shape: "entries" | "record";
  /** Schema de una entrada (`entries`) o del registro completo (`record`). */
  schema: S;
  /** Directorio (relativo a `src/data`) del `index.ts` generado. */
  dir: string;
  /** Patrones de ficheros de datos (relativos a `src/data`): ruta exacta o `dir/*.json`. */
  shardPatterns: readonly string[];
  shardExclude?: readonly string[];
  /** Directorio de resúmenes ES (relativo a `src/data`), recorrido de forma recursiva. */
  summaryDir: string;
  /** Los ids llevan prefijos separados por puntos (`paladin.smite-evil`); R4 compara el último tramo. */
  dottedIds?: boolean;
  /** Procedencia y overrides se reparten en `<dir>/<lote>.json` (R98). */
  batched?: boolean;
  /** Import dinámico LITERAL (los bundlers necesitan verlo). */
  loadShards: () => Promise<CategoryShards>;
}

function define<S extends z.ZodType>(def: CategoryDef<S>): CategoryDef<S> {
  return def;
}

const entries = {
  shape: "entries" as const,
};

export const CATEGORY_REGISTRY = {
  classes: define({
    ...entries,
    id: "classes",
    dataset: "classes",
    schema: ClassSchema,
    dir: "classes",
    shardPatterns: ["classes/*.json"],
    summaryDir: "summaries/classes",
    loadShards: () => import("./classes/index"),
  }),
  "class-features": define({
    ...entries,
    id: "class-features",
    dataset: "classFeatures",
    schema: ClassFeatureSchema,
    dir: "class-features",
    shardPatterns: ["class-features/*.json"],
    summaryDir: "summaries/class-features",
    dottedIds: true,
    loadShards: () => import("./class-features/index"),
  }),
  domains: define({
    ...entries,
    id: "domains",
    dataset: "domains",
    schema: DomainSchema,
    dir: "domains",
    shardPatterns: ["domains.json"],
    summaryDir: "summaries/domains",
    loadShards: () => import("./domains/index"),
  }),
  races: define({
    ...entries,
    id: "races",
    dataset: "races",
    schema: RaceSchema,
    dir: "races",
    shardPatterns: ["races.json"],
    summaryDir: "summaries/races",
    loadShards: () => import("./races/index"),
  }),
  skills: define({
    ...entries,
    id: "skills",
    dataset: "skills",
    schema: SkillSchema,
    dir: "skills",
    shardPatterns: ["skills.json"],
    summaryDir: "summaries/skills",
    loadShards: () => import("./skills/index"),
  }),
  feats: define({
    ...entries,
    id: "feats",
    dataset: "feats",
    schema: FeatSchema,
    dir: "feats",
    shardPatterns: ["feats/*.json"],
    summaryDir: "summaries/feats",
    loadShards: () => import("./feats/index"),
  }),
  spells: define({
    ...entries,
    id: "spells",
    dataset: "spells",
    schema: SpellSchema,
    dir: "spells",
    shardPatterns: ["spells/*.json"],
    shardExclude: ["spells/lists.json"],
    summaryDir: "summaries/spells",
    batched: true,
    loadShards: () => import("./spells/index"),
  }),
  "spell-lists": define({
    id: "spell-lists",
    dataset: "spellLists",
    shape: "record",
    schema: SpellListsSchema,
    dir: "spell-lists",
    shardPatterns: ["spells/lists.json"],
    summaryDir: "summaries/spell-lists",
    loadShards: () => import("./spell-lists/index"),
  }),
  weapons: define({
    ...entries,
    id: "weapons",
    dataset: "weapons",
    schema: WeaponSchema,
    dir: "weapons",
    shardPatterns: ["equipment/weapons.json"],
    summaryDir: "summaries/weapons",
    loadShards: () => import("./weapons/index"),
  }),
  armor: define({
    ...entries,
    id: "armor",
    dataset: "armor",
    schema: ArmorSchema,
    dir: "armor",
    shardPatterns: ["equipment/armor.json"],
    summaryDir: "summaries/armor",
    loadShards: () => import("./armor/index"),
  }),
  shields: define({
    ...entries,
    id: "shields",
    dataset: "shields",
    schema: ShieldSchema,
    dir: "shields",
    shardPatterns: ["equipment/shields.json"],
    summaryDir: "summaries/shields",
    loadShards: () => import("./shields/index"),
  }),
  gear: define({
    ...entries,
    id: "gear",
    dataset: "gear",
    schema: GearSchema,
    dir: "gear",
    shardPatterns: ["equipment/gear.json"],
    summaryDir: "summaries/gear",
    loadShards: () => import("./gear/index"),
  }),
  "magic-items": define({
    ...entries,
    id: "magic-items",
    dataset: "magicItems",
    schema: MagicItemSchema,
    dir: "magic-items",
    shardPatterns: ["magic-items/*.json"],
    summaryDir: "summaries/magic-items",
    loadShards: () => import("./magic-items/index"),
  }),
} as const satisfies Record<Category, CategoryDef>;

/** Las 13 categorías, en el orden de `CATEGORY_IDS`. */
export const CATEGORIES: readonly CategoryDef[] = CATEGORY_IDS.map((id) => CATEGORY_REGISTRY[id]);

export function getCategory(id: Category): CategoryDef {
  return CATEGORY_REGISTRY[id];
}

/** Tipo de la entrada validada de una categoría con `shape: "entries"`. */
export type EntryOf<C extends EntryCategory> = z.infer<(typeof CATEGORY_REGISTRY)[C]["schema"]>;
