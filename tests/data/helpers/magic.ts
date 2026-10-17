import type { MagicEffect, MagicItem } from "../../../src/data/schema/magic-item";

/** Entradas sintéticas válidas de `magic-items` (no son datos reales del CRB). */
export function effect(overrides: Partial<MagicEffect> = {}): MagicEffect {
  return {
    target: "ac",
    bonusType: "deflection",
    value: 1,
    appliesTo: "wearer",
    conditional: false,
    evidence: "a deflection bonus of +1 to +5 to AC",
    ...overrides,
  };
}

const TEXT =
  "**Aura** faint abjuration; **CL** 5th; **Slot** ring; **Price** 2,000 gp (+1)\n\n**Description**\n\nThis ring offers a deflection bonus of +1 to +5 to AC.\n\n**Construction**\n\n**Requirements** Forge Ring; **Cost** 1,000 gp (+1)";

export function magicBase(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "ring-of-protection",
    name: "Ring of Protection",
    textEn: TEXT,
    source: "https://aonprd.com/MagicRingsDisplay.aspx?FinalName=Ring%20of%20Protection1",
    sourceRef: "PRPG Core Rulebook pg. 479",
    book: "CRB",
    kind: "ring",
    slot: "ring",
    aura: "faint abjuration",
    weightLb: null,
    construction: { requirements: "Forge Ring", costRaw: "1,000 gp (+1)", costCp: null },
    reprintedIn: [],
    variants: [
      {
        variantId: "plus-1",
        label: "+1",
        casterLevel: 5,
        priceRaw: "2,000 gp (+1)",
        priceCp: 200000,
        effects: [effect({ evidence: "a deflection bonus of +1 to +5 to AC" })],
        extraDamage: [],
      },
    ],
    ...overrides,
  };
}

export const SPECIFIC_WEAPON_TEXT =
  "**Aura** strong evocation; **CL** 12th; **Slot** none; **Price** 20,715 gp; **Weight** 4 lbs.\n\n**Description**\n\nThis is a *+1 flaming burst longsword*.";

/** Una entrada de cada `kind` (válida), indexada por `kind`. */
export function oneOfEachKind(): Record<string, Record<string, unknown>> {
  const variant = {
    variantId: "default",
    label: "default",
    casterLevel: 10,
    priceRaw: "+1 bonus",
    priceCp: null,
    bonusEquivalent: 1,
    effects: [],
    extraDamage: [],
  };
  const plainVariant = {
    ...variant,
    priceRaw: "100 gp",
    priceCp: 10000,
    bonusEquivalent: undefined,
  };
  delete (plainVariant as Record<string, unknown>)["bonusEquivalent"];
  const make = (kind: string, extra: Record<string, unknown> = {}): Record<string, unknown> =>
    magicBase({ id: `x-${kind}`, name: `X ${kind}`, kind, variants: [plainVariant], ...extra });
  const specific = (kind: string, on: string): Record<string, unknown> =>
    make(kind, {
      textEn: SPECIFIC_WEAPON_TEXT,
      baseItemId: "longsword",
      enhancement: { on, bonus: 1 },
      abilityIds: ["flaming-burst"],
      baseEvidence: "+1 flaming burst longsword",
    });
  return {
    "weapon-ability": make("weapon-ability", {
      variants: [variant],
      legalFor: {
        range: "melee",
        damageTypes: ["P", "S"],
        raw: "Only piercing or slashing melee weapons can be keen.",
      },
    }),
    "armor-ability": make("armor-ability", { variants: [variant], legalFor: { raw: "" } }),
    "shield-ability": make("shield-ability", {
      variants: [variant],
      legalFor: {
        categories: ["light", "heavy"],
        raw: "Only light and heavy shields can have this ability.",
      },
    }),
    "specific-weapon": specific("specific-weapon", "weapon"),
    "specific-armor": specific("specific-armor", "armor"),
    "specific-shield": specific("specific-shield", "shield"),
    potion: make("potion", {
      spellRefs: [{ name: "Cure light wounds", spellId: "cure-light-wounds" }],
    }),
    oil: make("oil", { spellRefs: [] }),
    wand: make("wand", {
      spellRefs: [{ name: "Magic missile", spellId: "magic-missile", spellLevel: 1 }],
    }),
    staff: make("staff", { spellRefs: [{ name: "Planar thing", spellId: null }] }),
    ring: make("ring"),
    rod: make("rod"),
    wondrous: make("wondrous"),
    cursed: make("cursed"),
    intelligent: make("intelligent"),
    artifact: make("artifact"),
    general: make("general", { enhancementPrices: [{ bonus: 1, priceCp: 100000 }] }),
  };
}

export type { MagicItem };
