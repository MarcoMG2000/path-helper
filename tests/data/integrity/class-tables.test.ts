import { describe, expect, it } from "vitest";
import { classTablesRule } from "../../../src/data/integrity/class-tables";
import { runIntegrity } from "../../../src/data/integrity";
import { dataset, baseContext } from "../helpers/integrity";
import { makeClass } from "../helpers/classes";
import type { ClassEntry } from "../../../src/data/schema/class";

// Se usa el schema real de `classes` (el contexto por defecto), no el base de los helpers.
const ctx = { slugAliases: {}, config: {} };

function run(entry: ClassEntry) {
  return classTablesRule(dataset({ entries: { classes: [entry] } }), ctx);
}

function withRow(entry: ClassEntry, level: number, patch: Partial<ClassEntry["table"][number]>) {
  return { ...entry, table: entry.table.map((r) => (r.level === level ? { ...r, ...patch } : r)) };
}

describe("class-tables (R11)", () => {
  it("R11: caso verde con las tres progresiones de BAB y las dos de salvación", () => {
    for (const bab of ["full", "threeQuarters", "half"] as const) {
      const entry = makeClass("rogue", { bab, fort: "good", ref: "poor", will: "good" });
      expect(run(entry)).toEqual([]);
    }
  });

  it("R11: un BAB que no corresponde a la progresión falla nombrando el nivel", () => {
    const entry = withRow(makeClass(), 8, { bab: [7, 2] });
    const issues = run(entry);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ category: "classes", id: "rogue", rule: "class.table.bab" });
    expect(issues[0]!.message).toContain("nivel 8");
  });

  it("R11: ataques iterativos incoherentes con el BAB fallan", () => {
    // BAB +6 de un 3/4 en nivel 8 sin el segundo ataque +1
    const entry = withRow(makeClass(), 8, { bab: [6] });
    expect(run(entry).map((i) => i.rule)).toEqual(["class.table.bab-iterative"]);
  });

  it("R11: una salvación buena o mala fuera de fórmula falla", () => {
    const good = withRow(makeClass(), 10, { ref: 6 }); // buena: 2 + 5 = 7
    expect(run(good)[0]).toMatchObject({ rule: "class.table.save" });
    expect(run(good)[0]!.message).toContain("ref");
    const poor = withRow(makeClass(), 9, { fort: 2 }); // mala: floor(9/3) = 3
    expect(run(poor)[0]).toMatchObject({ rule: "class.table.save" });
  });

  it("R11: informa de todos los fallos, no solo del primero", () => {
    let entry = withRow(makeClass(), 3, { will: 9 });
    entry = withRow(entry, 12, { fort: 0 });
    entry = withRow(entry, 20, { bab: [1] });
    expect(run(entry)).toHaveLength(3);
  });

  it("R10: lanzadora sin spellsPerDay, o no lanzadora con él, falla", () => {
    const caster = {
      ...makeClass(),
      casting: { ability: "wis", tradition: "divine", prepared: true, spellListId: "cleric" },
    } as ClassEntry;
    expect(run(caster).filter((i) => i.rule === "class.table.spells")).toHaveLength(20);
    const plain = withRow(makeClass(), 1, {
      spellsPerDay: [3, 1, null, null, null, null, null, null, null, null],
    });
    expect(run(plain).map((i) => i.rule)).toEqual(["class.table.spells"]);
  });

  it("R14: special y specialIds deben estar alineados", () => {
    const entry = withRow(makeClass(), 1, { specialIds: [] });
    expect(run(entry).map((i) => i.rule)).toEqual(["class.table.special"]);
  });

  it("las entradas que no superan el schema las informa la regla schema, no esta", () => {
    const broken = { ...makeClass(), table: [] };
    expect(classTablesRule(dataset({ entries: { classes: [broken] } }), ctx)).toEqual([]);
  });

  it("R52: runIntegrity agrega este hallazgo con los de otras reglas", () => {
    const entry = withRow(makeClass(), 5, { will: 0 });
    const issues = runIntegrity(
      dataset({ entries: { classes: [entry] } }),
      baseContext({ schemas: {} }),
      {
        categories: ["classes"],
      },
    );
    expect(issues.some((i) => i.rule === "class.table.save")).toBe(true);
  });
});
