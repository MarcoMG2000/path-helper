import { describe, expect, it } from "vitest";
import { getEnhancementEffects, getItemEffects } from "../../src/data/magic-items/effects";
import { evidenceContainsDice, evidenceContainsValue } from "../../src/data/magic-items/evidence";
import { BONUS_TYPES, MagicItemSchema } from "../../src/data/schema/magic-item";
import { BONUS_TYPES as F2_BONUS_TYPES, type Modifier } from "../../src/rules/types";
import bonusTypes from "./fixtures/bonus-types.json";
import { effect, magicBase } from "./helpers/magic";

function cloak() {
  const variants = [1, 2, 3].map((n) => ({
    variantId: `plus-${n}`,
    label: `+${n}`,
    casterLevel: 5,
    priceRaw: `${n * n * 1000} gp (+${n})`,
    priceCp: n * n * 100000,
    effects: [
      effect({
        target: "save.all",
        bonusType: "resistance",
        value: n,
        evidence: "+1 to +5 resistance bonus on all saving throws",
      }),
      effect({
        target: "skill.stealth",
        bonusType: "competence",
        value: -n,
        conditional: true,
        conditionText: "solo de noche",
        evidence: "–1 competence penalty",
      }),
    ],
    extraDamage: [],
  }));
  return MagicItemSchema.parse(
    magicBase({
      id: "cloak-of-resistance",
      name: "Cloak of Resistance",
      kind: "wondrous",
      variants,
    }),
  );
}

describe("getItemEffects (R79)", () => {
  it("R79: forma Modifier con id estable magic:<entry>:<variante>:<n> y type = bonusType", () => {
    const effects = getItemEffects(cloak(), "plus-2")!;
    const stealth = effects.find((e) => e.target === "skill.stealth")!;
    expect(stealth).toMatchObject({
      id: "magic:cloak-of-resistance:plus-2:1",
      name: "Cloak of Resistance",
      value: -2,
      type: "competence",
      target: "skill.stealth",
      appliesTo: "wearer",
      conditional: true,
      conditionText: "solo de noche",
    });
    expect(stealth).not.toHaveProperty("foldInto");
  });

  it("R79: save.all se expande en tres efectos con ids únicos", () => {
    const effects = getItemEffects(cloak(), "plus-3")!;
    const saves = effects.filter((e) => e.target.startsWith("save."));
    expect(saves.map((e) => e.target)).toEqual(["save.fortitude", "save.reflex", "save.will"]);
    expect(saves.map((e) => e.id)).toEqual([
      "magic:cloak-of-resistance:plus-3:0:fortitude",
      "magic:cloak-of-resistance:plus-3:0:reflex",
      "magic:cloak-of-resistance:plus-3:0:will",
    ]);
    expect(new Set(effects.map((e) => e.id)).size).toBe(effects.length);
    for (const save of saves) expect(save.value).toBe(3);
  });

  it("R79: ids únicos entre variantes del mismo objeto", () => {
    const entry = cloak();
    const ids = entry.variants.flatMap((v) => getItemEffects(entry, v.variantId)!.map((e) => e.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("R79: una variante inexistente devuelve undefined sin lanzar", () => {
    expect(getItemEffects(cloak(), "plus-9")).toBeUndefined();
  });

  it("R79: foldInto se propaga solo si existe", () => {
    const entry = MagicItemSchema.parse(
      magicBase({
        variants: [
          {
            variantId: "plus-1",
            label: "+1",
            casterLevel: 5,
            priceRaw: "2,000 gp ( +1)",
            priceCp: 200000,
            effects: [
              effect({
                bonusType: "enhancement",
                foldInto: "naturalArmor",
                evidence: "enhancement bonus to his natural armor from +1 to +5",
              }),
            ],
            extraDamage: [],
          },
        ],
      }),
    );
    expect(getItemEffects(entry, "plus-1")![0]).toMatchObject({
      target: "ac",
      type: "enhancement",
      foldInto: "naturalArmor",
    });
  });

  it("R73/R79: BONUS_TYPES es idéntico al de f2 y al fixture, y el resultado es asignable a Modifier", () => {
    expect([...BONUS_TYPES]).toEqual([...F2_BONUS_TYPES]);
    expect([...BONUS_TYPES]).toEqual(bonusTypes.bonusTypes);
    const modifiers: Modifier[] = getItemEffects(cloak(), "plus-1")!;
    expect(modifiers.every((m) => F2_BONUS_TYPES.includes(m.type as never))).toBe(true);
  });
});

describe("getEnhancementEffects (R80)", () => {
  it("R80: arma = ataque y daño enhancement sobre el objeto", () => {
    const effects = getEnhancementEffects("weapon", 2);
    expect(effects.map((e) => e.target)).toEqual(["attack", "damage"]);
    for (const e of effects) {
      expect(e).toMatchObject({
        type: "enhancement",
        value: 2,
        appliesTo: "item",
        conditional: false,
      });
    }
    expect(new Set(effects.map((e) => e.id)).size).toBe(2);
  });

  it("R80: armadura y escudo = un efecto a la CA que se pliega en armor / shield", () => {
    expect(getEnhancementEffects("armor", 3)).toMatchObject([
      { target: "ac", type: "enhancement", value: 3, foldInto: "armor", appliesTo: "item" },
    ]);
    expect(getEnhancementEffects("shield", 1)).toMatchObject([
      { target: "ac", type: "enhancement", value: 1, foldInto: "shield" },
    ]);
  });

  it("R80: la mejora va de 1 a 5", () => {
    expect(() => getEnhancementEffects("weapon", 6)).toThrow(RangeError);
    expect(() => getEnhancementEffects("armor", 0)).toThrow(RangeError);
  });
});

describe("evidencia con valor (R75)", () => {
  it("R75: número exacto, rango «+1 to +5» y lista «+2, +4, or +6»", () => {
    expect(evidenceContainsValue("+5 competence bonus on Stealth checks", 5)).toBe(true);
    expect(evidenceContainsValue("+5 competence bonus on Stealth checks", -5)).toBe(true);
    expect(evidenceContainsValue("+1 to +5 resistance bonus", 3)).toBe(true);
    expect(evidenceContainsValue("+1 to +5 resistance bonus", 6)).toBe(false);
    expect(evidenceContainsValue("bonus to Strength of +2, +4, or +6", 4)).toBe(true);
    expect(evidenceContainsValue("bonus to Strength of +2, +4, or +6", 5)).toBe(false);
    expect(evidenceContainsValue("a –2 morale penalty", 2)).toBe(true);
  });
  it("R75: dados", () => {
    expect(evidenceContainsDice("an extra 1d6 points of fire damage", "1d6")).toBe(true);
    expect(evidenceContainsDice("an extra 1d6 points of fire damage", "2d6")).toBe(false);
  });
});
