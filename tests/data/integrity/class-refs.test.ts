import { describe, expect, it } from "vitest";
import { classRefsRule } from "../../../src/data/integrity/class-refs";
import { CLASS_IDS, type ClassEntry } from "../../../src/data/schema/class";
import { dataset } from "../helpers/integrity";
import { makeClass, makeFeature } from "../helpers/classes";
import golden from "../fixtures/class-golden.json";

const ctx = { slugAliases: {}, config: {} };

function rogueWithSpecial(special: string[], specialIds: string[]): ClassEntry {
  const rogue = makeClass();
  return {
    ...rogue,
    table: rogue.table.map((r) => (r.level === 1 ? { ...r, special, specialIds } : r)),
  };
}

describe("class-refs (R9, R12, R13, R14)", () => {
  it("R14: caso verde, la capacidad existe en class-features", () => {
    const data = dataset({
      entries: { classes: [makeClass()], "class-features": [makeFeature()] },
    });
    expect(classRefsRule(data, ctx).filter((i) => i.rule !== "class.set")).toEqual([]);
  });

  it("R14: un nombre de special que no resuelve a una capacidad falla", () => {
    const data = dataset({
      entries: {
        classes: [rogueWithSpecial(["Sneak attack +1d6"], ["rogue.sneak-attack"])],
        "class-features": [makeFeature("rogue.trapfinding", { name: "Trapfinding" })],
      },
    });
    const issues = classRefsRule(data, ctx).filter((i) => i.rule === "class.special-ref");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain("Sneak attack +1d6");
    expect(issues[0]!.message).toContain("rogue.sneak-attack");
  });

  it("R14: una capacidad de otra clase no vale", () => {
    const data = dataset({
      entries: {
        classes: [rogueWithSpecial(["Rage"], ["barbarian.rage"])],
        "class-features": [makeFeature("barbarian.rage", { name: "Rage" })],
      },
    });
    const issues = classRefsRule(data, ctx).filter((i) => i.rule === "class.special-ref");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain("barbarian");
  });

  it("R13: parentId inexistente y classId sin clase fallan", () => {
    const orphan = makeFeature("rogue.talent.bleeding-attack", {
      kind: "option",
      parentId: "rogue.rogue-talents",
    });
    const stray = makeFeature("monk.flurry-of-blows", { name: "Flurry of Blows" });
    const data = dataset({
      entries: { classes: [makeClass()], "class-features": [makeFeature(), orphan, stray] },
    });
    const rules = classRefsRule(data, ctx).map((i) => i.rule);
    expect(rules).toContain("class-feature.parent-ref");
    expect(rules).toContain("class-feature.class-ref");
  });

  it("R9: faltan clases o sobra una fuera de las 7", () => {
    const data = dataset({ entries: { classes: [makeClass("rogue"), makeClass("monk")] } });
    const issues = classRefsRule(data, ctx).filter((i) => i.rule === "class.set");
    expect(issues.filter((i) => i.message.startsWith("falta"))).toHaveLength(CLASS_IDS.length - 1);
    expect(issues.filter((i) => i.id === "monk")).toHaveLength(1);
  });

  it("R12: valores de referencia (golden) distintos fallan nombrando el campo", () => {
    const bad = makeClass(
      "rogue",
      { bab: "threeQuarters", fort: "poor", ref: "good", will: "poor" },
      {
        hitDie: 10,
      },
    );
    const data = dataset({ entries: { classes: [bad] } });
    const issues = classRefsRule(data, { ...ctx, config: { classGolden: golden } }).filter(
      (i) => i.rule === "class.golden",
    );
    expect(issues).toHaveLength(1); // solo hitDie (10 != 8): rangos y progresiones coinciden
    expect(issues.map((i) => i.message).join("|")).toContain("hitDie");
  });

  it("R12: sin golden en el contexto no se compara", () => {
    const data = dataset({ entries: { classes: [makeClass("rogue", undefined, { hitDie: 12 })] } });
    expect(classRefsRule(data, ctx).filter((i) => i.rule === "class.golden")).toEqual([]);
  });

  it("classSkills -> skills cuando el dataset de habilidades está presente", () => {
    const skills = [{ id: "acrobatics" }];
    const data = dataset({ entries: { classes: [makeClass()], skills } });
    const issues = classRefsRule(data, ctx).filter((i) => i.rule === "class.skill-ref");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain("knowledge-local");
    const none = dataset({ entries: { classes: [makeClass()] } });
    expect(classRefsRule(none, ctx).filter((i) => i.rule === "class.skill-ref")).toEqual([]);
  });
});
