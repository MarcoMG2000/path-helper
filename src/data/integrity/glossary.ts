import { CATEGORY_IDS, type EntryCategory } from "../schema/common";
import { getCategory } from "../categories";
import {
  GlossaryEntrySchema,
  GlossaryMergeError,
  glossaryKey,
  isCategoryId,
  mergeGlossaryShards,
  parseGlossaryKey,
  serializeGlossary,
} from "../schema/glossary";
import { isRecord } from "./helpers";
import type { IntegrityIssue, IntegrityRule } from "./types";

// R31 (formato), R32 (verified solo con origin human), R33 (entradas <-> claves), R36 (fichero
// generado al día).
export const glossaryRule: IntegrityRule = (data) => {
  const issues: IntegrityIssue[] = [];
  const glossaryIssue = (rule: string, message: string, id?: string): void => {
    issues.push({ category: "glossary", id, rule, message });
  };

  let merged: Record<string, unknown>;
  try {
    merged = mergeGlossaryShards(data.glossary.shards);
  } catch (error) {
    glossaryIssue(
      "glossary.duplicate",
      error instanceof GlossaryMergeError ? error.message : String(error),
    );
    return issues;
  }

  const valid = new Map<string, { kind: "entry" | "term" }>();
  for (const [key, raw] of Object.entries(merged)) {
    if (!/^[a-z0-9-]+:[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(key)) {
      glossaryIssue("glossary.format", `clave de glosario inválida "${key}"`, key);
      continue;
    }
    if (isRecord(raw) && raw["verified"] === true && raw["origin"] !== "human") {
      glossaryIssue("glossary.verified-origin", "verified:true exige origin:human (R32)", key);
      continue;
    }
    const parsed = GlossaryEntrySchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      glossaryIssue(
        "glossary.format",
        `${first?.path.join(".") || "(raíz)"}: ${first?.message ?? "inválido"}`,
        key,
      );
      continue;
    }
    valid.set(key, { kind: parsed.data.kind });
  }

  // R33: toda entrada tiene clave; toda clave `entry` apunta a una entrada.
  const ids = new Map<string, Set<string>>();
  for (const category of CATEGORY_IDS) {
    if (getCategory(category).shape === "record") continue;
    const entries = data.entries[category as EntryCategory];
    if (!entries) continue;
    const set = new Set<string>();
    ids.set(category, set);
    for (const raw of entries) {
      if (!isRecord(raw) || typeof raw["id"] !== "string") continue;
      set.add(raw["id"]);
      if (!valid.has(glossaryKey(category, raw["id"]))) {
        issues.push({
          category,
          id: raw["id"],
          rule: "glossary.missing",
          message: `falta la clave de glosario "${glossaryKey(category, raw["id"])}"`,
        });
      }
    }
  }
  for (const [key, { kind }] of valid) {
    const { prefix, id } = parseGlossaryKey(key);
    if (kind === "term") {
      if (prefix !== "term") {
        glossaryIssue(
          "glossary.kind",
          `una clave kind:term debe empezar por "term:" (${key})`,
          key,
        );
      }
      continue;
    }
    if (!isCategoryId(prefix)) {
      glossaryIssue(
        "glossary.orphan",
        `la clave kind:entry "${key}" no tiene categoría válida`,
        key,
      );
      continue;
    }
    const known = ids.get(prefix);
    if (known && !known.has(id)) {
      glossaryIssue("glossary.orphan", `la clave "${key}" no corresponde a ninguna entrada`, key);
    }
  }

  // R36: el fichero commiteado debe ser idéntico al generado.
  if (data.glossary.shards.length > 0) {
    const generated = serializeGlossary(merged);
    if (data.glossary.committedText === undefined) {
      glossaryIssue("glossary.stale", "falta glossary.es.json: ejecuta npm run data:glossary");
    } else if (data.glossary.committedText !== generated) {
      glossaryIssue(
        "glossary.stale",
        "glossary.es.json difiere del generado desde los shards: ejecuta npm run data:glossary",
      );
    }
  }
  return issues;
};
