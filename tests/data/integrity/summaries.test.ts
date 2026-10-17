import { describe, expect, it } from "vitest";
import { summariesRule } from "../../../src/data/integrity/summaries";
import { baseEntry } from "../helpers/entries";
import { baseContext, dataset } from "../helpers/integrity";

const summary = (summaryEs: string, status = "draft") => ({ summaryEs, status });

describe("summaries (R28, R29, R30)", () => {
  const entries = { feats: [baseEntry()] };

  it("R29: una entrada sin resumen falla", () => {
    const issues = summariesRule(dataset({ entries }), baseContext());
    expect(issues).toEqual([
      expect.objectContaining({ category: "feats", id: "power-attack", rule: "summaries.missing" }),
    ]);
  });

  it("R28/R29: caso verde con un resumen sin cifras", () => {
    const data = dataset({
      entries,
      summaryParts: {
        feats: [
          { file: "summaries/feats/p.json", data: { "power-attack": summary("Ataque fuerte.") } },
        ],
      },
    });
    expect(summariesRule(data, baseContext())).toEqual([]);
  });

  it("R30: cifras del resumen ausentes en textEn fallan; las presentes pasan", () => {
    const part = (text: string) => ({
      file: "s.json",
      data: { "power-attack": summary(text) },
    });
    const bad = dataset({
      entries,
      summaryParts: { feats: [part("-1 al ataque, +4 al daño y 3d6")] },
    });
    const issues = summariesRule(bad, baseContext());
    expect(issues).toHaveLength(1);
    expect(issues[0]?.rule).toBe("summaries.numeric");
    expect(issues[0]?.message).toContain("+4");
    expect(issues[0]?.message).toContain("3d6");
    const good = dataset({ entries, summaryParts: { feats: [part("-1 al ataque, +2 al daño")] } });
    expect(summariesRule(good, baseContext())).toEqual([]);
  });

  it("R28: resumen de más de 300 caracteres o estado inválido es formato erróneo", () => {
    const data = dataset({
      entries,
      summaryParts: {
        feats: [{ file: "s.json", data: { "power-attack": summary("x".repeat(301)) } }],
      },
    });
    expect(summariesRule(data, baseContext()).map((i) => i.rule)).toContain("summaries.format");
  });

  it("detecta resúmenes huérfanos y duplicados entre ficheros", () => {
    const data = dataset({
      entries,
      summaryParts: {
        feats: [
          { file: "a.json", data: { "power-attack": summary("a"), ghost: summary("g") } },
          { file: "b.json", data: { "power-attack": summary("b") } },
        ],
      },
    });
    const rules = summariesRule(data, baseContext()).map((i) => i.rule);
    expect(rules).toContain("summaries.orphan");
    expect(rules).toContain("summaries.duplicate");
  });

  it("categorías sin cargar no se comprueban", () => {
    expect(summariesRule(dataset(), baseContext())).toEqual([]);
  });
});
