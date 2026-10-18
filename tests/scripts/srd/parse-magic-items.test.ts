import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MagicItemSchema } from "../../../src/data/schema/magic-item";
import type { ParserPage } from "../../../scripts/srd/lib/parser-contract";
import { SectionError } from "../../../scripts/srd/lib/sections";
import {
  ARMOR_INDEXES,
  CRB_SOURCE_URL,
  RULES_PAGE_URL,
  WEAPON_INDEXES,
  displayUrl,
  type Family,
} from "../../../scripts/srd/parsers/magic-items/catalog";
import {
  extractEffects,
  extractExtraDamage,
  findEffectGaps,
} from "../../../scripts/srd/parsers/magic-items/effects";
import { itemMarkdown, readItems } from "../../../scripts/srd/parsers/magic-items/header";
import {
  catalogOf,
  discover,
  kindsOfSubset,
  loadMagicSections,
  normalizeSpellName,
  parse,
} from "../../../scripts/srd/parsers/magic-items/index";
import { armorLegalFor, weaponLegalFor } from "../../../scripts/srd/parsers/magic-items/legal-for";
import { enhancementPrices } from "../../../scripts/srd/parsers/magic-items/rules";
import { resolveSpecific } from "../../../scripts/srd/parsers/magic-items/specific";
import {
  casterLevels,
  parsePriceVariants,
  parseWeightLb,
} from "../../../scripts/srd/parsers/magic-items/variants";
import { ROOT } from "../../project/helpers";

const ALLOWED = ["Description", "Construction", "Resonance", "Destruction"];
const FIXTURES = resolve(ROOT, "tests", "fixtures", "srd-html", "magic-items");
const fixture = (name: string): string => readFileSync(resolve(FIXTURES, `${name}.html`), "utf8");
const page = (url: string, html: string): ParserPage => ({ url, html, sha256: "0".repeat(64) });

function load(name: string) {
  const { $, items } = readItems(page(`https://aonprd.com/${name}`, fixture(name)), ALLOWED);
  return { $, items, item: items[0]!, markdown: items.map((i) => itemMarkdown($, i)) };
}

describe("cabecera y texto de la página (R65, R86)", () => {
  it("R65/R86: Keen conserva descripción, requisitos y coste; Source múltiple", () => {
    const { item, markdown } = load("keen");
    expect(item.title).toBe("Keen");
    expect(item.labels).toEqual(["Ultimate Equipment pg. 144", "PRPG Core Rulebook pg. 469"]);
    expect(item.crbLabel).toBe("PRPG Core Rulebook pg. 469");
    expect(item.sourceLine).toBe("Ultimate Equipment pg. 144, PRPG Core Rulebook pg. 469");
    expect(item.aura).toBe("moderate transmutation");
    expect(item.cl).toBe("10th");
    expect(item.slot).toBe("weapon quality");
    expect(item.price).toBe("+1 bonus");
    const text = markdown[0]!;
    expect(text).toContain("This ability doubles the threat range of a weapon.");
    expect(text).toContain("**Requirements** Craft Magic Arms and Armor, *keen edge*");
    expect(text).toContain("**Price** —");
    expect(text).not.toMatch(/<[a-z]/i);
  });

  it("R65: Cloak of Resistance conserva las filas de variantes (Price) y el coste por variante", () => {
    const text = load("cloak-of-resistance").markdown[0]!;
    expect(text).toContain("1,000 gp ( +1)");
    expect(text).toContain("25,000 gp ( +5)");
    expect(text).toContain(
      "500 gp (+1), 2,000 gp (+2), 4,500 gp (+3), 8,000 gp (+4), 12,500 gp (+5)",
    );
  });

  it("el nombre del libro puede llevar comas (Andoran, Spirit of Liberty)", () => {
    const html = fixture("keen").replace(
      "PRPG Core Rulebook pg. 469</i></a>",
      "PRPG Core Rulebook pg. 469</i></a>, <i>Andoran, Spirit of Liberty pg. 26</i>",
    );
    const { items } = readItems(page("https://aonprd.com/x", html), ALLOWED);
    expect(items[0]!.labels).toEqual([
      "Ultimate Equipment pg. 144",
      "PRPG Core Rulebook pg. 469",
      "Andoran, Spirit of Liberty pg. 26",
    ]);
  });

  it("R87: una página sin etiqueta PRPG Core Rulebook no tiene crbLabel", () => {
    expect(load("bag-of-tricks-gray").item.crbLabel).toBeUndefined();
  });

  it("las piedras ioun traen tres secciones y solo la Normal es del CRB", () => {
    const { items } = load("ioun-stone-clear-spindle");
    expect(items).toHaveLength(3);
    expect(items.filter((i) => i.crbLabel !== undefined).map((i) => i.title)).toEqual([
      "Clear Spindle (Normal) Ioun Stone",
    ]);
  });

  it("la sección Resonance (Ultimate Equipment) se lee pero se omite del Markdown (corrección B)", () => {
    const { items, markdown, $ } = load("ioun-stone-clear-spindle");
    const normal = items[0]!;
    expect(normal.sections.map((s) => s.heading)).toEqual(["Description", "Resonance"]);
    expect(markdown[0]).not.toContain("Resonance");
    expect(markdown[0]).not.toContain("protection from chaos/evil/good/law");
    expect(markdown[0]).toContain("Sustains creature without food or water.");
    expect(itemMarkdown($, normal)).toBe(markdown[0]);
  });

  it("una página sin contenido no produce objetos", () => {
    expect(load("lens-of-detection").items).toEqual([]);
  });

  it("R45: un encabezado h3 fuera de la lista permitida detiene el parseo con página y encabezado", () => {
    const html = fixture("keen").replace(
      '<h3 class="framing">Description</h3>',
      '<h3 class="framing">Special Rules</h3>',
    );
    expect(() => readItems(page("https://aonprd.com/keen", html), ALLOWED)).toThrow(SectionError);
    try {
      readItems(page("https://aonprd.com/keen", html), ALLOWED);
    } catch (error) {
      expect((error as SectionError).heading).toBe("Special Rules");
      expect((error as SectionError).page).toBe("https://aonprd.com/keen");
    }
  });

  it("R45: un campo de cabecera desconocido detiene el parseo", () => {
    const html = fixture("keen").replace("<b>Aura</b>", "<b>Mood</b>");
    expect(() => readItems(page("https://aonprd.com/keen", html), ALLOWED)).toThrow(SectionError);
  });
});

describe("precios, nivel de lanzador y peso (R68, R69)", () => {
  it("R68: un precio único en piezas de cobre; bonusEquivalent sin precio (R69)", () => {
    expect(parsePriceVariants("20,715 gp", "p")).toMatchObject([
      { variantId: "default", priceCp: 2071500 },
    ]);
    expect(parsePriceVariants("+1 bonus", "p")).toMatchObject([
      { variantId: "default", priceCp: null, bonusEquivalent: 1 },
    ]);
    expect(parsePriceVariants("+3,750 gp", "p")).toMatchObject([{ priceCp: 375000 }]);
    expect(parsePriceVariants("—", "p")).toMatchObject([{ priceCp: null }]);
  });

  it("R68: una fila por variante, sea cual sea la forma de la etiqueta", () => {
    const rings = parsePriceVariants("2,000 gp (+1), 8,000 gp (+2)", "p");
    expect(rings.map((v) => [v.variantId, v.priceCp])).toEqual([
      ["plus-1", 200000],
      ["plus-2", 800000],
    ]);
    expect(
      parsePriceVariants("1,000 gp ( +1), 4,000 gp ( +2)", "p").map((v) => v.variantId),
    ).toEqual(["plus-1", "plus-2"]);
    expect(
      parsePriceVariants("0 wishes (22,060 gp), 1 wish (62,360 gp)", "p").map((v) => [
        v.variantId,
        v.priceCp,
      ]),
    ).toEqual([
      ["0-wishes", 2206000],
      ["1-wish", 6236000],
    ]);
    expect(parsePriceVariants("light (+1 bonus), moderate (+3 bonus)", "p")).toMatchObject([
      { variantId: "light", priceCp: null, bonusEquivalent: 1 },
      { variantId: "moderate", bonusEquivalent: 3 },
    ]);
    expect(parsePriceVariants("13 (+2 bonus), 15 (+3 bonus)", "p").map((v) => v.variantId)).toEqual(
      ["13", "15"],
    );
  });

  it("una forma de precio desconocida detiene el parseo", () => {
    expect(() => parsePriceVariants("lots of money", "p")).toThrow(/precio no reconocido/);
  });

  it("nivel de lanzador único, por etiqueta o «varies»", () => {
    expect(casterLevels("12th").forLabel("default", true)).toBe(12);
    const byLabel = casterLevels("7th (lesser), 11th (normal)");
    expect(byLabel.forLabel("lesser", false)).toBe(7);
    expect(byLabel.forLabel("normal", false)).toBe(11);
    expect(casterLevels("varies").forLabel("x", false)).toBeNull();
  });

  it("peso: libras, fracciones y «—»", () => {
    expect(parseWeightLb("4 lbs.")).toBe(4);
    expect(parseWeightLb("1/2 lb.")).toBe(0.5);
    expect(parseWeightLb("2-1/2 lbs.")).toBe(2.5);
    expect(parseWeightLb("—")).toBeNull();
    expect(parseWeightLb("varies")).toBeUndefined();
  });
});

describe("efectos y daño adicional (R72-R78, R88)", () => {
  const effectsOf = (name: string, kind: Parameters<typeof extractEffects>[0] = "wondrous") => {
    const { item, markdown } = load(name);
    const variants = parsePriceVariants(item.price, name);
    return {
      textEn: markdown[0]!,
      perVariant: extractEffects(kind, markdown[0]!, variants).perVariant,
    };
  };

  it("R72/R73: Ring of Protection es deflection a la CA, valor = bono de la variante", () => {
    const { perVariant, textEn } = effectsOf("ring-of-protection", "ring");
    expect(perVariant.get("plus-3")).toEqual([
      expect.objectContaining({
        target: "ac",
        bonusType: "deflection",
        value: 3,
        appliesTo: "wearer",
        conditional: false,
      }),
    ]);
    for (const effects of perVariant.values()) {
      for (const e of effects) expect(textEn).toContain(e.evidence); // R75
    }
  });

  it("R72: Cloak of Resistance es resistance a todas las salvaciones", () => {
    const { perVariant } = effectsOf("cloak-of-resistance");
    expect(perVariant.get("plus-5")).toEqual([
      expect.objectContaining({ target: "save.all", bonusType: "resistance", value: 5 }),
    ]);
  });

  it("R72: Belt of Giant Strength es enhancement a Fuerza (+2, +4, +6)", () => {
    const { perVariant } = effectsOf("belt-of-giant-strength");
    expect(
      [...perVariant].map(([id, e]) => [id, e[0]?.target, e[0]?.bonusType, e[0]?.value]),
    ).toEqual([
      ["plus-2", "ability.str", "enhancement", 2],
      ["plus-4", "ability.str", "enhancement", 4],
      ["plus-6", "ability.str", "enhancement", 6],
    ]);
  });

  it("R77: Amulet of Natural Armor es enhancement a la CA plegado en naturalArmor", () => {
    const { perVariant } = effectsOf("amulet-of-natural-armor");
    expect(perVariant.get("plus-2")).toEqual([
      expect.objectContaining({
        target: "ac",
        bonusType: "enhancement",
        value: 2,
        foldInto: "naturalArmor",
      }),
    ]);
  });

  it("R72: Bracers of Armor es armor a la CA (+1 a +8)", () => {
    const { perVariant } = effectsOf("bracers-of-armor");
    expect(perVariant.size).toBe(8);
    expect(perVariant.get("plus-8")).toEqual([
      expect.objectContaining({ target: "ac", bonusType: "armor", value: 8 }),
    ]);
  });

  it("R76: un efecto con condición lleva conditional y la frase como conditionText", () => {
    const text =
      "**Aura** x; **CL** 5th; **Slot** none\n\n**Description**\n\nThe wearer gains a +2 luck bonus on all Fortitude saves against poison from spiders.";
    const effects = extractEffects("wondrous", text, [
      { variantId: "default", label: "default" },
    ]).perVariant.get("default")!;
    expect(effects).toEqual([
      expect.objectContaining({
        target: "save.fortitude",
        bonusType: "luck",
        value: 2,
        conditional: true,
        conditionText:
          "The wearer gains a +2 luck bonus on all Fortitude saves against poison from spiders.",
      }),
    ]);
  });

  it("un efecto cuyo beneficiario no es el portador no se asigna (queda como hueco)", () => {
    const text =
      "**Aura** x\n\n**Description**\n\nFriendly troops within 360 feet gain a +2 resistance bonus on saving throws against fear.";
    const result = extractEffects("wondrous", text, [{ variantId: "default", label: "default" }]);
    expect(result.perVariant.get("default")).toEqual([]);
  });

  it("una lista de objetivos que no se sabe resolver no produce un efecto parcial", () => {
    const text =
      "**Aura** x\n\n**Description**\n\nThis stone grants a +1 luck bonus on saving throws, ability checks, and skill checks.";
    const result = extractEffects("wondrous", text, [{ variantId: "default", label: "default" }]);
    expect(result.perVariant.get("default")).toEqual([]);
  });

  it("R78: Flaming declara 1d6 fire always con su evidencia literal", () => {
    const text = load("flaming").markdown[0]!;
    expect(extractExtraDamage(text)).toEqual([
      {
        dice: "1d6",
        damageType: "fire",
        trigger: "always",
        evidence: "an extra 1d6 points of fire damage on a successful hit",
      },
    ]);
    expect(text).toContain("an extra 1d6 points of fire damage on a successful hit");
  });

  it("R78: crítico y condición", () => {
    const crit =
      "**Aura** x\n\n**Description**\n\nIt deals an extra 1d10 points of fire damage on a successful critical hit.";
    expect(extractExtraDamage(crit)[0]).toMatchObject({ dice: "1d10", trigger: "onCritical" });
    const cond =
      "**Aura** x\n\n**Description**\n\nIt deals an extra 2d6 points of cold damage against evil creatures.";
    expect(extractExtraDamage(cond)[0]).toMatchObject({ trigger: "conditional" });
  });

  it("R88: findEffectGaps lista las entradas con bonificador tipado y sin efectos", () => {
    const text =
      "**Aura** x\n\n**Description**\n\nGrants a +2 competence bonus on Charisma-based checks.";
    const gaps = findEffectGaps([
      { id: "gap", kind: "wondrous", textEn: text, variants: [{ effects: [] }] },
      { id: "covered", kind: "wondrous", textEn: text, variants: [{ effects: [{}] }] },
      {
        id: "plain",
        kind: "wondrous",
        textEn: "**Aura** x\n\n**Description**\n\nNothing.",
        variants: [{ effects: [] }],
      },
      { id: "general", kind: "general", textEn: text, variants: [{ effects: [] }] },
    ]);
    expect(gaps).toEqual(["gap"]);
  });
});

describe("restricción de uso (R81)", () => {
  it("R81: Keen = cuerpo a cuerpo, perforante o cortante, frase literal", () => {
    const text = load("keen").markdown[0]!;
    const description = text.slice(text.indexOf("**Description**"));
    const { legalFor, reviewReason } = weaponLegalFor(description.replace(/\*/g, ""), "melee");
    expect(legalFor).toEqual({
      range: "melee",
      damageTypes: ["P", "S"],
      raw: "Only piercing or slashing melee weapons can be keen.",
    });
    expect(reviewReason).toBeUndefined();
  });

  it("R81: Seeking = a distancia", () => {
    expect(
      weaponLegalFor("This special ability can only be placed on ranged weapons.", "ranged")
        .legalFor,
    ).toEqual({
      range: "ranged",
      raw: "This special ability can only be placed on ranged weapons.",
    });
  });

  it("R81: sin frase de restricción, el alcance sale del índice y raw queda vacío", () => {
    expect(
      weaponLegalFor("Upon command, a flaming weapon is sheathed in fire.", "any").legalFor,
    ).toEqual({
      range: "any",
      raw: "",
    });
  });

  it("R81: una restricción que no se sabe estructurar marca revisión y no se inventa", () => {
    const result = armorLegalFor("This special ability cannot be added to a tower shield.");
    expect(result.legalFor).toEqual({
      raw: "This special ability cannot be added to a tower shield.",
    });
    expect(result.reviewReason).toMatch(/sin estructurar/);
    const weapon = weaponLegalFor(
      "This special ability can only be placed on melee weapons and ammunition.",
      "any",
    );
    expect(weapon.reviewReason).toMatch(/sin estructurar/);
    expect(weapon.legalFor.range).toBe("any");
  });

  it("R81: una frase que contradice el índice de AoN marca revisión", () => {
    const result = weaponLegalFor(
      "This special ability can only be placed on ranged weapons.",
      "melee",
    );
    expect(result.reviewReason).toMatch(/índices de AoN/);
  });

  it("R81: categorías de armadura y escudo", () => {
    expect(armorLegalFor("Only light and heavy shields can have this ability.").legalFor).toEqual({
      categories: ["light", "heavy"],
      raw: "Only light and heavy shields can have this ability.",
    });
  });
});

describe("objetos específicos (R70)", () => {
  const names = { weapons: ["Longsword", "Arrows (20)"], armor: ["Full plate", "Heavy steel"] };
  const abilities = {
    byName: new Map([
      ["flaming burst", "flaming-burst"],
      ["wounding", "wounding"],
    ]),
  };

  it("R70: Flame Tongue = longsword +1 con flaming burst, evidencia literal", () => {
    const text =
      "**Aura** x\n\n**Description**\n\nThis is a *+1 flaming burst longsword*. Once per day...";
    const result = resolveSpecific("specific-weapon", text, names, abilities, false);
    expect(result).toMatchObject({
      baseItemId: "longsword",
      enhancement: { on: "weapon", bonus: 1 },
      abilityIds: ["flaming-burst"],
      baseEvidence: "+1 flaming burst longsword",
    });
    expect(text).toContain(result.baseEvidence);
    expect(result.reviewReasons).toEqual([]);
  });

  it("R70: escudos y munición usan los ids del equipo (heavy-steel-shield, arrows-20)", () => {
    const shield = resolveSpecific(
      "specific-shield",
      "**Aura** x\n\n**Description**\n\nThis +2 heavy steel shield is fashioned...",
      names,
      abilities,
      false,
    );
    expect(shield).toMatchObject({
      baseItemId: "heavy-steel-shield",
      enhancement: { on: "shield", bonus: 2 },
    });
    const arrow = resolveSpecific(
      "specific-weapon",
      "**Aura** x\n\n**Description**\n\nThis +1 arrow is painted white.",
      names,
      abilities,
      false,
    );
    expect(arrow.baseItemId).toBe("arrows-20");
  });

  it("R70: varias menciones distintas de mejora no declaran ninguna", () => {
    const result = resolveSpecific(
      "specific-weapon",
      "**Aura** x\n\n**Description**\n\nThis +2 longsword becomes a +5 longsword in the hands of a paladin.",
      names,
      abilities,
      false,
    );
    expect(result.enhancement).toBeUndefined();
    expect(result.reviewReasons.join(" ")).toMatch(/varias menciones/);
  });

  it("R70: sin patrón no se inventa el objeto base", () => {
    const result = resolveSpecific(
      "specific-weapon",
      "**Aura** x\n\n**Description**\n\nA strange device of unknown make.",
      names,
      abilities,
      false,
    );
    expect(result.baseItemId).toBeNull();
    expect(result.baseItemRaw).toBe("A strange device of unknown make.");
    expect(result.enhancement).toBeUndefined();
    expect(result.reviewReasons.length).toBeGreaterThan(0);
  });
});

describe("tablas de precios de mejora (R71)", () => {
  it("R71: precios +1..+5 de armadura (igual que escudo) y de arma", () => {
    const armor = [
      [
        ["Minor", "Medium", "Major", "Item", "Base Price"],
        ["01-60", "01-05", "—", "+1 shield", "1,000 gp"],
        ["61-80", "06-10", "—", "+1 armor", "1,000 gp"],
        ["81-85", "11-20", "—", "+2 shield", "4,000 gp"],
        ["86-87", "21-30", "—", "+2 armor", "4,000 gp"],
        ["—", "31-40", "01-08", "+3 shield", "9,000 gp"],
        ["—", "41-50", "09-16", "+3 armor", "9,000 gp"],
        ["—", "51-55", "17-27", "+4 shield", "16,000 gp"],
        ["—", "56-57", "28-38", "+4 armor", "16,000 gp"],
        ["—", "—", "39-49", "+5 shield", "25,000 gp"],
        ["—", "—", "50-57", "+5 armor", "25,000 gp"],
        ["—", "—", "—", "+6 armor/shield1", "36,000 gp"],
      ],
    ];
    expect(enhancementPrices("Magic Armor", armor)).toEqual([
      { bonus: 1, priceCp: 100000 },
      { bonus: 2, priceCp: 400000 },
      { bonus: 3, priceCp: 900000 },
      { bonus: 4, priceCp: 1600000 },
      { bonus: 5, priceCp: 2500000 },
    ]);
    const weapons = [
      [
        ["Minor", "Medium", "Major", "Weapon Bonus", "Base Price"],
        ...[2000, 8000, 18000, 32000, 50000].map((gp, i) => [
          "—",
          "—",
          "—",
          `+${i + 1}`,
          `${gp.toLocaleString("en-US")} gp`,
        ]),
        ["—", "—", "—", "+62", "72,000 gp"],
      ],
    ];
    expect(enhancementPrices("Magic Weapons", weapons)![4]).toEqual({ bonus: 5, priceCp: 5000000 });
    expect(enhancementPrices("Potions", weapons)).toBeUndefined();
  });

  it("R71: si armadura y escudo difieren, o faltan precios, falla", () => {
    const broken = [
      [
        ["x", "x", "x", "+1 armor", "1,000 gp"],
        ["x", "x", "x", "+1 shield", "2,000 gp"],
      ],
    ];
    expect(() => enhancementPrices("Magic Armor", broken)).toThrow(/5 precios/);
  });
});

// --- universo sintético: tablas de la página de fuente + índices + página de reglas ------------------

const TABLES: Record<string, { family: Family; rows: [string, string, string][] }> = {
  "Magic Items (Armor)": {
    family: "armor",
    rows: [["Ghost Touch", "Ghost Touch", "ghost-touch-armor"]],
  },
  "Magic Items (Weapons)": {
    family: "weapons",
    rows: [
      ["Keen", "Keen", "keen"],
      ["Seeking", "Seeking", "seeking"],
      ["Flaming", "Flaming", "flaming"],
      ["Flaming Burst", "Flaming Burst", "flaming-burst"],
      ["Flame Tongue", "Flame Tongue", "flame-tongue"],
      ["Ghost Touch", "Ghost Touch", "ghost-touch-weapon"],
    ],
  },
  "Magic Items (Rings)": {
    family: "rings",
    rows: [
      ["Ring of Protection (+1)", "Ring of Protection1", "ring-of-protection"],
      ["Ring of Protection (+2)", "Ring of Protection2", "ring-of-protection"],
    ],
  },
  "Magic Items (Rods)": { family: "rods", rows: [] },
  "Magic Items (Staves)": {
    family: "staves",
    rows: [["Staff of Fire", "Staff of Fire", "staff-of-fire"]],
  },
  "Magic Items (Wondrous Items)": {
    family: "wondrous",
    rows: [
      ["Cloak of Resistance (+1)", "Cloak of Resistance1", "cloak-of-resistance"],
      ["Belt of Giant Strength (+2)", "Belt of Giant Strength2", "belt-of-giant-strength"],
      ["Amulet of Natural Armor (+1)", "Amulet of Natural Armor1", "amulet-of-natural-armor"],
      ["Bracers of Armor (+1)", "Bracers of Armor1", "bracers-of-armor"],
      ["Clear Spindle (Normal) Ioun Stone", "Ioun Stone Clear Spindle", "ioun-stone-clear-spindle"],
      ["Bag of Tricks (Gray)", "Bag of TricksGray", "bag-of-tricks-gray"],
      ["Lens of Detection", "Lens of Detection", "lens-of-detection"],
    ],
  },
  "Magic Items (Cursed Items)": { family: "cursed", rows: [] },
  "Magic Items (Artifacts)": { family: "artifacts", rows: [] },
};
// Las filas 1 y 2 del anillo apuntan a páginas idénticas (como en AoN).
const PARAM: Record<Family, "ItemName" | "FinalName"> = {
  armor: "ItemName",
  weapons: "ItemName",
  rings: "FinalName",
  rods: "FinalName",
  staves: "ItemName",
  wondrous: "FinalName",
  cursed: "ItemName",
  artifacts: "ItemName",
};
const FILE: Record<Family, string> = {
  armor: "MagicArmorDisplay.aspx",
  weapons: "MagicWeaponsDisplay.aspx",
  rings: "MagicRingsDisplay.aspx",
  rods: "MagicRodsDisplay.aspx",
  staves: "MagicStavesDisplay.aspx",
  wondrous: "MagicWondrousDisplay.aspx",
  cursed: "MagicCursedDisplay.aspx",
  artifacts: "MagicArtifactsDisplay.aspx",
};

function sourceHtml(): string {
  const sections = Object.entries(TABLES)
    .map(([heading, { family, rows }]) => {
      const links = rows
        .map(([name, key]) => `<a href="${FILE[family]}?${PARAM[family]}=${key}">${name}</a>`)
        .join(", ");
      return `<br /><h2 class="title">${heading} [${rows.length}]</a></h2>${links}`;
    })
    .join("");
  const equipment =
    '<br /><h2 class="title">Equipment (Armor) [2]</a></h2><a href="EquipmentArmorDisplay.aspx?ItemName=Full plate">Full plate</a>, <a href="EquipmentArmorDisplay.aspx?ItemName=Heavy steel">Heavy steel</a>' +
    '<br /><h2 class="title">Equipment (Weapons) [2]</a></h2><a href="EquipmentWeaponsDisplay.aspx?ItemName=Longsword">Longsword</a>, <a href="EquipmentWeaponsDisplay.aspx?ItemName=Arrows (20)">Arrows (20)</a>' +
    '<br /><h2 class="title">Spells [2]</a></h2><a href="SpellDisplay.aspx?ItemName=Scorching Ray">Scorching Ray</a>, <a href="SpellDisplay.aspx?ItemName=Fireball">Fireball</a>';
  return `<html><body><span id="MainContent_FinalOutputLabel">${sections}${equipment}</span></body></html>`;
}

function indexHtml(names: string[], file: string, query: string): string {
  const rows = names
    .map((n) => `<tr><td><a href="${file}?ItemName=${n}">${n}</a></td><td>+1 bonus</td></tr>`)
    .join("");
  return `<html><body><span id="MainContent_X"><h2>${query}</h2><table id="MainContent_GridViewMagic"><tr><th>Name</th></tr>${rows}</table></span></body></html>`;
}

function rulesHtml(): string {
  const table = (rows: string[][]): string =>
    `<table class="inner"><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  const armorRows = [["Minor", "Medium", "Major", "Item", "Base Price"]];
  for (const [i, gp] of ["1,000", "4,000", "9,000", "16,000", "25,000"].entries()) {
    armorRows.push(["—", "—", "—", `<i>+${i + 1} shield</i>`, `${gp} gp`]);
    armorRows.push(["—", "—", "—", `<i>+${i + 1} armor</i>`, `${gp} gp`]);
  }
  const weaponRows = [["Minor", "Medium", "Major", "Weapon Bonus", "Base Price"]];
  for (const [i, gp] of ["2,000", "8,000", "18,000", "32,000", "50,000"].entries()) {
    weaponRows.push(["—", "—", "—", `+${i + 1}`, `${gp} gp`]);
  }
  const source = (pg: number): string =>
    `<b>Source</b> <a href="http://paizo.com/x"><i>PRPG Core Rulebook pg. ${pg}</i></a><br>`;
  return (
    `<html><body><span id="MainContent_DetailedOutput"><u><a href="Rules.aspx?ID=65">Items</a></u><br>` +
    `<h1 class="title"><a href="Rules.aspx?ID=376">Magic Armor</a></h1>${source(461)}Magic armor bonuses never rise above +5.<br><h2>Table 15-3: Armor and Shields</h2>${table(armorRows)}` +
    `<h1 class="title"><a href="Rules.aspx?ID=377">Magic Weapons</a></h1>${source(468)}Magic weapons have bonuses from +1 to +5.<br><h2>Table 15-8: Weapons</h2>${table(weaponRows)}` +
    `<h1 class="title"><a href="Rules.aspx?ID=378">Potions</a></h1>${source(477)}A potion is a magic liquid.<br>` +
    `<h1 class="title"><a href="Rules.aspx?ID=999">Alien Section</a></h1><b>Source</b> <i>Ultimate Equipment pg. 1</i><br>Not from the CRB.` +
    `</span></body></html>`
  );
}

function universe(): ParserPage[] {
  const pages: ParserPage[] = [
    page(CRB_SOURCE_URL, sourceHtml()),
    page(RULES_PAGE_URL, rulesHtml()),
    page(
      ARMOR_INDEXES.armorQuality,
      indexHtml(["Ghost Touch"], "MagicArmorDisplay.aspx", "Armor Qualities"),
    ),
    page(
      ARMOR_INDEXES.shieldQuality,
      indexHtml(["Ghost Touch"], "MagicArmorDisplay.aspx", "Shield Qualities"),
    ),
    page(ARMOR_INDEXES.specificArmor, indexHtml([], "MagicArmorDisplay.aspx", "Unique Armor")),
    page(ARMOR_INDEXES.specificShield, indexHtml([], "MagicArmorDisplay.aspx", "Unique Shields")),
    page(
      WEAPON_INDEXES.meleeQuality,
      indexHtml(
        ["Keen", "Flaming", "Flaming Burst", "Ghost Touch"],
        "MagicWeaponsDisplay.aspx",
        "Melee",
      ),
    ),
    page(
      WEAPON_INDEXES.rangedQuality,
      indexHtml(
        ["Seeking", "Flaming", "Flaming Burst", "Ghost Touch"],
        "MagicWeaponsDisplay.aspx",
        "Ranged",
      ),
    ),
    page(
      WEAPON_INDEXES.specificWeapon,
      indexHtml(["Flame Tongue"], "MagicWeaponsDisplay.aspx", "Specific"),
    ),
  ];
  for (const { family, rows } of Object.values(TABLES)) {
    for (const [, key, fixtureName] of rows) {
      pages.push(page(displayUrl(family, PARAM[family], key), fixture(fixtureName)));
    }
  }
  return pages;
}

const ALIASES = {
  "magic-items": {
    "armor-ability.ghost-touch": "ghost-touch-armor",
    "shield-ability.ghost-touch": "ghost-touch-shield",
    "weapon-ability.ghost-touch": "ghost-touch-weapon",
  },
};
const config = { allowedSections: ALLOWED, slugAliases: ALIASES };
const run = (subset?: string, pages = universe()) =>
  parse({ category: "magic-items", subset, pages, config });

describe("parse sobre un universo sintético con páginas reales", () => {
  const out = run();
  const byId = new Map(out.entries.map((e) => [e.id, e]));
  const get = (id: string): Record<string, unknown> => {
    const entry = byId.get(id);
    if (!entry) throw new Error(`falta ${id}`);
    return entry;
  };

  it("todas las entradas pasan el schema real (R64)", () => {
    for (const entry of out.entries) {
      const result = MagicItemSchema.safeParse(entry);
      expect(result.success, `${entry.id}: ${JSON.stringify(result.error?.issues)}`).toBe(true);
    }
  });

  it("una entrada por título de página, no por fila (las filas de variantes comparten página)", () => {
    expect(out.entries.filter((e) => e["kind"] === "ring")).toHaveLength(1);
    expect(get("ring-of-protection")["variants"]).toHaveLength(5);
  });

  it("R63/R86/R7: Keen tiene sourceRef CRB, sourceRefAll y reprintedIn, sin needsReview por ello", () => {
    const keen = get("keen");
    expect(keen).toMatchObject({
      kind: "weapon-ability",
      sourceRef: "PRPG Core Rulebook pg. 469",
      sourceRefAll: "Ultimate Equipment pg. 144, PRPG Core Rulebook pg. 469",
      reprintedIn: ["Ultimate Equipment pg. 144"],
      book: "CRB",
    });
    expect(out.needsReview.map((n) => n.id)).not.toContain("keen");
  });

  it("R81: Keen cuerpo a cuerpo y Seeking a distancia; Flaming cualquiera (índices de AoN)", () => {
    expect(get("keen")["legalFor"]).toMatchObject({ range: "melee", damageTypes: ["P", "S"] });
    expect(get("seeking")["legalFor"]).toMatchObject({ range: "ranged" });
    expect(get("flaming")["legalFor"]).toMatchObject({ range: "any" });
  });

  it("R4/R5: los ids que colisionan entre kinds usan los alias declarados", () => {
    expect(
      ["ghost-touch-armor", "ghost-touch-shield", "ghost-touch-weapon"].every((id) => byId.has(id)),
    ).toBe(true);
    expect(get("ghost-touch-armor")["kind"]).toBe("armor-ability");
    expect(get("ghost-touch-shield")["kind"]).toBe("shield-ability");
  });

  it("una colisión de ids sin alias detiene el parseo con la lista de alias a declarar", () => {
    expect(() =>
      parse({
        category: "magic-items",
        subset: undefined,
        pages: universe(),
        config: { ...config, slugAliases: {} },
      }),
    ).toThrow(/colisión de ids[\s\S]*"weapon-ability.ghost-touch"/);
  });

  it("R70: Flame Tongue", () => {
    expect(get("flame-tongue")).toMatchObject({
      kind: "specific-weapon",
      baseItemId: "longsword",
      enhancement: { on: "weapon", bonus: 1 },
      abilityIds: ["flaming-burst"],
    });
  });

  it("R78: Flaming declara su daño adicional", () => {
    const variants = get("flaming")["variants"] as { extraDamage: unknown[] }[];
    expect(variants[0]!.extraDamage).toEqual([
      expect.objectContaining({ dice: "1d6", damageType: "fire", trigger: "always" }),
    ]);
  });

  it("R71: las secciones general de armadura y arma traen enhancementPrices; las demás no", () => {
    expect(get("magic-armor")["enhancementPrices"]).toHaveLength(5);
    expect((get("magic-weapons")["enhancementPrices"] as { priceCp: number }[])[0]!.priceCp).toBe(
      200000,
    );
    expect(get("potions")).not.toHaveProperty("enhancementPrices");
    expect(
      out.entries
        .filter((e) => e["kind"] === "general")
        .map((e) => e.id)
        .sort(),
    ).toEqual(["magic-armor", "magic-weapons", "potions"]);
  });

  it("R85: el bastón enlaza los conjuros del CRB", () => {
    expect(get("staff-of-fire")["spellRefs"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: expect.stringMatching(/fireball/i), spellId: "fireball" }),
      ]),
    );
  });

  it("R87: las páginas/secciones sin etiqueta CRB se excluyen y se listan", () => {
    const reasons = out.excluded.map((e) => `${e.url}|${e.book}|${e.reason}`).join("\n");
    expect(reasons).toMatch(/Bag%20of%20TricksGray[\s\S]*Aquatic Adventures/);
    expect(reasons).toMatch(/Clear Spindle \(Flawed\) Ioun Stone/);
    expect(reasons).toMatch(/Clear Spindle \(Cracked\) Ioun Stone/);
    expect(reasons).toMatch(/Alien Section/);
    expect(byId.has("clear-spindle-normal-ioun-stone")).toBe(true);
    expect(byId.has("clear-spindle-flawed-ioun-stone")).toBe(false);
    expect(byId.has("bag-of-tricks")).toBe(false);
  });

  it("los huecos declarados de la fuente no producen entrada y se informan", () => {
    expect(out.notes?.join("\n")).toMatch(/Lens of Detection/);
    expect(out.counters?.["huecos de la fuente declarados"]).toBe(2);
  });

  it("R88: el informe lista los huecos de efectos y cuenta los efectos", () => {
    expect(out.counters).toHaveProperty("entradas con bonificador tipado sin efecto (R88)");
    expect(out.counters?.["efectos estructurados"]).toBeGreaterThan(10);
  });

  it("R86: cuenta las entradas con reprintedIn", () => {
    expect(out.counters?.["entradas con reprintedIn"]).toBeGreaterThan(5);
  });

  it("Ioun Stone: la sección Resonance (Ultimate Equipment) no entra en textEn y se cuenta (corrección B)", () => {
    const stone = get("clear-spindle-normal-ioun-stone");
    expect(String(stone["textEn"])).not.toMatch(/Resonance|dull gray/);
    expect(String(stone["textEn"])).toContain("Sustains creature without food or water.");
    expect(String(stone["textEn"])).toContain("**Construction**");
    expect(out.needsReview.find((n) => n.id === "clear-spindle-normal-ioun-stone")).toBeUndefined();
    expect(out.counters?.["secciones de otro libro omitidas del texto (Resonance)"]).toBe(1);
  });

  it("R63: cada entrada va a magic-items/<kind>.json y importedKinds lista los kinds producidos", () => {
    expect(out.shardOf!(get("keen") as never)).toBe("magic-items/weapon-ability.json");
    expect(out.provenancePatch?.importedKinds).toEqual(
      [...new Set(out.entries.map((e) => e["kind"] as string))].sort(),
    );
  });

  it("R44: salida determinista, independiente del orden de las páginas", () => {
    const shuffled = [...universe()].reverse();
    expect(run(undefined, shuffled).entries).toEqual(out.entries);
    expect(JSON.stringify(run().entries)).toBe(JSON.stringify(out.entries));
  });

  it("--category magic-items:<subconjunto> solo produce esos kinds", () => {
    const rings = run("ring");
    expect([...new Set(rings.entries.map((e) => e["kind"]))]).toEqual(["ring"]);
    const armor = run("armor");
    expect([...new Set(armor.entries.map((e) => e["kind"]))].sort()).toEqual([
      "armor-ability",
      "shield-ability",
    ]);
    expect(kindsOfSubset("weapons")).toContain("specific-weapon");
    expect(() => kindsOfSubset("bananas")).toThrow(/subconjunto desconocido/);
  });
});

describe("catálogo y discover (R66, R67)", () => {
  it("discover congela el recuento por kind (entradas, no filas)", () => {
    const seed = universe();
    const out = discover({
      category: "magic-items",
      subset: undefined,
      seedPages: seed,
      config,
    });
    expect(out.expectations?.expectedCountByKind).toEqual({
      "armor-ability": 1,
      "shield-ability": 1,
      "specific-weapon": 1,
      "weapon-ability": 5,
      general: 3,
      ring: 1,
      staff: 1,
      wondrous: 5,
    });
    expect(out.urls).toHaveLength(Object.values(TABLES).reduce((n, t) => n + t.rows.length, 0));
  });

  it("falla cerrado si el recuento declarado de una tabla no coincide con sus enlaces", () => {
    const pages = universe().map((p) =>
      p.url === CRB_SOURCE_URL ? { ...p, html: p.html.replace("Rings) [2]", "Rings) [3]") } : p,
    );
    expect(() => catalogOf(pages, ALLOWED, loadMagicSections())).toThrow(/declara 3 pero lista 2/);
  });

  it("falla cerrado si la ranura contradice los índices de AoN (doble lectura de kind)", () => {
    const pages = universe().map((p) =>
      p.url === WEAPON_INDEXES.specificWeapon
        ? { ...p, html: indexHtml([], "MagicWeaponsDisplay.aspx", "Specific") }
        : p,
    );
    expect(() => catalogOf(pages, ALLOWED, loadMagicSections())).toThrow(/SpecificWeapon/);
  });

  it("falla cerrado si una fila sin contenido no está declarada como hueco conocido", () => {
    const sections = loadMagicSections();
    expect(() => catalogOf(universe(), ALLOWED, { ...sections, knownGaps: [] })).toThrow(
      /knownGaps/,
    );
  });

  it("falla si las páginas de variantes de un mismo título tienen contenido distinto", () => {
    const pages = universe().map((p) =>
      p.url === displayUrl("rings", "FinalName", "Ring of Protection2")
        ? { ...p, html: p.html.replace("2,000 gp (+1)", "2,001 gp (+1)") }
        : p,
    );
    expect(() => catalogOf(pages, ALLOWED, loadMagicSections())).toThrow(/contenido distinto/);
  });

  it("falta una página de la procedencia -> error", () => {
    const pages = universe().filter((p) => !p.url.includes("Keen"));
    expect(() => catalogOf(pages, ALLOWED, loadMagicSections())).toThrow(/falta en la procedencia/);
  });

  it("normaliza nombres de conjuro (numerales romanos y apóstrofos)", () => {
    expect(normalizeSpellName("Summon monster VI")).toBe("summon monster 6");
    expect(normalizeSpellName("Summon nature’s ally IV")).toBe("summon nature's ally 4");
  });
});
