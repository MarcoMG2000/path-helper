import { CATEGORY_IDS, slugify, type EntryCategory } from "../schema/common";
import { getCategory } from "../categories";
import { isRecord } from "./helpers";
import type { IntegrityIssue, IntegrityRule } from "./types";

type Aliases = Readonly<Record<string, Readonly<Record<string, string>>>>;

/**
 * Id esperado de una entrada (R4): el alias declarado en `slug-aliases.json` (clave
 * `<kind>.<slug>` y después `<slug>`) o, si no hay, el slug del nombre inglés.
 * Lo usan por igual el parser y la regla de integridad.
 */
export function resolveEntryId(
  category: string,
  name: string,
  aliases: Aliases,
  kind?: string,
): string {
  const slug = slugify(name);
  const table = aliases[category];
  if (table) {
    if (kind !== undefined && table[`${kind}.${slug}`] !== undefined)
      return table[`${kind}.${slug}`]!;
    if (table[slug] !== undefined) return table[slug]!;
  }
  return slug;
}

// R4 y R5.
export const idsRule: IntegrityRule = (data, ctx) => {
  const issues: IntegrityIssue[] = [];
  for (const category of CATEGORY_IDS) {
    const def = getCategory(category);
    if (def.shape === "record") continue;
    const entries = data.entries[category as EntryCategory];
    if (!entries) continue;
    const seen = new Map<string, string>();
    entries.forEach((raw, index) => {
      if (!isRecord(raw) || typeof raw["id"] !== "string" || typeof raw["name"] !== "string")
        return;
      const id = raw["id"];
      const where = `${data.origins?.[category as EntryCategory]?.[index] ?? "entries"}[${index}]`;
      const kind = typeof raw["kind"] === "string" ? raw["kind"] : undefined;
      const expected = resolveEntryId(category, raw["name"], ctx.slugAliases, kind);
      const matches = def.dottedIds
        ? id === expected || id.split(".").at(-1) === expected
        : id === expected;
      if (!matches) {
        issues.push({
          category,
          id,
          rule: "ids.slug",
          message: `el id "${id}" no coincide con el slug "${expected}" de "${raw["name"]}" (${where}); declara un alias en slug-aliases.json si es intencionado`,
        });
      }
      const previous = seen.get(id);
      if (previous !== undefined) {
        issues.push({
          category,
          id,
          rule: "ids.duplicate",
          message: `id duplicado "${id}" en ${previous} y ${where}`,
        });
      } else {
        seen.set(id, where);
      }
    });
  }
  return issues;
};
