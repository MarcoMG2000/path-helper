import { CLASS_IDS, type ClassEntry } from "../schema/class";
import type { ClassFeature } from "../schema/class-feature";
import { isRecord, validEntries } from "./helpers";
import type { IntegrityIssue, IntegrityRule } from "./types";

// R9 (las 7 clases exactas), R12 (valores de referencia), R13 (padres de las opciones),
// R14 (cada nombre de la columna `special` resuelve a una capacidad) y la referencia
// classSkills -> skills cuando el dataset `skills` está presente (la integración final la exige).

/** Forma de `tests/data/fixtures/class-golden.json` (el test la entrega en `ctx.config.classGolden`). */
interface ClassGolden {
  hitDie: number;
  ranks: number;
  bab: string;
  fort: string;
  ref: string;
  will: string;
}

function asGolden(value: unknown): Record<string, ClassGolden> | undefined {
  return isRecord(value) ? (value as unknown as Record<string, ClassGolden>) : undefined;
}

export const classRefsRule: IntegrityRule = (data, ctx) => {
  const issues: IntegrityIssue[] = [];
  const classes = validEntries(data, "classes", ctx) as ClassEntry[];
  const features = validEntries(data, "class-features", ctx) as ClassFeature[];
  const featureById = new Map(features.map((f) => [f.id, f] as const));
  const classIds = new Set(classes.map((c) => c.id));

  // R9: exactamente las 7 clases de la campaña.
  if (classes.length > 0) {
    const expected = new Set<string>(CLASS_IDS);
    for (const id of expected) {
      if (!classIds.has(id)) {
        issues.push({
          category: "classes",
          id,
          rule: "class.set",
          message: `falta la clase ${id} (R9)`,
        });
      }
    }
    for (const id of classIds) {
      if (!expected.has(id)) {
        issues.push({
          category: "classes",
          id,
          rule: "class.set",
          message: `clase ${id} fuera de las 7 de la campaña (R9)`,
        });
      }
    }
  }

  // R12: valores de referencia (solo si el contexto los trae: la regla es pura y no lee ficheros).
  const golden = asGolden(ctx.config["classGolden"]);
  if (golden) {
    for (const entry of classes) {
      const g = golden[entry.id];
      if (!g) continue;
      const got: ClassGolden = {
        hitDie: entry.hitDie,
        ranks: entry.skillRanksPerLevel,
        bab: entry.progression.bab,
        fort: entry.progression.fort,
        ref: entry.progression.ref,
        will: entry.progression.will,
      };
      for (const key of Object.keys(got) as (keyof ClassGolden)[]) {
        if (got[key] !== g[key]) {
          issues.push({
            category: "classes",
            id: entry.id,
            rule: "class.golden",
            message: `${key} es ${JSON.stringify(got[key])} pero el valor de referencia es ${JSON.stringify(g[key])} (R12)`,
          });
        }
      }
    }
  }

  // R14: columna special -> capacidades de la propia clase.
  for (const entry of classes) {
    for (const row of entry.table) {
      row.specialIds.forEach((id, i) => {
        const feature = featureById.get(id);
        const name = row.special[i] ?? id;
        if (!feature) {
          issues.push({
            category: "classes",
            id: entry.id,
            rule: "class.special-ref",
            message: `nivel ${row.level}: "${name}" apunta a ${id}, que no existe en class-features (R14)`,
          });
        } else if (feature.classId !== entry.id) {
          issues.push({
            category: "classes",
            id: entry.id,
            rule: "class.special-ref",
            message: `nivel ${row.level}: ${id} pertenece a la clase ${feature.classId} (R14)`,
          });
        }
      });
    }
  }

  // class-features -> classes y parentId (R13).
  for (const f of features) {
    if (classes.length > 0 && !classIds.has(f.classId)) {
      issues.push({
        category: "class-features",
        id: f.id,
        rule: "class-feature.class-ref",
        message: `classId ${f.classId} no existe en classes`,
      });
    }
    if (f.parentId !== undefined && !featureById.has(f.parentId)) {
      issues.push({
        category: "class-features",
        id: f.id,
        rule: "class-feature.parent-ref",
        message: `parentId ${f.parentId} no existe en class-features (R13)`,
      });
    }
  }

  // classSkills -> skills (si el dataset de habilidades está cargado).
  const skills = data.entries.skills;
  if (skills && skills.length > 0) {
    const skillIds = new Set(skills.filter(isRecord).map((s) => s["id"]));
    for (const entry of classes) {
      for (const skill of entry.classSkills) {
        if (!skillIds.has(skill)) {
          issues.push({
            category: "classes",
            id: entry.id,
            rule: "class.skill-ref",
            message: `classSkills contiene ${skill}, que no existe en skills`,
          });
        }
      }
    }
  }
  return issues;
};
