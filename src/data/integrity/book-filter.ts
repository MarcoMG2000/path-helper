import { CATEGORY_IDS, CRB_SOURCE_REF_PREFIX, type EntryCategory } from "../schema/common";
import { getCategory } from "../categories";
import { idOf, isRecord } from "./helpers";
import type { IntegrityIssue, IntegrityRule } from "./types";

// R27 (y R3): ninguna entrada de un libro distinto del CRB en ningún dataset.
export const bookFilterRule: IntegrityRule = (data) => {
  const issues: IntegrityIssue[] = [];
  for (const category of CATEGORY_IDS) {
    if (getCategory(category).shape === "record") continue;
    const entries = data.entries[category as EntryCategory];
    if (!entries) continue;
    entries.forEach((raw, index) => {
      if (!isRecord(raw)) return;
      const id = idOf(raw, index);
      if (raw["book"] !== "CRB") {
        issues.push({
          category,
          id,
          rule: "book.not-crb",
          message: `book es ${JSON.stringify(raw["book"])}; solo se admite "CRB"`,
        });
      }
      const ref = raw["sourceRef"];
      if (typeof ref !== "string" || !ref.startsWith(CRB_SOURCE_REF_PREFIX)) {
        issues.push({
          category,
          id,
          rule: "book.source-ref",
          message: `sourceRef ${JSON.stringify(ref)} no empieza por "${CRB_SOURCE_REF_PREFIX}"`,
        });
      }
    });
  }
  return issues;
};
