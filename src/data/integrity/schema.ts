import { CATEGORY_IDS, type EntryCategory } from "../schema/common";
import { getCategory } from "../categories";
import { idOf, schemaFor } from "./helpers";
import type { IntegrityIssue, IntegrityRule } from "./types";

// R3, R6, R7, R8 (y el resto de campos de cada schema): cada entrada debe superar su schema.
// La regla es `schema.<campo>` para los campos comunes y `schema` para el resto.
const COMMON_FIELD_RULES = new Set(["book", "source", "sourceRef", "textEn", "id"]);

export const schemaRule: IntegrityRule = (data, ctx) => {
  const issues: IntegrityIssue[] = [];
  for (const category of CATEGORY_IDS) {
    if (getCategory(category).shape === "record") {
      if (data.spellLists === undefined) continue;
      const parsed = schemaFor(category, ctx).safeParse(data.spellLists);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          issues.push({
            category,
            rule: "schema",
            message: `campo "${issue.path.join(".") || "(raíz)"}": ${issue.message}`,
          });
        }
      }
      continue;
    }
    const entries = data.entries[category as EntryCategory];
    if (!entries) continue;
    const schema = schemaFor(category, ctx);
    entries.forEach((raw, index) => {
      const parsed = schema.safeParse(raw);
      if (parsed.success) return;
      const file = data.origins?.[category as EntryCategory]?.[index];
      for (const issue of parsed.error.issues) {
        const head = issue.path[0];
        const rule =
          typeof head === "string" && COMMON_FIELD_RULES.has(head) ? `schema.${head}` : "schema";
        issues.push({
          category,
          id: idOf(raw, index),
          rule,
          message: `${file ? `${file}: ` : ""}campo "${issue.path.join(".") || "(raíz)"}": ${issue.message}`,
        });
      }
    });
  }
  return issues;
};
