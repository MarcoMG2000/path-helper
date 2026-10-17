import { findContent, labelledFields, loadHtml, sourceLabels, splitSections } from "../lib/html";
import type {
  DiscoverInput,
  DiscoverOutput,
  ExcludedPage,
  ParsedEntry,
  ParserInput,
  ParserOutput,
} from "../lib/parser-contract";
import { crbLabelOf } from "./class-common";
import { isClassPage, parseClassPage, type ClassTableRow } from "./class-features";

// Parser de `classes` (R9-R12). Lee la misma página `ClassDisplay.aspx` que class-features y
// reutiliza su núcleo (`parseClassPage`): tabla de 20 filas, competencias, habilidades y lanzamiento.
// `progression` se deriva de la fila de nivel 20 y la regla R11 (integrity/class-tables.ts) la
// contrasta con las 20 filas.

function bump(counters: Record<string, number>, key: string, by = 1): void {
  counters[key] = (counters[key] ?? 0) + by;
}

function babProgression(level20: number, where: string): "full" | "threeQuarters" | "half" {
  if (level20 === 20) return "full";
  if (level20 === 15) return "threeQuarters";
  if (level20 === 10) return "half";
  throw new Error(`${where}: BAB de nivel 20 inesperado (+${level20})`);
}

function saveProgression(level20: number, where: string, label: string): "good" | "poor" {
  if (level20 === 12) return "good";
  if (level20 === 6) return "poor";
  throw new Error(`${where}: salvación ${label} de nivel 20 inesperada (+${level20})`);
}

function rowEntry(row: ClassTableRow): Record<string, unknown> {
  const out: Record<string, unknown> = {
    level: row.level,
    bab: row.bab,
    fort: row.fort,
    ref: row.ref,
    will: row.will,
    special: row.special,
    specialIds: row.specialIds,
  };
  if (row.spellsPerDay) out["spellsPerDay"] = row.spellsPerDay;
  if (row.domainSpellsPerDay) out["domainSpellsPerDay"] = row.domainSpellsPerDay;
  if (row.spellsKnown) out["spellsKnown"] = row.spellsKnown;
  return out;
}

export function discover(input: DiscoverInput): DiscoverOutput {
  let expectedCount = 0;
  for (const page of input.seedPages) {
    if (!isClassPage(page.url)) continue;
    const $ = loadHtml(page.html);
    const title = splitSections($, findContent($)).find((s) => s.level === 1);
    if (title && crbLabelOf(sourceLabels(labelledFields($, title.nodes)))) expectedCount++;
  }
  return { urls: [], expectations: { expectedCount } };
}

export function parse(input: ParserInput): ParserOutput {
  const entries: ParsedEntry[] = [];
  const excluded: ExcludedPage[] = [];
  const needsReview: { id: string; reason: string }[] = [];
  const counters: Record<string, number> = {};
  const notes: string[] = [];
  for (const page of input.pages) {
    if (!isClassPage(page.url)) continue;
    const parsed = parseClassPage(page, input.config);
    if ("excluded" in parsed) {
      excluded.push(parsed.excluded);
      continue;
    }
    for (const [key, n] of Object.entries(parsed.counters)) bump(counters, key, n);
    notes.push(...parsed.notes.filter((n) => n.includes("excluida")));
    const last = parsed.table[19]!;
    const where = `${page.url} (${parsed.name})`;
    const entry: ParsedEntry = {
      id: parsed.classId,
      name: parsed.name,
      textEn: parsed.textEn,
      source: parsed.url,
      sourceRef: parsed.sourceRef,
      book: "CRB",
      hitDie: parsed.hitDie,
      skillRanksPerLevel: parsed.skillRanksPerLevel,
      classSkills: parsed.classSkills,
      alignment: parsed.alignment,
      startingWealthDice: parsed.startingWealthDice,
      proficiencies: parsed.proficiencies,
      progression: {
        bab: babProgression(last.bab[0]!, where),
        fort: saveProgression(last.fort, where, "Fort"),
        ref: saveProgression(last.ref, where, "Ref"),
        will: saveProgression(last.will, where, "Will"),
      },
      table: parsed.table.map(rowEntry),
    };
    if (parsed.casting) entry["casting"] = parsed.casting;
    entries.push(entry);
    if (parsed.needsReview) {
      needsReview.push({ id: parsed.classId, reason: "la página declara varias etiquetas Source" });
    }
  }
  return {
    entries,
    shardOf: (entry) => `classes/${entry.id}.json`,
    needsReview,
    excluded,
    counters,
    notes,
  };
}
