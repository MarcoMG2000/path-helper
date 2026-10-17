import { CATEGORY_IDS, type EntryCategory } from "../schema/common";
import { getCategory } from "../categories";
import { SummaryFileSchema, checkNumericFidelity } from "../schema/summary";
import { isRecord } from "./helpers";
import type { IntegrityIssue, IntegrityRule } from "./types";

// R28 (formato), R29 (cada entrada tiene resumen) y R30 (cifras del resumen presentes en textEn).
export const summariesRule: IntegrityRule = (data) => {
  const issues: IntegrityIssue[] = [];
  for (const category of CATEGORY_IDS) {
    if (getCategory(category).shape === "record") continue;
    const entries = data.entries[category as EntryCategory];
    if (!entries) continue;

    const merged = new Map<string, { summaryEs: string }>();
    const origin = new Map<string, string>();
    for (const part of data.summaryParts[category] ?? []) {
      const parsed = SummaryFileSchema.safeParse(part.data);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          issues.push({
            category,
            id: typeof issue.path[0] === "string" ? issue.path[0] : undefined,
            rule: "summaries.format",
            message: `${part.file}: ${issue.path.join(".") || "(raíz)"}: ${issue.message}`,
          });
        }
        continue;
      }
      for (const [id, summary] of Object.entries(parsed.data)) {
        const previous = origin.get(id);
        if (previous !== undefined) {
          issues.push({
            category,
            id,
            rule: "summaries.duplicate",
            message: `resumen duplicado para "${id}" en ${previous} y ${part.file}`,
          });
          continue;
        }
        origin.set(id, part.file);
        merged.set(id, summary);
      }
    }

    const ids = new Set<string>();
    for (const raw of entries) {
      if (!isRecord(raw) || typeof raw["id"] !== "string") continue;
      const id = raw["id"];
      ids.add(id);
      const summary = merged.get(id);
      if (!summary) {
        issues.push({
          category,
          id,
          rule: "summaries.missing",
          message: "la entrada no tiene resumen en español",
        });
        continue;
      }
      const textEn = typeof raw["textEn"] === "string" ? raw["textEn"] : "";
      const missing = checkNumericFidelity(summary.summaryEs, textEn);
      if (missing.length > 0) {
        issues.push({
          category,
          id,
          rule: "summaries.numeric",
          message: `el resumen contiene cifras que no están en textEn: ${missing.join(", ")}`,
        });
      }
    }
    for (const id of merged.keys()) {
      if (!ids.has(id)) {
        issues.push({
          category,
          id,
          rule: "summaries.orphan",
          message: `resumen sin entrada (${origin.get(id)})`,
        });
      }
    }
  }
  return issues;
};
