import { describe, expect, it } from "vitest";
import { magicRefsRule } from "../../../src/data/integrity/magic-refs";
import type { IntegrityContext, LoadedDataset } from "../../../src/data/integrity/types";
import { BaseEntrySchema, type Category } from "../../../src/data/schema/common";
import { MAGIC_ITEM_KINDS } from "../../../src/data/schema/magic-item";
import { baseEntry } from "../helpers/entries";
import { dataset } from "../helpers/integrity";
import { effect, magicBase, oneOfEachKind } from "../helpers/magic";

const sections = (overrides: Record<string, unknown> = {}): unknown => ({
  kinds: Object.fromEntries(
    MAGIC_ITEM_KINDS.map((k) => [k, { description: k, ...(overrides[k] as object | undefined) }]),
  ),
  knownGaps: [],
});

function provenance(extra: Record<string, unknown> = {}): LoadedDataset["provenanceParts"] {
  return {
    "magic-items": [
      {
        file: "provenance/magic-items.json",
        data: {
          license: "OGL-1.0a",
          category: "magic-items",
          importerVersion: "1",
          humanReviewed: false,
          pages: [],
          ...extra,
        },
      },
    ],
  };
}

function context(config: unknown = sections()): IntegrityContext {
  // El resto de categorías usan el schema base; magic-items, el real.
  const schemas: Partial<Record<Category, typeof BaseEntrySchema>> = {
    weapons: BaseEntrySchema,
    armor: BaseEntrySchema,
    shields: BaseEntrySchema,
    skills: BaseEntrySchema,
    spells: BaseEntrySchema,
  };
  return { slugAliases: {}, config: { magicSections: config }, schemas };
}

const run = (data: LoadedDataset, config?: unknown): ReturnType<typeof magicRefsRule> =>
  magicRefsRule(data, context(config));
const rules = (issues: ReturnType<typeof magicRefsRule>): string[] => issues.map((i) => i.rule);

const allKindsConfig = sections({
  potion: { expectedCount: 0, reason: "sin entradas CRB" },
  oil: { expectedCount: 0, reason: "sin entradas CRB" },
  wand: { expectedCount: 0, reason: "sin entradas CRB" },
  intelligent: { expectedCount: 0, reason: "sin entradas CRB" },
});

function greenDataset(): LoadedDataset {
  const all = oneOfEachKind();
  const present = Object.entries(all).filter(
    ([kind]) => !["potion", "oil", "wand", "intelligent"].includes(kind),
  );
  const expected = Object.fromEntries(present.map(([kind]) => [kind, 1]));
  return dataset({
    entries: {
      "magic-items": present.map(([, entry]) =>
        "abilityIds" in entry ? { ...entry, abilityIds: [] } : entry,
      ),
    },
    provenanceParts: provenance({
      expectedCountByKind: expected,
      importedKinds: Object.keys(expected),
    }),
  });
}

describe("R66 y R67: cobertura y recuentos por kind", () => {
  it("caso verde: todas las secciones importadas o con expectedCount 0 y motivo", () => {
    expect(run(greenDataset(), allKindsConfig)).toEqual([]);
  });

  it("sin datos ni procedencia no hay nada que comprobar", () => {
    expect(run(dataset(), allKindsConfig)).toEqual([]);
  });

  it("R66: una sección sin entradas y sin expectedCount 0 falla (magic.sections-complete)", () => {
    const issues = run(greenDataset(), sections());
    expect(issues.map((i) => i.id ?? i.message.split(":")[0])).toEqual(
      expect.arrayContaining(["potion", "oil", "wand", "intelligent"]),
    );
    expect(new Set(rules(issues))).toEqual(new Set(["magic.sections-complete"]));
  });

  it("R66: una sección pendiente de Q11 falla y lo dice", () => {
    const pending = sections({
      potion: { pending: "Q11", reason: "pendiente" },
      oil: { expectedCount: 0, reason: "x" },
      wand: { expectedCount: 0, reason: "x" },
      intelligent: { expectedCount: 0, reason: "x" },
    });
    const issues = run(greenDataset(), pending);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain("Q11");
  });

  it("R66: expectedCount 0 con entradas importadas falla", () => {
    const data = greenDataset();
    const config = sections({
      ring: { expectedCount: 0, reason: "x" },
      potion: { expectedCount: 0, reason: "x" },
      oil: { expectedCount: 0, reason: "x" },
      wand: { expectedCount: 0, reason: "x" },
      intelligent: { expectedCount: 0, reason: "x" },
    });
    expect(run(data, config).map((i) => i.message)).toEqual([
      expect.stringContaining("ring: declarada con expectedCount 0"),
    ]);
  });

  it("R66: una configuración inválida se informa", () => {
    expect(rules(run(greenDataset(), { kinds: {} }))).toEqual(["magic.config"]);
  });

  it("R67: un recuento distinto del congelado falla", () => {
    const data = greenDataset();
    const parts = provenance({
      expectedCountByKind: { ring: 2, rod: 1 },
      importedKinds: ["ring", "rod", "wondrous"],
    });
    const issues = run({ ...data, provenanceParts: parts }, allKindsConfig).filter(
      (i) => i.rule === "magic.count",
    );
    expect(issues.map((i) => i.message)).toEqual([
      expect.stringContaining("ring: 1 entradas importadas pero expectedCountByKind es 2"),
      expect.stringContaining("wondrous: falta expectedCountByKind"),
    ]);
  });

  it("R67: solo compara los kind ya importados", () => {
    const data = dataset({
      entries: { "magic-items": [oneOfEachKind()["ring"]] },
      provenanceParts: provenance({
        expectedCountByKind: { ring: 1, rod: 24 },
        importedKinds: ["ring"],
      }),
    });
    expect(rules(run(data, allKindsConfig)).filter((r) => r === "magic.count")).toEqual([]);
  });
});

describe("R75: evidencias", () => {
  const withEffect = (patch: Record<string, unknown>): LoadedDataset => {
    const base = magicBase();
    const variants = base["variants"] as Record<string, unknown>[];
    const first = variants[0]!;
    return dataset({
      entries: {
        "magic-items": [{ ...base, variants: [{ ...first, effects: [effect(patch)] }] }],
      },
    });
  };

  it("caso verde: la evidencia es literal y trae el valor (rango incluido)", () => {
    expect(rules(run(withEffect({})))).toEqual([]);
  });

  it("R75: una evidencia ajena al texto falla", () => {
    expect(rules(run(withEffect({ evidence: "a +1 deflection bonus to AC and flight" })))).toEqual([
      "magic.evidence",
    ]);
  });

  it("R75: una evidencia literal que no contiene el valor falla", () => {
    expect(rules(run(withEffect({ value: 4, evidence: "This ring offers" })))).toEqual([
      "magic.evidence",
    ]);
  });

  it("R75: el daño adicional comprueba evidencia y dados", () => {
    const base = oneOfEachKind()["weapon-ability"]!;
    const variants = base["variants"] as Record<string, unknown>[];
    const damage = (evidence: string, dice = "1d6"): LoadedDataset =>
      dataset({
        entries: {
          "magic-items": [
            {
              ...base,
              textEn: `${base["textEn"] as string} deals an extra 1d6 points of fire damage`,
              variants: [
                {
                  ...variants[0],
                  extraDamage: [{ dice, damageType: "fire", trigger: "always", evidence }],
                },
              ],
            },
          ],
        },
      });
    expect(rules(run(damage("an extra 1d6 points of fire damage")))).toEqual([]);
    expect(rules(run(damage("an extra 2d6 points of fire damage")))).toEqual(["magic.evidence"]);
    expect(rules(run(damage("an extra 1d6 points of fire damage", "2d6")))).toEqual([
      "magic.evidence",
    ]);
  });
});

describe("R82, R83, R84: objetos específicos", () => {
  const weapon = (id: string, extra: Record<string, unknown>): Record<string, unknown> => ({
    ...baseEntry({ id, name: id }),
    ...extra,
  });
  const keen: Record<string, unknown> = {
    ...oneOfEachKind()["weapon-ability"]!,
    id: "keen",
    legalFor: {
      range: "melee",
      damageTypes: ["P", "S"],
      raw: "Only piercing or slashing melee weapons can be keen.",
    },
  };
  const seeking: Record<string, unknown> = {
    ...oneOfEachKind()["weapon-ability"]!,
    id: "seeking",
    legalFor: {
      range: "ranged",
      raw: "This special ability can only be placed on ranged weapons.",
    },
  };
  const longsword = weapon("longsword", {
    handedness: "oneHanded",
    rangeIncrementFt: null,
    damageTypes: ["S"],
  });
  const mace = weapon("heavy-mace", {
    handedness: "oneHanded",
    rangeIncrementFt: null,
    damageTypes: ["B"],
  });
  const longbow = weapon("longbow", {
    handedness: "ranged",
    rangeIncrementFt: 100,
    damageTypes: ["P"],
  });
  const dagger = weapon("dagger", {
    handedness: "light",
    rangeIncrementFt: 10,
    damageTypes: ["P", "S"],
  });

  const specific = (
    baseItemId: string,
    abilityIds: string[],
    bonus = 1,
  ): Record<string, unknown> => ({
    ...oneOfEachKind()["specific-weapon"]!,
    id: "x-specific",
    baseItemId,
    abilityIds,
    enhancement: { on: "weapon", bonus },
  });

  const data = (
    items: Record<string, unknown>[],
    weapons: Record<string, unknown>[],
  ): LoadedDataset => dataset({ entries: { "magic-items": items, weapons } });

  it("caso verde: Keen sobre espada larga, Seeking sobre arco", () => {
    expect(rules(run(data([keen, seeking, specific("longsword", ["keen"])], [longsword])))).toEqual(
      [],
    );
    expect(rules(run(data([keen, seeking, specific("longbow", ["seeking"])], [longbow])))).toEqual(
      [],
    );
  });

  it("R82: Keen sobre una maza (daño contundente) y sobre un arco falla", () => {
    expect(rules(run(data([keen, specific("heavy-mace", ["keen"])], [mace])))).toEqual([
      "magic.legal",
    ]);
    expect(rules(run(data([keen, specific("longbow", ["keen"])], [longbow])))).toEqual([
      "magic.legal",
    ]);
  });

  it("R82: Seeking sobre un arma cuerpo a cuerpo falla; sobre una arrojadiza pasa", () => {
    expect(rules(run(data([seeking, specific("longsword", ["seeking"])], [longsword])))).toEqual([
      "magic.legal",
    ]);
    expect(rules(run(data([seeking, specific("dagger", ["seeking"])], [dagger])))).toEqual([]);
  });

  it("R82: el mensaje nombra ambos ids", () => {
    const issues = run(data([keen, specific("heavy-mace", ["keen"])], [mace]));
    expect(issues[0]!.message).toContain("keen");
    expect(issues[0]!.message).toContain("heavy-mace");
  });

  it("R82: weaponIds restringe a las armas listadas", () => {
    const only = {
      ...keen,
      id: "only",
      legalFor: { range: "any", weaponIds: ["dagger"], raw: "x" },
    };
    expect(rules(run(data([only, specific("longsword", ["only"])], [longsword])))).toEqual([
      "magic.legal",
    ]);
  });

  it("R82: categorías de armadura", () => {
    const heavyOnly = {
      ...oneOfEachKind()["armor-ability"]!,
      id: "heavy-only",
      legalFor: { categories: ["heavy"], raw: "x" },
    };
    const armor = (category: string): Record<string, unknown> => ({
      ...baseEntry({ id: "chainmail", name: "Chainmail" }),
      category,
    });
    const item = {
      ...oneOfEachKind()["specific-armor"]!,
      id: "x-armor",
      baseItemId: "chainmail",
      abilityIds: ["heavy-only"],
      enhancement: { on: "armor", bonus: 1 },
    };
    const run2 = (category: string) =>
      run(dataset({ entries: { "magic-items": [heavyOnly, item], armor: [armor(category)] } }));
    expect(rules(run2("heavy"))).toEqual([]);
    expect(rules(run2("medium"))).toEqual(["magic.legal"]);
  });

  it("R83: una mejora por encima de +5 falla (mejora y suma efectiva)", () => {
    const raw = { ...specific("longsword", ["keen"], 6) };
    const permissive = {
      ...context(),
      schemas: { ...context().schemas, "magic-items": BaseEntrySchema.loose() },
    };
    const issues = magicRefsRule(
      data([keen, raw], [longsword]),
      permissive as unknown as IntegrityContext,
    );
    expect(issues.some((i) => i.rule === "magic.cap" && i.message.includes("+6"))).toBe(true);
  });

  it("R83: mejora + equivalentes por encima de +10 falla", () => {
    const heavy = (id: string, bonus: number) => ({
      ...keen,
      id,
      variants: [
        {
          ...(keen["variants"] as Record<string, unknown>[])[0],
          bonusEquivalent: bonus,
          priceCp: null,
        },
      ],
    });
    const abilities = [heavy("a", 5), heavy("b", 4), heavy("c", 2)];
    const item = specific("longsword", ["a", "b", "c"], 5);
    const issues = run(data([...abilities, item], [longsword]));
    expect(issues.filter((i) => i.rule === "magic.cap").map((i) => i.message)).toEqual([
      expect.stringContaining("+16"),
    ]);
    const fine = specific("longsword", ["a", "b"], 1);
    expect(rules(run(data([...abilities, fine], [longsword])))).toEqual([]);
  });

  it("R84: baseItemId inexistente, abilityId inexistente o de otro kind fallan", () => {
    expect(rules(run(data([specific("scimitar", [])], [longsword])))).toEqual(["magic.ref"]);
    expect(rules(run(data([specific("longsword", ["ghost"])], [longsword])))).toEqual([
      "magic.ref",
    ]);
    const armorAbility = { ...oneOfEachKind()["armor-ability"]!, id: "ghost" };
    expect(rules(run(data([armorAbility, specific("longsword", ["ghost"])], [longsword])))).toEqual(
      ["magic.ref"],
    );
  });

  it("R84: un objetivo skill.<id> inexistente falla", () => {
    const base = magicBase();
    const variants = base["variants"] as Record<string, unknown>[];
    const item = {
      ...base,
      textEn: `${base["textEn"] as string} +5 competence bonus on Stealth checks`,
      variants: [
        {
          ...variants[0],
          effects: [
            effect({
              target: "skill.stealth",
              bonusType: "competence",
              value: 5,
              evidence: "+5 competence bonus on Stealth checks",
            }),
          ],
        },
      ],
    };
    const skills = [baseEntry({ id: "stealth", name: "Stealth" })];
    expect(rules(run(dataset({ entries: { "magic-items": [item], skills } })))).toEqual([]);
    const other = [baseEntry({ id: "climb", name: "Climb" })];
    expect(rules(run(dataset({ entries: { "magic-items": [item], skills: other } })))).toEqual([
      "magic.ref",
    ]);
  });

  it("R84: las categorías no cargadas o incompletas no producen falsos fallos", () => {
    expect(rules(run(dataset({ entries: { "magic-items": [specific("scimitar", [])] } })))).toEqual(
      [],
    );
    const partial = dataset({
      entries: { "magic-items": [specific("scimitar", [])], weapons: [longsword] },
      provenanceParts: {
        ...provenance(),
        weapons: [
          {
            file: "p",
            data: {
              license: "OGL-1.0a",
              category: "weapons",
              importerVersion: "1",
              humanReviewed: false,
              expectedCount: 88,
              pages: [],
            },
          },
        ],
      },
    });
    expect(rules(run(partial)).filter((r) => r === "magic.ref")).toEqual([]);
  });
});

describe("R85: conjuros", () => {
  const withSpells = (spellRefs: unknown[]): LoadedDataset =>
    dataset({
      entries: {
        "magic-items": [{ ...oneOfEachKind()["wand"]!, spellRefs }],
        spells: [baseEntry({ id: "magic-missile", name: "Magic Missile" })],
      },
    });

  it("caso verde: spellId existente, o null con un conjuro que no es del CRB", () => {
    expect(rules(run(withSpells([{ name: "Magic missile", spellId: "magic-missile" }])))).toEqual(
      [],
    );
    expect(rules(run(withSpells([{ name: "Soulbind", spellId: null }])))).toEqual([]);
  });

  it("R85: spellId inexistente falla", () => {
    expect(rules(run(withSpells([{ name: "Fireball", spellId: "fireball" }])))).toEqual([
      "magic.spell",
    ]);
  });

  it("R85: spellId null con el nombre de un conjuro del CRB falla", () => {
    expect(rules(run(withSpells([{ name: "Magic Missile", spellId: null }])))).toEqual([
      "magic.spell",
    ]);
  });
});
