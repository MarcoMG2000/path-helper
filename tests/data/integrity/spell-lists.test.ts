import { describe, expect, it } from "vitest";
import { runIntegrity } from "../../../src/data/integrity";
import { spellListsRule } from "../../../src/data/integrity/spell-lists";
import {
  defaultContext,
  emptyDataset,
  type IntegrityIssue,
  type LoadedDataset,
} from "../../../src/data/integrity/types";
import { classifyDuration } from "../../../src/data/spells/fields";
import { spellEntry } from "../spells/helpers";

const ctx = defaultContext();

function data(
  spells: Record<string, unknown>[],
  extra: Partial<LoadedDataset> = {},
): LoadedDataset {
  return { ...emptyDataset(), entries: { spells }, ...extra };
}
const rules = (issues: IntegrityIssue[]): string[] => issues.map((i) => i.rule);

const cure = spellEntry({
  id: "cure-light-wounds",
  name: "Cure Light Wounds",
  school: "conjuration",
  levels: { cleric: 1, bard: 1, ranger: 2 },
});
const bless = spellEntry({ id: "bless", name: "Bless", levels: { cleric: 1, paladin: 1 } });
const missile = spellEntry({ levels: { sorcerer: 1, wizard: 1 } });
const lists = {
  cleric: { "1": ["bless", "cure-light-wounds"] },
  bard: { "1": ["cure-light-wounds"] },
  paladin: { "1": ["bless"] },
  ranger: { "2": ["cure-light-wounds"] },
};

describe("spell-lists: R21 y R22", () => {
  it("caso verde: listas coherentes con spells[].levels (sin lista de sorcerer/wizard, R95)", () => {
    const d = data([cure, bless, missile], { spellLists: lists });
    expect(spellListsRule(d, ctx)).toEqual([]);
    // La capa ES (resúmenes y glosario) y la procedencia (counts, TZ.1) no forman parte de este dataset sintético.
    const found = runIntegrity(d, ctx, { categories: ["spells", "spell-lists"] });
    expect(found.filter((i) => !/^(summaries|glossary|counts)./.test(i.rule))).toEqual([]);
  });

  it("R21: un id de la lista que no existe en spells falla", () => {
    const d = data([cure, bless], {
      spellLists: { ...lists, cleric: { "1": ["bless", "cure-light-wounds", "ghost-spell"] } },
    });
    const issues = spellListsRule(d, ctx);
    expect(rules(issues)).toEqual(["spell-lists.unknown-spell"]);
    expect(issues[0]!.message).toMatch(/cleric.*nivel 1.*ghost-spell/);
  });

  it("R22 (lista -> spells): conjuro en la lista sin ese nivel en su entrada", () => {
    const d = data([cure, bless], {
      spellLists: { ...lists, druid: { "1": ["bless"] } },
    });
    const issues = spellListsRule(d, ctx);
    expect(rules(issues)).toEqual(["spell-lists.level-mismatch"]);
    expect(issues[0]!.message).toMatch(/druid.*bless.*nivel 1/);
  });

  it("R22 (lista -> spells): nivel distinto", () => {
    const d = data([cure, bless], {
      spellLists: { ...lists, ranger: { "3": ["cure-light-wounds"] } },
    });
    const found = spellListsRule(d, ctx);
    expect(rules(found)).toContain("spell-lists.level-mismatch");
    expect(found.some((i) => /ranger.*nivel 3.*2/.test(i.message))).toBe(true);
  });

  it("R22 (spells -> lista): nivel en la entrada que falta en la lista", () => {
    const d = data([cure, bless], {
      spellLists: { ...lists, bard: { "1": [] } },
    });
    const issues = spellListsRule(d, ctx);
    expect(rules(issues)).toEqual(["spell-lists.missing-from-list"]);
    expect(issues[0]!.message).toMatch(/bard.*cure-light-wounds.*nivel 1/);
  });

  it("sin spells/lists.json no hay comprobación de listas (se hace en D5)", () => {
    expect(spellListsRule(data([cure, bless]), ctx)).toEqual([]);
  });

  it("una clave sorcerer en las listas no se compara: la rechaza el schema, no esta regla", () => {
    const d = data([missile], { spellLists: { sorcerer: { "1": ["magic-missile"] } } });
    expect(spellListsRule(d, ctx)).toEqual([]);
    const all = runIntegrity(d, ctx, { categories: ["spell-lists"] });
    expect(rules(all)).toContain("schema");
  });
});

describe("spell-lists: R92 y R95", () => {
  it("R95: sorcerer 3 sin lista de sorcerer pasa", () => {
    const d = data([cure, bless, spellEntry({ levels: { sorcerer: 3 } })], { spellLists: lists });
    expect(spellListsRule(d, ctx)).toEqual([]);
  });

  it("R92: una clase de otro libro (alchemist) falla nombrando conjuro y clave", () => {
    const d = data([spellEntry({ levels: { sorcerer: 1, alchemist: 1 } })]);
    const issues = spellListsRule(d, ctx);
    expect(rules(issues)).toEqual(["spells.level-key"]);
    expect(issues[0]).toMatchObject({ category: "spells", id: "magic-missile" });
    expect(issues[0]!.message).toContain("alchemist");
  });

  it("R92: la clave de un dominio existente pasa y la inexistente falla", () => {
    const fire = spellEntry({ levels: { sorcerer: 3, "fire-domain": 3 } });
    const withDomain = data([fire], {
      entries: { spells: [fire], domains: [{ id: "fire-domain", name: "Fire Domain" }] },
    });
    expect(spellListsRule(withDomain, ctx)).toEqual([]);
    const without = data([fire]);
    expect(rules(spellListsRule(without, ctx))).toEqual(["spells.level-key"]);
  });
});

describe("spell-lists: R96", () => {
  it("un campo estructurado alterado falla nombrando conjuro y campo", () => {
    const tampered = spellEntry({
      duration: { ...classifyDuration("instantaneous"), kind: "permanent" },
    });
    const issues = spellListsRule(data([tampered]), ctx);
    expect(rules(issues)).toEqual(["spells.structured-field"]);
    expect(issues[0]).toMatchObject({ id: "magic-missile" });
    expect(issues[0]!.message).toContain("duration");
  });

  it("altera cada uno de los siete campos", () => {
    const base = spellEntry() as unknown as Record<string, Record<string, unknown>>;
    const cases: [string, unknown][] = [
      ["castingTime", { ...base["castingTime"], unit: "swift" }],
      ["components", { ...base["components"], material: true }],
      ["range", { ...base["range"], kind: "touch" }],
      ["targeting", [{ kind: "area", raw: "x" }]],
      ["duration", { ...base["duration"], dismissible: true }],
      ["savingThrow", { ...base["savingThrow"], kind: "will" }],
      ["spellResistance", { ...base["spellResistance"], applies: "no" }],
    ];
    // targeting: el kind viene de la etiqueta de la página; solo se vigila que `raw` coincida.
    for (const [field, value] of cases.filter(([f]) => f !== "targeting")) {
      const issues = spellListsRule(data([spellEntry({ [field]: value })]), ctx);
      expect(
        issues.map((i) => i.message.split(" ")[2]),
        field,
      ).toEqual([field]);
    }
  });

  it("un campo cuyo raw no sabe clasificar y está marcado other es válido", () => {
    const odd = spellEntry({ range: { raw: "see text", kind: "other" } });
    expect(spellListsRule(data([odd]), ctx)).toEqual([]);
  });
});
