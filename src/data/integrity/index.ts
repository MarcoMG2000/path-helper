import { bookFilterRule } from "./book-filter";
import { classRefsRule } from "./class-refs";
import { classTablesRule } from "./class-tables";
import { countsRule } from "./counts";
import { domainRefsRule } from "./domain-refs";
import { featPrereqsRule } from "./feat-prereqs";
import { glossaryRule } from "./glossary";
import { idsRule } from "./ids";
import { magicRefsRule } from "./magic-refs";
import { overridesRule } from "./overrides";
import { schemaRule } from "./schema";
import { spellListsRule } from "./spell-lists";
import { summariesRule } from "./summaries";
import type { Category } from "../schema/common";
import {
  defaultContext,
  type IntegrityContext,
  type IntegrityIssue,
  type IntegrityRule,
  type LoadedDataset,
} from "./types";

export * from "./types";
export { resolveEntryId } from "./ids";
export { validEntries, provenanceOf } from "./helpers";

/** Reglas en orden de ejecución. Cada lote sustituye el contenido de "su" fichero, no esta lista. */
export const INTEGRITY_RULES: readonly { name: string; rule: IntegrityRule }[] = [
  { name: "schema", rule: schemaRule },
  { name: "ids", rule: idsRule },
  { name: "book-filter", rule: bookFilterRule },
  { name: "class-tables", rule: classTablesRule },
  { name: "class-refs", rule: classRefsRule },
  { name: "feat-prereqs", rule: featPrereqsRule },
  { name: "spell-lists", rule: spellListsRule },
  { name: "domain-refs", rule: domainRefsRule },
  { name: "magic-refs", rule: magicRefsRule },
  { name: "counts", rule: countsRule },
  { name: "summaries", rule: summariesRule },
  { name: "glossary", rule: glossaryRule },
  { name: "overrides", rule: overridesRule },
];

export interface RunOptions {
  /** Si se indica, solo se devuelven los hallazgos de esas categorías (tests de lote, sin globales). */
  categories?: readonly Category[];
}

/**
 * Ejecuta TODAS las reglas y agrega los hallazgos (R52): no se detiene en el primero y una regla
 * que lanza una excepción se convierte en un hallazgo `integrity.crashed`.
 */
export function runIntegrity(
  data: LoadedDataset,
  ctx: IntegrityContext = defaultContext(),
  options: RunOptions = {},
): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  for (const { name, rule } of INTEGRITY_RULES) {
    try {
      issues.push(...rule(data, ctx));
    } catch (error) {
      issues.push({
        category: "global",
        rule: "integrity.crashed",
        message: `la regla ${name} lanzó una excepción: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
  const { categories } = options;
  if (!categories) return issues;
  return issues.filter((issue) => (categories as readonly string[]).includes(issue.category));
}
