import { describe, expect, it } from "vitest";
import { overridesRule } from "../../../src/data/integrity/overrides";
import { baseEntry } from "../helpers/entries";
import { baseContext, dataset } from "../helpers/integrity";

const ok = {
  id: "power-attack",
  field: "name",
  value: "Power Attack!",
  reason: "r",
  evidence: "e",
};
const prov = (overridesApplied: unknown[]) => ({
  file: "provenance/feats.json",
  data: {
    license: "OGL-1.0a",
    category: "feats",
    importerVersion: "1",
    humanReviewed: false,
    pages: [],
    overridesApplied,
  },
});

function build(
  overrides: unknown[],
  entry = baseEntry({ name: "Power Attack!" }),
  applied: unknown[] = [],
) {
  return dataset({
    entries: { feats: [entry] },
    overrideParts: { feats: [{ file: "overrides/feats.json", data: overrides }] },
    provenanceParts: { feats: [prov(applied)] },
  });
}

describe("overrides (R49)", () => {
  it("caso verde: aplicado, con reason/evidence y no obsoleto", () => {
    const data = build([ok], undefined, [
      { id: "power-attack", field: "name", parsedValue: "Power Attack" },
    ]);
    expect(overridesRule(data, baseContext())).toEqual([]);
  });

  it("R49: reason o evidence ausentes/vacíos fallan", () => {
    const noReason: Record<string, unknown> = { ...ok };
    delete noReason["reason"];
    const issues = overridesRule(build([noReason, { ...ok, evidence: " " }]), baseContext());
    expect(issues.map((i) => i.rule).sort()).toEqual(["overrides.evidence", "overrides.reason"]);
  });

  it("R49: override obsoleto (el parser ya producía el valor) falla", () => {
    const data = build([ok], undefined, [
      { id: "power-attack", field: "name", parsedValue: "Power Attack!" },
    ]);
    expect(overridesRule(data, baseContext()).map((i) => i.rule)).toEqual(["overrides.obsolete"]);
  });

  it("R49: override no aplicado a los datos o con id inexistente falla", () => {
    const notApplied = build([ok], baseEntry());
    expect(overridesRule(notApplied, baseContext()).map((i) => i.rule)).toEqual([
      "overrides.not-applied",
    ]);
    const ghost = build([{ ...ok, id: "ghost" }]);
    expect(overridesRule(ghost, baseContext()).map((i) => i.rule)).toEqual(["overrides.target"]);
  });

  it("un fichero que no es array es formato erróneo", () => {
    const data = dataset({
      entries: { feats: [baseEntry()] },
      overrideParts: { feats: [{ file: "o.json", data: {} }] },
    });
    expect(overridesRule(data, baseContext()).map((i) => i.rule)).toEqual(["overrides.format"]);
  });
});
