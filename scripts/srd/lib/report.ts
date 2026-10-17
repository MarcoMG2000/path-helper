import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ExcludedPage, NeedsReviewItem } from "./parser-contract";

/** `reports/import-<fecha>.md` (git-ignorado). Varias ejecuciones del mismo día se acumulan. */
export function importReportPath(reportsDir: string, isoDate: string): string {
  return resolve(reportsDir, `import-${isoDate.slice(0, 10)}.md`);
}

export function appendReport(path: string, markdown: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const separator = existsSync(path) ? "\n" : "";
  appendFileSync(path, `${separator}${markdown.trimEnd()}\n`, "utf8");
}

export interface ParseReportInput {
  title: string;
  entries: number;
  shardsWritten: readonly string[];
  excluded: readonly ExcludedPage[];
  needsReview: readonly NeedsReviewItem[];
  counters: Readonly<Record<string, number>>;
  notes: readonly string[];
  overridesApplied: number;
}

export function renderParseReport(r: ParseReportInput): string {
  const lines = [
    `## parse: ${r.title}`,
    "",
    `- Entradas escritas: ${r.entries}`,
    `- Ficheros: ${r.shardsWritten.length > 0 ? r.shardsWritten.join(", ") : "(ninguno)"}`,
    `- Overrides aplicados: ${r.overridesApplied}`,
  ];
  for (const [name, value] of Object.entries(r.counters).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`- ${name}: ${value}`);
  }
  lines.push("", `### Páginas excluidas por libro (${r.excluded.length})`, "");
  for (const page of r.excluded) lines.push(`- ${page.url} (${page.book}): ${page.reason}`);
  lines.push("", `### needsReview (${r.needsReview.length})`, "");
  for (const item of r.needsReview) lines.push(`- ${item.id}: ${item.reason}`);
  if (r.notes.length > 0) {
    lines.push("", "### Notas", "");
    for (const note of r.notes) lines.push(`- ${note}`);
  }
  return lines.join("\n");
}

export interface ImportReportInput {
  title: string;
  seeds: number;
  discovered: number;
  fetched: number;
  fromCache: number;
  frozenMismatches: readonly string[];
  provenanceFile: string;
}

export function renderImportReport(r: ImportReportInput): string {
  const lines = [
    `## import: ${r.title}`,
    "",
    `- Semillas: ${r.seeds}; páginas descubiertas: ${r.discovered}`,
    `- Descargadas: ${r.fetched}; desde caché: ${r.fromCache}`,
    `- Procedencia: ${r.provenanceFile}`,
  ];
  if (r.frozenMismatches.length > 0) {
    lines.push("", "### Recuentos congelados distintos de los observados", "");
    for (const m of r.frozenMismatches) lines.push(`- ${m}`);
  }
  return lines.join("\n");
}
