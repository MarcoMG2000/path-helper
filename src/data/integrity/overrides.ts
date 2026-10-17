import { CATEGORY_IDS, type EntryCategory } from "../schema/common";
import { getCategory } from "../categories";
import { OverrideSchema, getAtPath, jsonEqual } from "../schema/override";
import { isRecord, provenanceOf } from "./helpers";
import type { IntegrityIssue, IntegrityRule } from "./types";

// R49: `reason` y `evidence` obligatorios; el override debe estar aplicado y no ser obsoleto
// (valor ya igual al que produjo el parser, registrado en `provenance.overridesApplied`).
export const overridesRule: IntegrityRule = (data) => {
  const issues: IntegrityIssue[] = [];
  for (const category of CATEGORY_IDS) {
    const parts = data.overrideParts[category];
    if (!parts || parts.length === 0) continue;
    const entries =
      getCategory(category).shape === "record"
        ? []
        : (data.entries[category as EntryCategory] ?? []);
    const byId = new Map<string, unknown>();
    for (const raw of entries) {
      if (isRecord(raw) && typeof raw["id"] === "string") byId.set(raw["id"], raw);
    }
    const applied = provenanceOf(data, category)?.value?.overridesApplied ?? [];
    for (const part of parts) {
      if (!Array.isArray(part.data)) {
        issues.push({
          category,
          rule: "overrides.format",
          message: `${part.file}: debe ser un array`,
        });
        continue;
      }
      part.data.forEach((raw: unknown, index: number) => {
        const id = isRecord(raw) && typeof raw["id"] === "string" ? raw["id"] : `#${index}`;
        let broken = false;
        for (const field of ["reason", "evidence"] as const) {
          const value = isRecord(raw) ? raw[field] : undefined;
          if (typeof value !== "string" || value.trim() === "") {
            issues.push({
              category,
              id,
              rule: `overrides.${field}`,
              message: `${part.file}: el override debe tener ${field} no vacío`,
            });
            broken = true;
          }
        }
        const parsed = OverrideSchema.safeParse(raw);
        if (!parsed.success) {
          if (!broken) {
            const first = parsed.error.issues[0];
            issues.push({
              category,
              id,
              rule: "overrides.format",
              message: `${part.file}: ${first?.path.join(".") || "(raíz)"}: ${first?.message ?? "inválido"}`,
            });
          }
          return;
        }
        if (broken) return;
        const override = parsed.data;
        const target = byId.get(override.id);
        if (target === undefined) {
          issues.push({
            category,
            id,
            rule: "overrides.target",
            message: `${part.file}: el override apunta a un id inexistente`,
          });
          return;
        }
        const current = getAtPath(target, override.field);
        if (!jsonEqual(current, override.value)) {
          issues.push({
            category,
            id,
            rule: "overrides.not-applied",
            message: `${part.file}: el valor de "${override.field}" en los datos no es el del override; ejecuta npm run data:parse`,
          });
          return;
        }
        const record = applied.find((a) => a.id === override.id && a.field === override.field);
        if (record && jsonEqual(record.parsedValue, override.value)) {
          issues.push({
            category,
            id,
            rule: "overrides.obsolete",
            message: `${part.file}: el override de "${override.field}" es obsoleto: el parser ya produce ese valor`,
          });
        }
      });
    }
  }
  return issues;
};
