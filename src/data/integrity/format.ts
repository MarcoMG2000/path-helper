import type { IntegrityIssue } from "./types";

export interface IssueGroup {
  category: string;
  rule: string;
  issues: IntegrityIssue[];
}

/** Agrupa por categoría y regla (R52); dentro de cada grupo, orden estable por id. */
export function groupIssues(issues: readonly IntegrityIssue[]): IssueGroup[] {
  const groups = new Map<string, IssueGroup>();
  for (const issue of issues) {
    const key = `${issue.category}\u0000${issue.rule}`;
    let group = groups.get(key);
    if (!group) {
      group = { category: issue.category, rule: issue.rule, issues: [] };
      groups.set(key, group);
    }
    group.issues.push(issue);
  }
  const list = [...groups.values()];
  list.sort((a, b) =>
    a.category === b.category ? a.rule.localeCompare(b.rule) : a.category.localeCompare(b.category),
  );
  for (const group of list) {
    group.issues.sort((a, b) => (a.id ?? "").localeCompare(b.id ?? ""));
  }
  return list;
}

/** Texto del informe de `data:validate`: categoría > regla > id. */
export function formatIssues(issues: readonly IntegrityIssue[]): string {
  if (issues.length === 0) return "data:validate: sin errores.";
  const lines: string[] = [];
  let lastCategory = "";
  for (const group of groupIssues(issues)) {
    if (group.category !== lastCategory) {
      lines.push(`[${group.category}]`);
      lastCategory = group.category;
    }
    lines.push(`  ${group.rule} (${group.issues.length})`);
    for (const issue of group.issues) {
      lines.push(`    - ${issue.id ? `${issue.id}: ` : ""}${issue.message}`);
    }
  }
  lines.push(
    "",
    `data:validate: ${issues.length} error(es) en ${new Set(issues.map((i) => i.category)).size} categoría(s).`,
  );
  return lines.join("\n");
}
