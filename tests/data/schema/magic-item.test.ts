import { describe, expect, it } from "vitest";
import { getCategory } from "../../../src/data/categories";
import {
  BONUS_TYPES,
  ExtraDamageSchema,
  MAGIC_ITEM_KINDS,
  MagicEffectSchema,
  MagicItemSchema,
  MagicSectionsConfigSchema,
} from "../../../src/data/schema/magic-item";
import bonusTypes from "../fixtures/bonus-types.json";
import { effect, magicBase, oneOfEachKind } from "../helpers/magic";

const ok = (value: unknown): boolean => MagicItemSchema.safeParse(value).success;
const withVariant = (patch: Record<string, unknown>): Record<string, unknown> => {
  const base = magicBase();
  const variants = base["variants"] as Record<string, unknown>[];
  return { ...base, variants: [{ ...variants[0], ...patch }] };
};

describe("MagicItemSchema: categoría y kinds (R63, R64)", () => {
  it("R63: magic-items está registrada con dataset magicItems y un fichero por kind", () => {
    const def = getCategory("magic-items");
    expect(def.dataset).toBe("magicItems");
    expect(def.shardPatterns).toEqual(["magic-items/*.json"]);
    expect(def.schema).toBe(MagicItemSchema);
  });

  it("R64: los 17 kinds del capítulo 15", () => {
    expect([...MAGIC_ITEM_KINDS]).toEqual([
      "armor-ability",
      "shield-ability",
      "weapon-ability",
      "specific-armor",
      "specific-shield",
      "specific-weapon",
      "potion",
      "oil",
      "ring",
      "rod",
      "staff",
      "wand",
      "wondrous",
      "cursed",
      "intelligent",
      "artifact",
      "general",
    ]);
  });

  it("R64: una entrada válida de cada kind pasa", () => {
    const all = oneOfEachKind();
    expect(Object.keys(all).sort()).toEqual([...MAGIC_ITEM_KINDS].sort());
    for (const [kind, entry] of Object.entries(all)) {
      const result = MagicItemSchema.safeParse(entry);
      expect(result.success, `${kind}: ${JSON.stringify(result.error?.issues)}`).toBe(true);
    }
  });

  it("R64: un kind desconocido, sin variants o con campos extra falla", () => {
    expect(ok(magicBase({ kind: "scroll" }))).toBe(false);
    expect(ok(magicBase({ variants: [] }))).toBe(false);
    expect(ok(magicBase({ surprise: 1 }))).toBe(false);
    expect(ok(magicBase({ book: "APG" }))).toBe(false); // R3
  });

  it("R64: weightLb admite número o null y nunca negativo", () => {
    expect(ok(magicBase({ weightLb: 1.5 }))).toBe(true);
    expect(ok(magicBase({ weightLb: -1 }))).toBe(false);
  });

  it("variantId repetido falla", () => {
    const base = magicBase();
    const v = (base["variants"] as unknown[])[0];
    expect(ok({ ...base, variants: [v, v] })).toBe(false);
  });
});

describe("precios (R68, R69)", () => {
  it("R68: priceCp entero no negativo o null", () => {
    expect(ok(withVariant({ priceCp: 0 }))).toBe(true);
    expect(ok(withVariant({ priceCp: null }))).toBe(true);
    expect(ok(withVariant({ priceCp: 12.5 }))).toBe(false);
    expect(ok(withVariant({ priceCp: -100 }))).toBe(false);
  });

  it("R69: bonusEquivalent de 1 a 5 y nunca junto a un priceCp no nulo", () => {
    expect(ok(withVariant({ bonusEquivalent: 2, priceCp: null }))).toBe(true);
    expect(ok(withVariant({ bonusEquivalent: 2, priceCp: 100 }))).toBe(false);
    expect(ok(withVariant({ bonusEquivalent: 6, priceCp: null }))).toBe(false);
    expect(ok(withVariant({ bonusEquivalent: 0, priceCp: null }))).toBe(false);
  });

  it("R69: una variante de habilidad sin bonusEquivalent ni precio falla", () => {
    const ability = oneOfEachKind()["weapon-ability"]!;
    const variants = ability["variants"] as Record<string, unknown>[];
    const broken = { ...variants[0], bonusEquivalent: undefined, priceCp: null };
    expect(ok({ ...ability, variants: [broken] })).toBe(false);
  });
});

describe("objetos específicos (R70)", () => {
  const specific = (patch: Record<string, unknown>): Record<string, unknown> => ({
    ...oneOfEachKind()["specific-weapon"]!,
    ...patch,
  });

  it("R70: baseEvidence debe ser subcadena literal de textEn", () => {
    expect(ok(specific({}))).toBe(true);
    expect(ok(specific({ baseEvidence: "+1 keen longsword" }))).toBe(false);
  });

  it("R70: baseItemId null exige baseItemRaw", () => {
    expect(ok(specific({ baseItemId: null }))).toBe(false);
    expect(ok(specific({ baseItemId: null, baseItemRaw: "+1 flaming burst longsword" }))).toBe(
      true,
    );
  });

  it("R70: la mejora va de 1 a 5 y su `on` corresponde al kind", () => {
    expect(ok(specific({ enhancement: { on: "weapon", bonus: 6 } }))).toBe(false);
    expect(ok(specific({ enhancement: { on: "weapon", bonus: 0 } }))).toBe(false);
    expect(ok(specific({ enhancement: { on: "armor", bonus: 1 } }))).toBe(false);
  });

  it("R70: sin enhancement solo si el objeto no es mágico o queda needsReview", () => {
    const rest = { ...specific({}) };
    delete rest["enhancement"];
    expect(ok(rest)).toBe(false);
    expect(ok({ ...rest, needsReview: true })).toBe(true);
    expect(ok({ ...rest, aura: "no aura (nonmagical)" })).toBe(true);
  });
});

describe("secciones general (R71)", () => {
  it("R71: enhancementPrices de 1 a 5 con priceCp entero", () => {
    const general = oneOfEachKind()["general"]!;
    expect(ok(general)).toBe(true);
    expect(ok({ ...general, enhancementPrices: [{ bonus: 6, priceCp: 100 }] })).toBe(false);
    expect(ok({ ...general, enhancementPrices: [{ bonus: 1, priceCp: 1.5 }] })).toBe(false);
  });
});

describe("efectos (R72-R77)", () => {
  const parses = (patch: Record<string, unknown>): boolean =>
    MagicEffectSchema.safeParse({ ...effect(), ...patch }).success;

  it("R72: forma completa y value entero distinto de 0 (negativo = penalizador)", () => {
    expect(parses({})).toBe(true);
    expect(parses({ value: -2 })).toBe(true);
    expect(parses({ value: 0 })).toBe(false);
    expect(parses({ value: 1.5 })).toBe(false);
    expect(parses({ appliesTo: "anyone" })).toBe(false);
    expect(parses({ evidence: "" })).toBe(false);
  });

  it("R73: bonusType es exactamente el catálogo de 19 tipos de f2", () => {
    expect([...BONUS_TYPES]).toEqual(bonusTypes.bonusTypes);
    expect(BONUS_TYPES).toHaveLength(19);
    for (const type of BONUS_TYPES) expect(parses({ bonusType: type })).toBe(true);
    expect(parses({ bonusType: "magic" })).toBe(false);
    expect(parses({ bonusType: "natural armor" })).toBe(false);
  });

  it("R74: target del vocabulario o skill.<id>", () => {
    const valid = [
      "attack",
      "damage",
      "ac",
      "initiative",
      "save.fortitude",
      "save.reflex",
      "save.will",
      "save.all",
      "ability.str",
      "ability.cha",
      "skill.sleight-of-hand",
    ];
    for (const target of valid) expect(parses({ target }), target).toBe(true);
    for (const target of ["hp", "ability.luck", "skill.", "skill.Stealth", "save"]) {
      expect(parses({ target }), target).toBe(false);
    }
  });

  it("R76: conditional exige conditionText y viceversa", () => {
    expect(parses({ conditional: true, conditionText: "contra miedo" })).toBe(true);
    expect(parses({ conditional: true })).toBe(false);
    expect(parses({ conditional: false, conditionText: "x" })).toBe(false);
    expect(parses({ conditional: true, conditionText: "" })).toBe(false);
  });

  it("R77: foldInto solo con target ac y valores armor|shield|naturalArmor", () => {
    expect(parses({ foldInto: "naturalArmor" })).toBe(true);
    expect(parses({ foldInto: "armor" })).toBe(true);
    expect(parses({ foldInto: "shield" })).toBe(true);
    expect(parses({ foldInto: "weapon" })).toBe(false);
    expect(parses({ target: "attack", foldInto: "armor" })).toBe(false);
  });
});

describe("daño adicional (R78)", () => {
  const damage = {
    dice: "1d6",
    damageType: "fire",
    trigger: "always",
    evidence: "an extra 1d6 points of fire damage",
  };
  it("R78: dados NdM, tipo y disparador", () => {
    expect(ExtraDamageSchema.safeParse(damage).success).toBe(true);
    expect(ExtraDamageSchema.safeParse({ ...damage, dice: "d6" }).success).toBe(false);
    expect(ExtraDamageSchema.safeParse({ ...damage, trigger: "sometimes" }).success).toBe(false);
    expect(ExtraDamageSchema.safeParse({ ...damage, trigger: "onCritical" }).success).toBe(true);
  });
  it("R78: conditional exige conditionText", () => {
    expect(ExtraDamageSchema.safeParse({ ...damage, trigger: "conditional" }).success).toBe(false);
    const conditional = { ...damage, trigger: "conditional", conditionText: "contra el mal" };
    expect(ExtraDamageSchema.safeParse(conditional).success).toBe(true);
    expect(ExtraDamageSchema.safeParse({ ...damage, conditionText: "x" }).success).toBe(false);
  });
});

describe("habilidades especiales (R81)", () => {
  it("R81: legalFor de arma (range, damageTypes, weaponIds, raw)", () => {
    const ability = oneOfEachKind()["weapon-ability"]!;
    expect(ok(ability)).toBe(true);
    const rest = { ...ability };
    delete rest["legalFor"];
    expect(ok(rest)).toBe(false);
    expect(ok({ ...ability, legalFor: { range: "everywhere", raw: "" } })).toBe(false);
    expect(ok({ ...ability, legalFor: { range: "any", damageTypes: ["X"], raw: "" } })).toBe(false);
    expect(ok({ ...ability, legalFor: { range: "any", weaponIds: ["longsword"], raw: "" } })).toBe(
      true,
    );
  });

  it("R81: legalFor de armadura y escudo (categories light|medium|heavy)", () => {
    const shield = oneOfEachKind()["shield-ability"]!;
    expect(ok({ ...shield, legalFor: { categories: ["tower"], raw: "" } })).toBe(false);
    expect(ok({ ...shield, legalFor: { categories: ["heavy"], raw: "" } })).toBe(true);
    expect(ok({ ...shield, legalFor: { categories: ["light"] } })).toBe(false); // raw obligatorio
  });
});

describe("magic-sections.json (R66)", () => {
  const sections = (extra: Record<string, unknown>): unknown => ({
    kinds: Object.fromEntries(
      MAGIC_ITEM_KINDS.map((k) => [k, { description: k, ...(extra[k] as object | undefined) }]),
    ),
    knownGaps: [],
  });
  it("R66: expectedCount 0 y pending exigen un reason", () => {
    expect(MagicSectionsConfigSchema.safeParse(sections({})).success).toBe(true);
    expect(
      MagicSectionsConfigSchema.safeParse(sections({ artifact: { expectedCount: 0 } })).success,
    ).toBe(false);
    expect(
      MagicSectionsConfigSchema.safeParse(
        sections({ artifact: { expectedCount: 0, reason: "no hay" } }),
      ).success,
    ).toBe(true);
    expect(
      MagicSectionsConfigSchema.safeParse(sections({ wand: { pending: "Q11" } })).success,
    ).toBe(false);
  });
  it("R66: falta un kind -> inválido", () => {
    const partial = sections({}) as { kinds: Record<string, unknown> };
    delete partial.kinds["ring"];
    expect(MagicSectionsConfigSchema.safeParse(partial).success).toBe(false);
  });
});
