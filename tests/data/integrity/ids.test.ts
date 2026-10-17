import { describe, expect, it } from "vitest";
import { idsRule, resolveEntryId } from "../../../src/data/integrity/ids";
import { baseEntry } from "../helpers/entries";
import { baseContext, dataset } from "../helpers/integrity";

describe("ids (R4, R5)", () => {
  it("R4: id que no coincide con el slug del nombre falla nombrando ambos", () => {
    const data = dataset({ entries: { feats: [baseEntry({ id: "power-atack" })] } });
    const issues = idsRule(data, baseContext());
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ category: "feats", id: "power-atack", rule: "ids.slug" });
    expect(issues[0]?.message).toContain("power-attack");
  });

  it("R4: caso verde y alias declarado", () => {
    const ok = dataset({ entries: { feats: [baseEntry()] } });
    expect(idsRule(ok, baseContext())).toEqual([]);
    const aliased = dataset({
      entries: { feats: [baseEntry({ id: "power-attack-feat" })] },
    });
    expect(idsRule(aliased, baseContext())).toHaveLength(1);
    expect(
      idsRule(
        aliased,
        baseContext({ slugAliases: { feats: { "power-attack": "power-attack-feat" } } }),
      ),
    ).toEqual([]);
  });

  it("R4: alias por kind `<kind>.<slug>` (magic-items)", () => {
    const entry = baseEntry({ id: "keen-weapon", name: "Keen", kind: "weapon-ability" });
    const data = dataset({ entries: { "magic-items": [entry] } });
    expect(idsRule(data, baseContext())).toHaveLength(1);
    const ctx = baseContext({
      slugAliases: { "magic-items": { "weapon-ability.keen": "keen-weapon" } },
    });
    expect(idsRule(data, ctx)).toEqual([]);
    expect(resolveEntryId("magic-items", "Keen", ctx.slugAliases, "weapon-ability")).toBe(
      "keen-weapon",
    );
    expect(resolveEntryId("magic-items", "Keen", ctx.slugAliases, "armor-ability")).toBe("keen");
  });

  it("R4: class-features admite el prefijo <clase>. sobre el slug", () => {
    const entry = baseEntry({ id: "paladin.smite-evil", name: "Smite Evil" });
    expect(idsRule(dataset({ entries: { "class-features": [entry] } }), baseContext())).toEqual([]);
    expect(idsRule(dataset({ entries: { feats: [entry] } }), baseContext())).toHaveLength(1);
  });

  it("R5: dos entradas con el mismo id fallan indicando ambos orígenes", () => {
    const data = dataset({
      entries: { feats: [baseEntry(), baseEntry()] },
      origins: { feats: ["feats/p.json", "feats/q.json"] },
    });
    const issues = idsRule(data, baseContext());
    expect(issues).toHaveLength(1);
    expect(issues[0]?.rule).toBe("ids.duplicate");
    expect(issues[0]?.message).toContain("feats/p.json[0]");
    expect(issues[0]?.message).toContain("feats/q.json[1]");
  });

  it("R5: el mismo id en categorías distintas no es duplicado", () => {
    const data = dataset({ entries: { feats: [baseEntry()], skills: [baseEntry()] } });
    expect(idsRule(data, baseContext())).toEqual([]);
  });
});
