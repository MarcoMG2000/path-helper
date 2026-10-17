import { describe, expect, it } from "vitest";
import { domainRefsRule } from "../../../src/data/integrity/domain-refs";
import { dataset } from "../helpers/integrity";
import { makeDomain, makeFeature } from "../helpers/classes";

const ctx = { slugAliases: {}, config: {} };

const power = makeFeature("cleric.domain.air.lightning-arc", {
  name: "Lightning Arc",
  kind: "option",
  parentId: "cleric.domains",
  abilityType: "Sp",
  textEn: "Arc of electricity.",
});
const spellsOf = (domain = makeDomain()) => domain.spells.map((s) => ({ id: s.spellId }));

describe("domain-refs (R23)", () => {
  it("R23: caso verde, conjuros existentes y poderes coherentes", () => {
    const data = dataset({
      entries: { domains: [makeDomain()], "class-features": [power], spells: spellsOf() },
    });
    expect(domainRefsRule(data, ctx)).toEqual([]);
  });

  it("R23: un conjuro de dominio inexistente en spells falla nombrando dominio y conjuro", () => {
    const spells = spellsOf().filter((s) => s.id !== "wind-wall");
    const data = dataset({ entries: { domains: [makeDomain()], spells } });
    const issues = domainRefsRule(data, ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ category: "domains", id: "air", rule: "domain.spell-ref" });
    expect(issues[0]!.message).toContain("wind-wall");
  });

  it("sin dataset de conjuros no se comprueba (lo exige la integración final)", () => {
    const data = dataset({ entries: { domains: [makeDomain()] } });
    expect(domainRefsRule(data, ctx)).toEqual([]);
  });

  it("los poderes de domains y de class-features deben coincidir", () => {
    const changed = { ...power, level: 6 };
    const data = dataset({ entries: { domains: [makeDomain()], "class-features": [changed] } });
    expect(domainRefsRule(data, ctx).map((i) => i.rule)).toEqual(["domain.powers-consistency"]);
    const textual = { ...power, textEn: "Otro texto." };
    const data2 = dataset({ entries: { domains: [makeDomain()], "class-features": [textual] } });
    expect(domainRefsRule(data2, ctx).map((i) => i.rule)).toEqual(["domain.powers-consistency"]);
  });

  it("falta o sobra un poder respecto a domains", () => {
    const extra = makeFeature("cleric.domain.air.extra", {
      name: "Extra",
      kind: "option",
      parentId: "cleric.domains",
    });
    const data = dataset({
      entries: { domains: [makeDomain()], "class-features": [power, extra] },
    });
    expect(domainRefsRule(data, ctx).map((i) => i.rule)).toEqual(["domain.powers-consistency"]);
  });

  it("poderes de un dominio que no existe en domains fallan", () => {
    const ghost = makeFeature("cleric.domain.fire.fire-bolt", {
      name: "Fire Bolt",
      kind: "option",
      parentId: "cleric.domains",
    });
    const data = dataset({
      entries: { domains: [makeDomain()], "class-features": [power, ghost] },
    });
    expect(domainRefsRule(data, ctx).map((i) => i.rule)).toEqual(["domain.feature-ref"]);
  });
});
