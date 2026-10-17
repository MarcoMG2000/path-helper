import { readFileSync } from "node:fs";
import { resolveEntryId } from "../../../src/data/integrity/ids";
import { slugify } from "../../../src/data/schema/common";

export { slugify, resolveEntryId };

export type SlugAliases = Record<string, Record<string, string>>;

/** Lee `config/slug-aliases.json`: categoría -> (`slug` o `kind.slug`) -> id (R4). */
export function loadSlugAliases(path: string): SlugAliases {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`${path}: debe ser un objeto categoría -> alias`);
  }
  const out: SlugAliases = {};
  for (const [category, table] of Object.entries(raw)) {
    if (typeof table !== "object" || table === null || Array.isArray(table)) {
      throw new Error(`${path}: "${category}" debe ser un objeto slug -> id`);
    }
    out[category] = {};
    for (const [slug, id] of Object.entries(table)) {
      if (typeof id !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
        throw new Error(`${path}: el alias "${category}.${slug}" debe ser un id kebab-case`);
      }
      out[category][slug] = id;
    }
  }
  return out;
}
