import { describe, expect, it } from "vitest";
import { loadDataset } from "../../scripts/srd/lib/load-dataset";
import { MagicItemSchema, type MagicItem } from "../../src/data/schema/magic-item";
import { ROOT } from "../project/helpers";
import prd from "./fixtures/prd-magic-items.json";

// Contraste de los objetos mágicos con una fuente INDEPENDIENTE de Archives of Nethys: la cabecera
// (Aura, CL, Slot, Price, Weight) y la construcción de cada ficha del PRD oficial de Paizo
// (https://paizo.com/pathfinderRPG/prd/coreRulebook/magicItems/), copiadas en
// `fixtures/prd-magic-items.json`. AoN reimprime las fichas con la edición de Ultimate Equipment
// (variantes de otros libros, ranuras, pesos y auras distintos): corrección B de f3-srd-data.

const { data } = loadDataset(ROOT, ["magic-items"]);
const items = (data.entries["magic-items"] ?? []).map((e) => MagicItemSchema.parse(e));
const byId = new Map<string, MagicItem>(items.map((i) => [i.id, i]));

/** Fichas del PRD que no tienen entrada propia (documentado en progress/impl_f3-srd-data_fixB.md). */
const NO_ENTRY: Record<string, string> = {
  "bag-of-tricks":
    "hueco de la fuente (magic-sections.json knownGaps): AoN solo trae la versión de Aquatic Adventures",
  "lens-of-detection":
    "hueco de la fuente (magic-sections.json knownGaps): la página enlazada no tiene contenido",
  "ioun-stones":
    "AoN la reparte en 16 fichas «<color> (Normal) Ioun Stone»; ver el test de las piedras ioun",
  "metamagic-rods":
    "AoN la reparte en rod-of-metamagic-<talento> (6 entradas con lesser/normal/greater)",
};

const norm = (s: string): string =>
  s.toLowerCase().replace(/[–—−]/g, "-").replace(/[’]/g, "'").replace(/\s+/g, " ").trim();

const numbers = (s: string | null): string[] =>
  (s ?? "")
    .match(/\d[\d,]*/g)
    ?.map((n) => n.replace(/,/g, ""))
    .sort() ?? [];

/** Libras de un peso del texto: «2-1/2 lbs.», «1/2 lb.», «2.5 lbs.», «12 lbs. (for four)». */
function poundsOf(text: string): number | null {
  const m = /(\d+)-(\d+)\/(\d+)|(\d+)\/(\d+)|(\d+(?:\.\d+)?)/.exec(text);
  if (!m) return null;
  if (m[1] !== undefined) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  if (m[4] !== undefined) return Number(m[4]) / Number(m[5]);
  return Number(m[6]);
}

const slotOf = (s: string): string =>
  norm(s)
    .replace(/\(does not take up slot\)/, "")
    .replace(/^wrists$/, "wrist")
    .replace(/^—$|^-$/, "none")
    .trim();

function headerOf(entry: MagicItem): {
  aura: string;
  slot: string;
  weight: string;
  price: string;
} {
  const get = (re: RegExp): string => (re.exec(entry.textEn)?.[1] ?? "").trim();
  return {
    aura: get(/\*\*Aura\*\*\s+(.*?)\s*;\s*\*\*CL/),
    slot: get(/\*\*Slot\*\*\s+(.*?)\s*;/),
    weight: get(/\*\*Weight\*\*\s+(.*?)(?:\n|$)/),
    price: get(/\*\*Price\*\*\s+(.*?)\s*;\s*\*\*Weight/),
  };
}

/** Excepciones por id: PRD y datos difieren de forma conocida y justificada. */
const EXCEPTIONS: Record<string, { fields: string[]; why: string }> = {
  "staff-of-illumination": {
    fields: ["cost"],
    why: "el PRD da coste 20.750 gp con precio 51.500 gp (la regla general daría 25.750 gp, que es lo que da AoN); el PRD es internamente incoherente: decisión del humano pendiente, no se toca",
  },
  "bag-of-holding": {
    fields: ["weight"],
    why: "el PRD dice «see below» y AoN «15+ lbs.» (tabla por tipo en el texto)",
  },
  "carpet-of-flying": {
    fields: ["price", "weight"],
    why: "el PRD dice «varies» y detalla tamaños y precios en el texto; AoN los pone en variantes",
  },
  "crystal-ball": {
    fields: ["price"],
    why: "el PRD dice «varies» y detalla las variantes en el texto; AoN las pone en variantes",
  },
  "strand-of-prayer-beads": {
    fields: ["aura", "price"],
    why: "el PRD detalla aura/CL por cuenta; AoN «varies» y precios por variante (lesser/standard/greater)",
  },
  "ring-of-wizardry": {
    fields: ["aura", "price", "cost"],
    why: "tipos I-IV: AoN los llama «type I-IV» en las etiquetas (los números coinciden)",
  },
  "necklace-of-fireballs": {
    fields: ["price", "cost"],
    why: "AoN escribe «Type I» donde el PRD «type I»; las cifras coinciden",
  },
};

describe("objetos mágicos frente a las cabeceras del PRD (corrección B)", () => {
  // Las seis varas metamágicas son una sola ficha en el PRD («Metamagic, Empower»...) y una entrada
  // `rod-of-metamagic-<talento>` en los datos.
  const fixture = prd.items.map((f) => ({
    ...f,
    id: /^metamagic-(?!rods)/.test(f.id) ? `rod-of-${f.id}` : f.id,
  }));

  it("el fixture del PRD cubre 348 fichas y cada una tiene entrada, o está documentada como sin entrada", () => {
    expect(fixture.length).toBe(348);
    const missing = fixture.filter((f) => !byId.has(f.id) && !(f.id in NO_ENTRY)).map((f) => f.id);
    expect(missing).toEqual([]);
  });

  const compared = fixture.filter((f) => byId.has(f.id));

  it("aura, ranura, peso y precio de cada ficha coinciden con el PRD (salvo las excepciones documentadas)", () => {
    const problems: string[] = [];
    for (const f of compared) {
      const entry = byId.get(f.id)!;
      const skip = EXCEPTIONS[f.id]?.fields ?? [];
      const h = headerOf(entry);
      if (f.aura && !skip.includes("aura")) {
        const prdAura = norm(
          f.aura.replace(/\s*\[[a-z]+\]/g, "").replace(/\s*\(if miracle is used\)/, ""),
        );
        const dataAura = norm(h.aura.replace(/\s*\(if miracle is used\)/, ""));
        // «varies»/«varied» (AoN) frente a la lista del PRD, y «no aura (nonmagical)»: formato.
        const loose =
          /(^|\s)(varies|varied)$/.test(dataAura) ||
          /varied|varies/.test(prdAura) ||
          /^no aura/.test(prdAura) ||
          /^no aura/.test(dataAura) ||
          dataAura === "";
        if (
          !loose &&
          prdAura !== dataAura &&
          !prdAura.includes(dataAura) &&
          !dataAura.includes(prdAura)
        ) {
          problems.push(`${f.id} aura: datos «${h.aura}» / PRD «${f.aura}»`);
        }
      }
      if (f.slot && !skip.includes("slot") && h.slot !== "" && slotOf(f.slot) !== slotOf(h.slot)) {
        problems.push(`${f.id} ranura: datos «${h.slot}» / PRD «${f.slot}»`);
      }
      if (f.weight && !skip.includes("weight") && !/see below|varies/.test(f.weight)) {
        const prdNum = poundsOf(f.weight.replace(/\(.*?\)/g, ""));
        const dataNum = poundsOf(h.weight);
        if (prdNum !== dataNum && !(f.weight === "—" && (h.weight === "—" || h.weight === ""))) {
          problems.push(`${f.id} peso: datos «${h.weight}» / PRD «${f.weight}»`);
        }
      }
      if (f.price && !skip.includes("price") && !/varies|see below/.test(f.price)) {
        const prdNums = numbers(
          f.price
            .replace(
              /\(for a pair\)|\(per ounce\)|per ounce|for a pair|\(empty\)|\(one glove\)|each\./g,
              "",
            )
            .replace(/\(.*?(then|plus).*?\)/, ""),
        );
        const dataNums = numbers(entry.variants.map((v) => v.priceRaw).join(" "));
        if (
          dataNums.length > 0 &&
          JSON.stringify(prdNums) !== JSON.stringify(dataNums) &&
          !entry.variants.some((v) => v.bonusEquivalent !== undefined)
        ) {
          problems.push(
            `${f.id} precio: datos «${dataNums.join(" ")}» / PRD «${prdNums.join(" ")}»`,
          );
        }
      }
      if (f.cost && !skip.includes("cost")) {
        const prdNums = numbers(f.cost);
        const dataNums = numbers(entry.construction.costRaw);
        if (dataNums.length > 0 && JSON.stringify(prdNums) !== JSON.stringify(dataNums)) {
          problems.push(
            `${f.id} construcción: datos «${entry.construction.costRaw}» / PRD «${f.cost}»`,
          );
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("los casos corregidos: rod of enemy detection, net of snaring, poisonous cloak, armor of rage, bracers of defenselessness", () => {
    const ids = new Map(fixture.map((f) => [f.id, f]));
    expect(byId.get("rod-of-enemy-detection")!.construction).toMatchObject({
      costRaw: "11,750 gp",
      costCp: 1175000,
    });
    expect(ids.get("rod-of-enemy-detection")!.cost).toBe("11,750 gp");
    expect(byId.get("net-of-snaring")!.weightLb).toBe(6);
    expect(byId.get("poisonous-cloak")!.aura).toBe("strong abjuration");
    expect(byId.get("armor-of-rage")!.slot).toBe("body");
    expect(byId.get("bracers-of-defenselessness")!.slot).toBe("arms");
    expect(byId.get("frost-brand")!.construction.costCp).toBe(2737550);
    expect(byId.get("ring-of-energy-resistance")!.variants.map((v) => v.casterLevel)).toEqual([
      3, 7, 11,
    ]);
  });

  it("documenta las excepciones: cada una apunta a un objeto real", () => {
    for (const id of Object.keys(EXCEPTIONS)) expect(byId.has(id), id).toBe(true);
    for (const [id, why] of Object.entries(NO_ENTRY)) expect(why.length, id).toBeGreaterThan(10);
  });
});

describe("variantes de otros libros dentro de entradas CRB (corrección B)", () => {
  const variantsOf = (id: string): string[] => byId.get(id)!.variants.map((v) => v.variantId);

  it("feather tokens: las 6 del CRB (anchor, bird, fan, swan boat, tree, whip) con sus precios", () => {
    const e = byId.get("feather-tokens")!;
    expect(variantsOf("feather-tokens")).toEqual([
      "anchor",
      "bird",
      "fan",
      "swan-boat",
      "tree",
      "whip",
    ]);
    expect(e.variants.map((v) => v.priceCp)).toEqual([5000, 30000, 20000, 45000, 40000, 50000]);
    expect(e.variants.every((v) => v.casterLevel === 12)).toBe(true);
    expect(e.textEn).not.toMatch(
      /Ultimate Combat|Lance|Sky Hook|Catapult|Campsite|Siege Tower|Tar and Feathers/,
    );
  });

  it("figurines of wondrous power: las 9 del CRB con sus precios", () => {
    const e = byId.get("figurines-of-wondrous-power")!;
    expect(variantsOf("figurines-of-wondrous-power")).toEqual([
      "bronze-griffon",
      "ebony-fly",
      "golden-lions",
      "ivory-goats",
      "marble-elephant",
      "obsidian-steed",
      "onyx-dog",
      "serpentine-owl",
      "silver-raven",
    ]);
    expect(e.variants.map((v) => v.priceCp)).toEqual([
      1000000, 1000000, 1650000, 2100000, 1700000, 2850000, 1550000, 910000, 380000,
    ]);
    expect(e.textEn).not.toMatch(
      /Mythic|Bestiary|Coral Hippocampus|Basalt Dragon|Tin Imp|Glass Walrus/,
    );
  });

  it("golem manuals: las 5 del CRB (clay, flesh, iron, stone, stone guardian), con sourceRef sin la página errónea de AoN", () => {
    const e = byId.get("golem-manuals")!;
    expect(variantsOf("golem-manuals")).toEqual([
      "clay",
      "flesh",
      "iron",
      "stone",
      "stone-guardian",
    ]);
    expect(e.variants.map((v) => v.priceCp)).toEqual([1200000, 800000, 3500000, 2200000, 4400000]);
    expect(e.textEn).not.toMatch(/Construct Handbook|Lost Kingdoms|Ultimate Equipment/);
    expect(e.sourceRef).toBe("PRPG Core Rulebook");
    expect(e.needsReview).not.toBe(true);
  });

  it("mace of smiting: una sola versión (+3 adamantine heavy mace, 75.312 gp); la «lesser» es de Ultimate Equipment", () => {
    const e = byId.get("mace-of-smiting")! as MagicItem & {
      enhancement?: { on: string; bonus: number };
    };
    expect(variantsOf("mace-of-smiting")).toEqual(["default"]);
    expect(e.variants[0]).toMatchObject({ priceCp: 7531200, casterLevel: 11 });
    expect(e.textEn).not.toMatch(/lesser/i);
    expect(e.enhancement).toEqual({ on: "weapon", bonus: 3 });
    expect(e.needsReview).not.toBe(true);
  });

  it("ninguna entrada CRB conserva la sección Resonance ni cita libros distintos del CRB en la descripción", () => {
    const books =
      /\((?:Ultimate|Advanced|Inner Sea|Pathfinder Society|Occult|Mythic|Construct Handbook|Lost Kingdoms|Monster Codex)[^()]*\bpg?\.?\s*\d+\)|\*Ultimate (?:Combat|Equipment|Magic) \d+\*/;
    for (const item of items) {
      expect(item.textEn, `${item.id} (Resonance)`).not.toMatch(/\*\*Resonance\*\*/);
      if (item.kind === "general") continue;
      expect(item.textEn, `${item.id} (otro libro)`).not.toMatch(books);
    }
  });

  it("piedras ioun: 16 fichas con el precio y el efecto de la tabla del CRB, sin Resonance", () => {
    const expected: Record<string, [number, string]> = {
      "clear-spindle": [4000, "Sustains creature without food or water"],
      "dusty-rose-prism": [5000, "+1 insight bonus to AC"],
      "deep-red-sphere": [8000, "+2 enhancement bonus to Dexterity"],
      "incandescent-blue-sphere": [8000, "+2 enhancement bonus to Wisdom"],
      "pale-blue-rhomboid": [8000, "+2 enhancement bonus to Strength"],
      "pink-rhomboid": [8000, "+2 enhancement bonus to Constitution"],
      "pink-and-green-sphere": [8000, "+2 enhancement bonus to Charisma"],
      "scarlet-and-blue-sphere": [8000, "+2 enhancement bonus to Intelligence"],
      "dark-blue-rhomboid": [10000, "Alertness (as the feat)"],
      "iridescent-spindle": [18000, "Sustains creature without air"],
      "pale-lavender-ellipsoid": [20000, "Absorbs spells of 4th level or lower"],
      "pearly-white-spindle": [20000, "Regenerate 1 point of damage per 10 minutes"],
      "pale-green-prism": [
        30000,
        "+1 competence bonus on attack rolls, saves, skill checks, and ability checks",
      ],
      "orange-prism": [30000, "+1 caster level"],
      "vibrant-purple-prism": [36000, "Stores three levels of spells"],
      "lavender-and-green-ellipsoid": [40000, "Absorbs spells of 8th level or lower"],
    };
    // PRD wondrousItems.html#ioun-stones, tabla «Ioun Stones» (color, forma, efecto, precio de mercado).
    // (En el PRD el pie de tabla «1» de la piedra scarlet and blue queda pegado al precio: «Intelligence1 8,000 gp».)
    const stones = items.filter((i) => i.id.endsWith("-normal-ioun-stone"));
    expect(stones).toHaveLength(16);
    for (const stone of stones) {
      const key = stone.id.replace("-normal-ioun-stone", "");
      const [price, effect] = expected[key]!;
      expect(stone.variants[0]!.priceCp, key).toBe(price * 100);
      expect(stone.textEn, key).toContain(effect);
      expect(stone.textEn, key).not.toContain("Resonance");
      expect(stone.needsReview, key).not.toBe(true);
    }
  });
});
