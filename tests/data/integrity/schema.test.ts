import { describe, expect, it } from "vitest";
import { schemaRule } from "../../../src/data/integrity/schema";
import { baseEntry } from "../helpers/entries";
import { baseContext, dataset } from "../helpers/integrity";

describe("schema (R2-R8, R60)", () => {
  it("entradas válidas no producen hallazgos", () => {
    const data = dataset({ entries: { feats: [baseEntry()] } });
    expect(schemaRule(data, baseContext())).toEqual([]);
  });

  it("informa el origen del fichero y el campo", () => {
    const data = dataset({
      entries: { feats: [baseEntry({ sourceRef: "Otro libro" })] },
      origins: { feats: ["feats/p.json"] },
    });
    const [issue] = schemaRule(data, baseContext());
    expect(issue).toMatchObject({
      category: "feats",
      id: "power-attack",
      rule: "schema.sourceRef",
    });
    expect(issue?.message).toContain("feats/p.json");
    expect(issue?.message).toContain('campo "sourceRef"');
  });

  it("entradas sin id usan su índice y los campos extra son rechazados", () => {
    const data = dataset({ entries: { feats: ["no es objeto", baseEntry({ extra: 1 })] } });
    const issues = schemaRule(data, baseContext());
    expect(issues[0]?.id).toBe("#0");
    expect(issues.some((i) => i.id === "power-attack" && i.rule === "schema")).toBe(true);
  });

  it("spell-lists se valida como registro completo", () => {
    const ok = dataset({ spellLists: { cleric: { "1": ["bless"] } } });
    expect(schemaRule(ok, { ...baseContext(), schemas: {} })).toEqual([]);
    const bad = dataset({ spellLists: { cleric: { "1": "bless" } } });
    const issues = schemaRule(bad, { ...baseContext(), schemas: {} });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.category).toBe("spell-lists");
  });
});
