import { describe, expect, it } from "vitest";
import { featPrereqsRule } from "../../../src/data/integrity/feat-prereqs";
import { runIntegrity } from "../../../src/data/integrity";
import { FeatSchema } from "../../../src/data/schema/feat";
import { baseEntry } from "../helpers/entries";
import { baseContext, dataset } from "../helpers/integrity";

// Datos sintéticos (no son dotes reales del CRB): solo ejercitan las reglas de integridad.
function feat(
  id: string,
  featIds: string[] = [],
  skills: { skillId: string; ranks: number }[] = [],
) {
  return {
    ...baseEntry({ id, name: id, textEn: `Texto de ${id}.` }),
    types: ["General"],
    prerequisites: { raw: featIds.join(", "), featIds, skills, other: [] },
    benefit: `Beneficio de ${id}.`,
  };
}

const ctx = baseContext({ schemas: { feats: FeatSchema } });

describe("feat-prereqs (R18, R19)", () => {
  it("R18: un prerrequisito inexistente falla", () => {
    const data = dataset({ entries: { feats: [feat("b", ["a"]), feat("c", ["zzz"])] } });
    const issues = featPrereqsRule(data, ctx);
    expect(issues.map((i) => [i.rule, i.id])).toEqual([
      ["feats.prereq-ref", "b"],
      ["feats.prereq-ref", "c"],
    ]);
    expect(issues[1]?.message).toContain('"zzz"');
  });

  it("R19: un ciclo de dos dotes falla y nombra a los miembros", () => {
    const data = dataset({
      entries: { feats: [feat("a", ["b"]), feat("b", ["a"]), feat("c", ["a"])] },
    });
    const issues = featPrereqsRule(data, ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ rule: "feats.prereq-cycle", id: "a" });
    expect(issues[0]?.message).toContain("a -> b -> a");
  });

  it("R19: un ciclo de tres dotes y una dote que se requiere a sí misma", () => {
    const data = dataset({
      entries: {
        feats: [
          feat("a", ["b"]),
          feat("b", ["c"]),
          feat("c", ["a"]),
          feat("d", ["d"]),
          feat("e", ["a"]),
        ],
      },
    });
    const issues = featPrereqsRule(data, ctx);
    expect(issues.map((i) => [i.rule, i.id])).toEqual([
      ["feats.prereq-cycle", "a"],
      ["feats.prereq-cycle", "d"],
    ]);
  });

  it("R18/R19: caso verde (cadena Power Attack -> Cleave -> Great Cleave, sintética)", () => {
    const data = dataset({
      entries: {
        feats: [feat("pa"), feat("cl", ["pa"]), feat("gc", ["cl", "pa"]), feat("solo")],
      },
    });
    expect(featPrereqsRule(data, ctx)).toEqual([]);
  });

  it("R18: una arista rota no oculta ni provoca ciclos", () => {
    const data = dataset({ entries: { feats: [feat("a", ["x"]), feat("b", ["a"])] } });
    expect(featPrereqsRule(data, ctx).map((i) => i.rule)).toEqual(["feats.prereq-ref"]);
  });

  it("las entradas que no pasan el schema no generan hallazgos de esta regla", () => {
    const data = dataset({ entries: { feats: [baseEntry({ id: "a" })] } });
    expect(featPrereqsRule(data, ctx)).toEqual([]);
  });

  it("habilidad de prerrequisito inexistente en skills (solo con skills cargada)", () => {
    const withSkill = feat("a", [], [{ skillId: "ride", ranks: 1 }]);
    const none = dataset({ entries: { feats: [withSkill] } });
    expect(featPrereqsRule(none, ctx)).toEqual([]);
    const loaded = dataset({
      entries: { feats: [withSkill], skills: [baseEntry({ id: "spellcraft" })] },
    });
    expect(featPrereqsRule(loaded, ctx).map((i) => i.rule)).toEqual(["feats.prereq-skill"]);
    const ok = dataset({
      entries: { feats: [withSkill], skills: [baseEntry({ id: "ride" })] },
    });
    expect(featPrereqsRule(ok, ctx)).toEqual([]);
  });

  it("R18/R19 están registradas en runIntegrity", () => {
    const data = dataset({
      entries: { feats: [feat("a", ["b"]), feat("b", ["a"]), feat("c", ["q"])] },
    });
    const rules = runIntegrity(data, ctx, { categories: ["feats"] }).map((i) => i.rule);
    expect(rules).toContain("feats.prereq-cycle");
    expect(rules).toContain("feats.prereq-ref");
  });
});
