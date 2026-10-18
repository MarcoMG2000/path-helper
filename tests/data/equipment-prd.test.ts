import { describe, expect, it } from "vitest";
import { loadDataset } from "../../scripts/srd/lib/load-dataset";
import { ROOT } from "../project/helpers";
import prd from "./fixtures/prd-equipment.json";

// Contraste del equipo con una fuente INDEPENDIENTE de Archives of Nethys: las tablas del PRD
// oficial de Paizo (https://paizo.com/pathfinderRPG/prd/coreRulebook/equipment.html), copiadas en
// `fixtures/prd-equipment.json` (corrección B de f3-srd-data: AoN mezcla variantes y valores de
// Ultimate Equipment/Bestiario y el recuento por sí solo no los detecta). Prioridad nº1 del
// proyecto: fidelidad al manual impreso.

const { data } = loadDataset(ROOT, ["weapons", "armor", "shields", "gear"]);
type Row = Record<string, unknown> & { id: string; name: string };
const rows = (cat: "weapons" | "armor" | "shields" | "gear"): Row[] =>
  (data.entries[cat] ?? []) as Row[];
const byId = (cat: "weapons" | "armor" | "shields" | "gear") =>
  new Map(rows(cat).map((r) => [r.id, r]));

const dash = (s: string): string => s.replace(/[–—−]/g, "-").replace(/×/g, "x").trim();
const lower = (s: string): string => dash(s).toLowerCase().replace(/\s+/g, " ");

// --- bienes y servicios (Table: Goods and Services) ------------------------------------------------

/** id de `gear` -> fila del PRD: `nombre` o `[subtabla, nombre]` (subtabla = encabezado de la fila). */
const GEAR_TO_PRD: Record<string, string | [string, string]> = {
  acid: "Acid (flask)",
  "alchemists-fire": "Alchemist's fire (flask)",
  "alchemists-lab": "Alchemist's lab",
  "ale-gallon": ["Ale", "Gallon"],
  "ale-mug": ["Ale", "Mug"],
  antitoxin: "Antitoxin (vial)",
  "artisans-outfit": "Artisan's outfit",
  "artisans-tools-common": "Artisan's tools",
  "artisans-tools-masterwork": "Artisan's tools, masterwork",
  "backpack-common": "Backpack (empty)",
  "banquet-per-person": "Banquet (per person)",
  "bit-and-bridle": "Bit and bridle",
  "barding-large-creature": ["Barding", "Large creature"],
  "barding-medium-creature": ["Barding", "Medium creature"],
  barrel: "Barrel (empty)",
  basket: "Basket (empty)",
  bedroll: "Bedroll",
  bell: "Bell",
  blanket: "Blanket, winter",
  "block-and-tackle": "Block and tackle",
  bottle: "Bottle, glass",
  bread: "Bread, loaf of",
  bucket: "Bucket (empty)",
  "bullseye-lantern": "Lantern, bullseye",
  caltrops: "Caltrops",
  candle: "Candle",
  "canvas-sq-yd": "Canvas (sq. yd.)",
  carriage: "Carriage",
  cart: "Cart",
  "chain-10-ft": "Chain (10 ft.)",
  chalk: "Chalk, 1 piece",
  cheese: "Cheese, hunk of",
  "chest-small": "Chest (empty)",
  "clerics-vestments": "Cleric's vestments",
  "climbers-kit": "Climber's kit",
  "coach-cab": "Coach cab",
  "cold-weather-outfit": "Cold-weather outfit",
  "courtiers-outfit": "Courtier's outfit",
  crowbar: "Crowbar",
  "disguise-kit": "Disguise kit",
  "dog-guard": "Dog, guard",
  "dog-riding": "Dog, riding",
  "pack-animal-donkey-mule": "Donkey or mule",
  "donkey-or-mule": "Donkey or mule",
  "entertainers-outfit": "Entertainer's outfit",
  "everburning-torch": "Everburning torch",
  "explorers-outfit": "Explorer's outfit",
  "feed-per-day": "Feed (per day)",
  "firewood-per-day": "Firewood (per day)",
  fishhook: "Fishhook",
  "fishing-net": "Fishing net, 25 sq. ft.",
  flask: "Flask (empty)",
  "flint-and-steel": "Flint and steel",
  galley: "Galley",
  "grappling-hook-common": "Grappling hook",
  hammer: "Hammer",
  "healers-kit": "Healer's kit",
  "hireling-trained": "Hireling, trained",
  "hireling-untrained": "Hireling, untrained",
  "holly-and-mistletoe": "Holly and mistletoe",
  "holy-symbol-silver": "Holy symbol, silver",
  "holy-symbol-wooden": "Holy symbol, wooden",
  "holy-water": "Holy water (flask)",
  "hooded-lantern": "Lantern, hooded",
  "horse-heavy": ["Horse", "Horse, heavy"],
  "horse-heavy-combat-trained": ["Horse", "Horse, heavy (combat trained)"],
  "horse-light": ["Horse", "Horse, light"],
  "horse-light-combat-trained": ["Horse", "Horse, light(combat trained)"],
  "horse-pony": ["Horse", "Pony"],
  "horse-pony-combat-trained": ["Horse", "Pony (combat trained)"],
  hourglass: "Hourglass",
  ink: "Ink (1 oz. vial)",
  inkpen: "Inkpen",
  "inn-stay-common": ["Inn stay (per day)", "Common"],
  "inn-stay-good": ["Inn stay (per day)", "Good"],
  "inn-stay-poor": ["Inn stay (per day)", "Poor"],
  jug: "Jug, clay",
  keelboat: "Keelboat",
  ladder: "Ladder, 10-foot",
  lamp: "Lamp, common",
  "lock-average": ["Lock", "Average"],
  "lock-good": ["Lock", "Good"],
  "lock-simple": ["Lock", "Simple"],
  "lock-superior": ["Lock", "Superior"],
  longship: "Longship",
  "magnifying-glass": "Magnifying glass",
  "manacles-common": "Manacles",
  "manacles-masterwork": "Manacles, masterwork",
  "masterwork-tool": "Tool, masterwork",
  "meal-common-per-day": ["Meals (per day)", "Common"],
  "meal-good-per-day": ["Meals (per day)", "Good"],
  "meal-poor-per-day": ["Meals (per day)", "Poor"],
  meat: "Meat, chunk of",
  "merchants-scale": "Scale, merchant's",
  messenger: "Messenger",
  "miners-pick": "Pick, miner's",
  mirror: "Mirror, small steel",
  "monks-outfit": "Monk's outfit",
  "mug-tankard": "Mug/Tankard, clay",
  "musical-instrument-common": "Musical instrument, common",
  "musical-instrument-masterwork": "Musical instrument, masterwork",
  "nobles-outfit": "Noble's outfit",
  oar: "Oar",
  oil: "Oil (1-pint flask)",
  "paper-sheet": "Paper (sheet)",
  "parchment-sheet": "Parchment (sheet)",
  "peasants-outfit": "Peasant's outfit",
  pitcher: "Pitcher, clay",
  piton: "Piton",
  pole: "Pole, 10-foot",
  "portable-ram": "Ram, portable",
  "pot-common": "Pot, iron",
  "pouch-belt-empty": "Pouch, belt (empty)",
  "road-or-gate-toll": "Road or gate toll",
  "rope-50-ft": "Rope, hemp (50 ft.)",
  rowboat: "Rowboat",
  "royal-outfit": "Royal outfit",
  sack: "Sack (empty)",
  "saddle-exotic-military": ["Saddle, Exotic", "Military"],
  "saddle-exotic-pack": ["Saddle, Exotic", "Pack"],
  "saddle-exotic-riding": ["Saddle, Exotic", "Riding"],
  "saddle-military": ["Saddle", "Military"],
  "saddle-pack": ["Saddle", "Pack"],
  "saddle-riding": ["Saddle", "Riding"],
  saddlebags: "Saddlebags",
  "sailing-ship": "Sailing ship",
  "scholars-outfit": "Scholar's outfit",
  "scroll-case": "Case, map or scroll",
  "sealing-wax": "Sealing wax",
  "sewing-needle": "Sewing needle",
  "ships-passage": "Ship's passage",
  "shovel-or-spade": "Shovel or spade",
  "signet-ring": "Signet ring",
  "silk-rope-50-ft": "Rope, silk (50 ft.)",
  sled: "Sled",
  sledge: "Sledge",
  smokestick: "Smokestick",
  soap: "Soap (per lb.)",
  "spell-component-pouch": "Spell component pouch",
  spellbook: "Spellbook, wizard's (blank)",
  spellcasting: "Spellcasting",
  spyglass: "Spyglass",
  "stabling-per-day": "Stabling (per day)",
  sunrod: "Sunrod",
  "tanglefoot-bag": "Tanglefoot bag",
  tent: "Tent",
  "thieves-tools-common": "Thieves' tools",
  "thieves-tools-masterwork": "Thieves' tools, masterwork",
  thunderstone: "Thunderstone",
  tindertwig: "Tindertwig",
  torch: "Torch",
  "trail-rations": "Rations, trail (per day)",
  "travelers-outfit": "Traveler's outfit",
  vial: "Vial, ink or potion",
  wagon: "Wagon",
  warship: "Warship",
  "water-clock": "Water clock",
  waterskin: "Waterskin",
  whetstone: "Whetstone",
  "whistle-signal": "Signal whistle",
  "wine-common-pitcher": ["Wine", "Common (pitcher)"],
  "wine-fine-bottle": ["Wine", "Fine (bottle)"],
};
const ARMOR_EXTRAS: Record<string, string> = {
  "armor-spikes": "Armor spikes",
  "locked-gauntlet": "Gauntlet, locked",
  "shield-spikes": "Shield spikes",
};
// El alias antiguo ya no existe como id; se conserva en el mapa solo como documentación.
delete GEAR_TO_PRD["pack-animal-donkey-mule"];

function prdGood(key: string | [string, string]) {
  const [sub, name] = typeof key === "string" ? ["", key] : key;
  const found = prd.goods.filter((g) => g.name === name && (sub === "" || g.sub === sub));
  expect(found, `fila del PRD ${JSON.stringify(key)}`).toHaveLength(1);
  return found[0]!;
}

describe("gear frente a la tabla Goods and Services del PRD (corrección B)", () => {
  const gear = byId("gear");

  it("las 161 filas del PRD tienen entrada y las 3 extras de armadura están aparte (164 = 161 + 3)", () => {
    expect(prd.goods).toHaveLength(161);
    const mapped = Object.keys(GEAR_TO_PRD);
    expect(mapped).toHaveLength(161);
    expect([...gear.keys()].sort()).toEqual([...mapped, ...Object.keys(ARMOR_EXTRAS)].sort());
    const used = new Set(
      Object.values(GEAR_TO_PRD).map((k) => JSON.stringify(typeof k === "string" ? ["", k] : k)),
    );
    expect(
      used.size,
      "cada fila del PRD se usa una vez (Donkey o mule, p. ej., no se repite)",
    ).toBe(161);
  });

  it.each(Object.entries(GEAR_TO_PRD))("%s: coste y peso coinciden con el PRD", (id, key) => {
    const entry = gear.get(id)!;
    const row = prdGood(key);
    expect(lower(String(entry["costRaw"])), `${id} coste`).toBe(lower(row.cost));
    const prdWeight = row.weight === "" || row.weight === "—" ? null : lower(row.weight);
    const raw = String(entry["weightRaw"]);
    if (prdWeight === null) {
      // «—»: sin peso. weightLb null; weightRaw «—» o vacío (transportes y servicios).
      expect(entry["weightLb"], `${id} peso`).toBeNull();
      expect(["", "—"], `${id} weightRaw`).toContain(raw);
    } else {
      expect(lower(raw), `${id} peso`).toBe(prdWeight);
    }
  });

  it("valores monetarios estructurados coherentes con el literal del PRD (cp)", () => {
    const unit: Record<string, number> = { cp: 1, sp: 10, gp: 100 };
    for (const [id, key] of Object.entries(GEAR_TO_PRD)) {
      const row = prdGood(key);
      const m = /^([\d,]+) (cp|sp|gp)$/.exec(row.cost);
      const entry = gear.get(id)!;
      if (m) expect(entry["costCp"], id).toBe(Number(m[1]!.replace(/,/g, "")) * unit[m[2]!]!);
      else if (row.cost === "—") expect(entry["costCp"], id).toBeNull();
    }
  });

  it("extras de armadura (Table: Armor and Shields, Extras): +50 gp/+10 lbs., 8 gp/+5 lbs., +10 gp/+5 lbs.", () => {
    for (const [id, name] of Object.entries(ARMOR_EXTRAS)) {
      const row = prd.armor.find((a) => a.name === name)!;
      const entry = gear.get(id)!;
      expect(lower(String(entry["costRaw"])), id).toBe(lower(row.cost));
      expect(lower(String(entry["weightRaw"])), id).toBe(lower(row.weight));
    }
  });

  it("los casos de la corrección B: pala 2 gp/8 lbs., jabón 5 sp/1 lb., carro 35 gp/400 lbs.", () => {
    expect(gear.get("shovel-or-spade")).toMatchObject({
      name: "Shovel or spade",
      costCp: 200,
      weightLb: 8,
    });
    expect(gear.get("soap")).toMatchObject({ costCp: 50, weightLb: 1 });
    expect(gear.get("wagon")).toMatchObject({ name: "Wagon", costCp: 3500, weightLb: 400 });
    expect(gear.get("cart")).toMatchObject({ costCp: 1500, weightLb: 200 });
    expect(gear.get("carriage")).toMatchObject({ costCp: 10000, weightLb: 600 });
    expect(gear.get("rowboat")).toMatchObject({ costCp: 5000, weightLb: 100 });
    expect(gear.get("sled")).toMatchObject({ costCp: 2000, weightLb: 300 });
  });

  it("los animales no llevan peso (los pesos de AoN son del Bestiario) ni variantes de otros libros", () => {
    for (const id of [
      "dog-guard",
      "dog-riding",
      "donkey-or-mule",
      "horse-heavy",
      "horse-heavy-combat-trained",
      "horse-light",
      "horse-light-combat-trained",
      "horse-pony",
      "horse-pony-combat-trained",
    ]) {
      const entry = gear.get(id)!;
      expect(entry["weightLb"], id).toBeNull();
      expect(String(entry["textEn"]), id).not.toMatch(
        /Bestiary|lap dog|Lap Dog|ox\b|yak|Mwangi|Katapesh|Inner Sea/i,
      );
    }
  });

  it("ninguna ficha de gear conserva la receta alquímica de Ultimate Equipment (el CRB no la trae)", () => {
    for (const [id, entry] of gear) {
      expect(String(entry["textEn"]), id).not.toMatch(
        /Alchemical Recipe|\*\*Recipe\*\*|Crafting this item is a DC/,
      );
    }
    // El texto de la sustancia es el del PRD: p. ej. el truco de la piedra del trueno.
    expect(String(gear.get("thunderstone")!["textEn"])).toContain(
      "Treat the target square as AC 5.",
    );
  });

  it("ninguna ficha de gear lista precios de variantes de otros libros (mithral, suites, silbato silencioso...)", () => {
    const banned =
      /mithral|suite|silent|carrier|hydration|weaponrack|\(huge\)|\(lap\)|\(ox\)|\(yak\)|platinum|\(gold\)|\(iron\)/i;
    for (const [id, entry] of gear) {
      const e = entry as unknown as { stats: Record<string, string>; textEn: string };
      expect(`${e.stats["Price"] ?? ""} ${e.stats["Weight"] ?? ""}`, `${id} stats`).not.toMatch(
        banned,
      );
      if (/^(manacles|holy-symbol|pot-|grappling|backpack|chest|inn-stay|whistle)/.test(id)) {
        expect(e.textEn, id).not.toMatch(banned);
      }
    }
  });
});

// --- armas (Table: Weapons) -----------------------------------------------------------------------------

const flip = (n: string): string => {
  const m = /^([^,(]+),\s*(.+)$/.exec(n);
  return m ? `${m[2]} ${m[1]}` : n;
};
const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

describe("weapons frente a la Table: Weapons del PRD (corrección B)", () => {
  const weapons = rows("weapons");
  // AoN llama «Light flail» a la fila «Flail» del PRD.
  const PRD_ALIAS: Record<string, string> = { Flail: "Light flail" };
  const findWeapon = (rawName: string) => {
    const prdName = PRD_ALIAS[rawName] ?? rawName;
    return weapons.find(
      (w) =>
        slug(w.name) === slug(flip(prdName)) ||
        slug(w.name) === slug(prdName) ||
        slug(w.name.replace(/\s*\(.*\)/, "")) === slug(prdName.replace(/\s*\(.*\)/, "")),
    );
  };
  // Filas de munición con nombre repetido y escudos usados como armas se comprueban aparte.
  const SKIP = new Set(["Bolts (10)", "Bolts (5)", "Bolts, crossbow (10)", "Bullets, sling (10)"]);
  const compared = prd.weapons.filter((r) => !SKIP.has(r.name) && !/^Spiked shield/.test(r.name));

  it("80 armas del PRD (sin la munición repetida) coinciden con una entrada de weapons", () => {
    const missing = compared.filter((r) => findWeapon(r.name) === undefined).map((r) => r.name);
    expect(missing).toEqual(["Darts, blowgun (10)"].filter((n) => findWeapon(n) === undefined));
  });

  it.each(
    compared.filter((r) => r.name !== "Darts, blowgun (10)").map((r) => [r.name, r] as const),
  )("%s: coste, daño, crítico, alcance, peso y tipo", (_name, r) => {
    const w = findWeapon(r.name)! as Row & {
      damage: { small: string; medium: string } | null;
      stats: Record<string, string>;
      damageTypes: string[];
    };
    const cost = r.cost === "special" ? null : r.cost;
    if (cost !== null) expect(lower(String(w["costRaw"]))).toBe(lower(cost));
    if (w.damage !== null) {
      expect(w.damage.small).toBe(dash(r.dmgS));
      expect(w.damage.medium).toBe(dash(r.dmgM));
    }
    const crit = w.stats["Critical"] ?? "—";
    expect(lower(crit === "—" ? "-" : crit)).toBe(lower(r.critical === "—" ? "-" : r.critical));
    const range = (w.stats["Range"] ?? "—").replace(/\s*\(.*\)/, "");
    expect(lower(range)).toBe(lower(r.range));
    expect(lower(String(w["weightRaw"]))).toBe(lower(r.weight === "—" ? "—" : r.weight));
    const types = r.type.replace(/[^BPS]/g, "");
    expect(w.damageTypes.join("")).toBe(types);
  });

  it("el peso de los dardos de cerbatana coincide con el PRD («—») pero se marca needsReview (d20pfsrd da 1 lb.)", () => {
    const darts = byId("weapons").get("blowgun-darts-10")!;
    const row = prd.weapons.find((r) => r.name === "Darts, blowgun (10)")!;
    expect(row.weight).toBe("—");
    expect(darts["weightRaw"]).toBe("—");
    expect(darts["needsReview"]).toBe(true);
  });

  it("las máquinas de asedio (no están en el PRD del CRB) quedan needsReview", () => {
    const siege = weapons.filter((w) => w["category"] === "siege");
    expect(siege).toHaveLength(5);
    for (const w of siege) expect(w["needsReview"], w.id).toBe(true);
  });
});

// --- armaduras y escudos (Table: Armor and Shields) -----------------------------------------------------------

describe("armor y shields frente a la Table: Armor and Shields del PRD (corrección B)", () => {
  const armor = rows("armor");
  const shields = rows("shields");
  const num = (v: string): number | null =>
    v === "—" ? null : parseInt(dash(v).replace(/[^0-9+-]/g, ""), 10);

  it("18 filas (12 armaduras y 6 escudos) coinciden en coste, bono, Des máx., ACP, fallo arcano, velocidad y peso", () => {
    const rowsPrd = prd.armor.filter(
      (r) => !["Armor spikes", "Gauntlet, locked", "Shield spikes"].includes(r.name),
    );
    expect(rowsPrd).toHaveLength(18);
    for (const r of rowsPrd) {
      const isShield = /^(Shield,|Buckler)/.test(r.name);
      const base = r.name.replace(/^Shield,\s*/, "");
      const found = isShield
        ? shields.find(
            (s) =>
              slug(s.name) === slug(base) ||
              slug(s.name) === slug(`${base} shield`) ||
              slug(s.name) === slug(r.name),
          )
        : armor.find((a) => slug(a.name) === slug(r.name));
      expect(found, r.name).toBeDefined();
      const e = found as Row & Record<string, number | null | string>;
      expect(lower(String(e["costRaw"])), `${r.name} coste`).toBe(lower(r.cost));
      expect(e[isShield ? "shieldBonus" : "armorBonus"], `${r.name} bono`).toBe(
        num(r.bonus.replace(/\d$/, (d) => (r.bonus.length > 2 ? "" : d))),
      );
      expect(e["maxDex"], `${r.name} Des máx.`).toBe(num(r.maxDex));
      expect(e["armorCheckPenalty"], `${r.name} ACP`).toBe(num(r.acp) ?? 0);
      expect(e["arcaneSpellFailurePct"], `${r.name} fallo arcano`).toBe(num(r.asf));
      expect(e["speed30"], `${r.name} velocidad 30`).toBe(
        r.speed30 === "—" ? null : num(r.speed30.replace(/ ft\.\d?$/, "")),
      );
      expect(e["speed20"], `${r.name} velocidad 20`).toBe(
        r.speed20 === "—" ? null : num(r.speed20.replace(/ ft\.\d?$/, "")),
      );
      expect(lower(String(e["weightRaw"])), `${r.name} peso`).toBe(
        lower(r.weight.replace(/lbs?\.\d$/, (m) => m.slice(0, -1))),
      );
    }
  });
});
