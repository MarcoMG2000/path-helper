import type { ClassEntry } from "../schema/class";
import { validEntries } from "./helpers";
import type { IntegrityIssue, IntegrityRule } from "./types";

// R11: la tabla de 20 filas de cada clase es coherente con su progresión declarada.
//   BAB completo = nivel; 3/4 = floor(3·nivel/4); medio = floor(nivel/2)
//   salvación buena = 2 + floor(nivel/2); mala = floor(nivel/3)
// Las fórmulas son las del CRB, no las del parser: tabla y progresión se vigilan entre sí.

export function expectedBab(progression: ClassEntry["progression"]["bab"], level: number): number {
  switch (progression) {
    case "full":
      return level;
    case "threeQuarters":
      return Math.floor((3 * level) / 4);
    case "half":
      return Math.floor(level / 2);
  }
}

export function expectedSave(progression: "good" | "poor", level: number): number {
  return progression === "good" ? 2 + Math.floor(level / 2) : Math.floor(level / 3);
}

/** Ataques iterativos: BAB, BAB-5, BAB-10, BAB-15 mientras sean positivos (el primero siempre). */
export function expectedAttacks(bab: number): number[] {
  const out = [bab];
  for (let next = bab - 5; next > 0; next -= 5) out.push(next);
  return out;
}

export const classTablesRule: IntegrityRule = (data, ctx) => {
  const issues: IntegrityIssue[] = [];
  for (const entry of validEntries(data, "classes", ctx) as ClassEntry[]) {
    const push = (rule: string, level: number, message: string): void => {
      issues.push({
        category: "classes",
        id: entry.id,
        rule,
        message: `nivel ${level}: ${message}`,
      });
    };
    entry.table.forEach((row, index) => {
      const level = index + 1;
      if (row.level !== level) {
        push("class.table.level", level, `la fila ${level} declara level ${row.level}`);
      }
      const bab = expectedBab(entry.progression.bab, level);
      if (row.bab[0] !== bab) {
        push(
          "class.table.bab",
          level,
          `BAB ${row.bab[0]} pero la progresión ${entry.progression.bab} da ${bab}`,
        );
      } else if (JSON.stringify(row.bab) !== JSON.stringify(expectedAttacks(bab))) {
        push(
          "class.table.bab-iterative",
          level,
          `ataques ${row.bab.join("/")} pero con BAB ${bab} se esperaba ${expectedAttacks(bab).join("/")}`,
        );
      }
      for (const save of ["fort", "ref", "will"] as const) {
        const expected = expectedSave(entry.progression[save], level);
        if (row[save] !== expected) {
          push(
            "class.table.save",
            level,
            `${save} ${row[save]} pero la progresión ${entry.progression[save]} da ${expected}`,
          );
        }
      }
      // Una clase lanzadora lleva spellsPerDay en las 20 filas y una que no lanza, en ninguna.
      if (entry.casting !== undefined && row.spellsPerDay === undefined) {
        push("class.table.spells", level, "clase lanzadora sin spellsPerDay");
      }
      if (entry.casting === undefined && row.spellsPerDay !== undefined) {
        push("class.table.spells", level, "clase sin lanzamiento con spellsPerDay");
      }
      if (row.special.length !== row.specialIds.length) {
        push(
          "class.table.special",
          level,
          `special tiene ${row.special.length} nombres y specialIds ${row.specialIds.length}`,
        );
      }
    });
  }
  return issues;
};
