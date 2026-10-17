import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { discover, parse } from "../../../scripts/srd/parsers/equipment";
import {
  armorListingUrl,
  CRB_SOURCE_URL,
  crbSection,
  EquipmentParseError,
  itemPageUrl,
  MISC_LISTINGS,
  miscListingUrl,
  parseCostCp,
  parseDefenseStats,
  parseWeaponStats,
  parseWeightLb,
  stripFootnote,
  type EquipmentKind,
} from "../../../scripts/srd/parsers/equipment-common";
import type { ParserInput, ParserPage } from "../../../scripts/srd/lib/parser-contract";
import { SectionError } from "../../../scripts/srd/lib/sections";
import {
  ArmorSchema,
  GearSchema,
  ShieldSchema,
  WeaponSchema,
} from "../../../src/data/schema/equipment";
import { ROOT } from "../../project/helpers";

// Fixtures: contenido real de páginas de Archives of Nethys (el `span` de la entrada) y extractos reales
// de la página de fuente CRB y de los listados por categoría (se conservan las filas usadas; el
// recuento «Equipment (...) [N]» del extracto se ajusta a los enlaces que conserva).
const dir = resolve(ROOT, "tests", "fixtures", "srd-html", "equipment");
const read = (name: string): string => readFileSync(resolve(dir, `${name}.html`), "utf8");
const page = (url: string, html: string): ParserPage => ({ url, html, sha256: "0".repeat(64) });

const ALLOWED: Record<EquipmentKind, string[]> = {
  weapons: ["Statistics", "Description", "Table 3-17: Siege Tower Complement"],
  armor: ["Statistics", "Description"],
  shields: ["Statistics", "Description"],
  gear: ["Statistics", "Description", "Alchemical Recipe"],
};
const ALIASES = {
  shields: {
    "heavy-steel": "heavy-steel-shield",
    tower: "tower-shield",
  },
};

const WEAPONS = [
  "Longsword",
  "Dagger",
  "Net",
  "Gnome hooked hammer",
  "Heavy shield",
  "Catapult, heavy",
  "Arrows (20)",
  "Unarmed strike",
  "Crossbow bolts (10)",
  "Siege tower, Large",
];
const ARMOR = ["Full plate", "Padded", "Heavy steel", "Tower", "Armor spikes"];
const MISC = [
  "Backpack (common)",
  "Horse (heavy)",
  "Acid",
  "Hireling (trained)",
  "Spellcasting",
  "Oar",
  "Manacles (common)",
  "Barding (Large creature)",
  "Carriage",
];
const ITEM_PAGE = /Equipment(?:Weapons|Armor|Misc)Display\.aspx/;
const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const EMPTY_MISC_LISTING = `<table id="MainContent_GridView6"><tr><th>Name</th><th>Cost</th><th>Weight</th></tr></table>`;
const MISC_FIXTURE_LISTINGS = new Set([
  "AdventuringGear",
  "MountsPets",
  "AlchemicalWeapons",
  "LodgingServices",
  "AnimalGear",
  "TransportLand",
]);

function pages(overrides: Record<string, string> = {}): ParserPage[] {
  const list: ParserPage[] = [
    page(CRB_SOURCE_URL, overrides["source"] ?? read("crb-source-extract")),
  ];
  for (const c of ["Light", "Medium", "Heavy", "Shield", "Extra"] as const) {
    list.push(page(armorListingUrl(c), read(`listing-armor-${c.toLowerCase()}`)));
  }
  for (const c of MISC_LISTINGS) {
    list.push(
      page(
        miscListingUrl(c),
        MISC_FIXTURE_LISTINGS.has(c) ? read(`listing-misc-${c.toLowerCase()}`) : EMPTY_MISC_LISTING,
      ),
    );
  }
  const items: [EquipmentKind, string[], string][] = [
    ["weapons", WEAPONS, "weapons"],
    ["armor", ARMOR, "armor"],
    ["gear", MISC, "misc"],
  ];
  for (const [kind, names, prefix] of items) {
    for (const name of names) {
      const url = itemPageUrl(kind, name);
      list.push(page(url, overrides[name] ?? read(`${prefix}-${slug(name)}`)));
    }
  }
  return list;
}

/** Páginas de una categoría: fuente, listados y las páginas de ítem de su universo. */
function scoped(kind: EquipmentKind, all: ParserPage[]): ParserPage[] {
  const universe = discover({
    category: kind,
    subset: undefined,
    seedPages: all.filter((p) => !ITEM_PAGE.test(p.url)),
    config: { allowedSections: ALLOWED[kind], slugAliases: ALIASES },
  });
  const wanted = new Set(universe.urls);
  return all.filter((p) => !ITEM_PAGE.test(p.url) || wanted.has(p.url));
}

function input(kind: EquipmentKind, list: ParserPage[]): ParserInput {
  return {
    category: kind,
    subset: undefined,
    pages: list,
    config: { allowedSections: ALLOWED[kind], slugAliases: ALIASES },
  };
}

const run = (kind: EquipmentKind, overrides: Record<string, string> = {}) =>
  parse(input(kind, scoped(kind, pages(overrides))));

type Row = Record<string, unknown>;
const byId = (entries: readonly { id: string }[], id: string): Row => {
  const e = entries.find((x) => x.id === id);
  if (!e) throw new Error(`falta ${id}`);
  return e as Row;
};

describe("dinero y pesos (R24, R25: costCp en piezas de cobre)", () => {
  it.each([
    ["15 gp", 1500],
    ["2 gp", 200],
    ["5 sp", 50],
    ["3 cp", 3],
    ["1,500 gp", 150000],
    ["30,000 gp", 3000000],
    ["0 gp", 0],
    ["+50 gp", 5000],
    ["3 sp per day", 30],
    ["2 cp per mile", 2],
    ["1 pp", 1000],
  ])("%s -> %s cp", (raw, cp) => {
    expect(parseCostCp(raw)).toBe(cp);
  });

  it.each(["—", "", "7 gp/20 gp", "×4", "caster level × spell level × 10 gp", "special"])(
    "%j no es una cantidad fija -> null",
    (raw) => {
      expect(parseCostCp(raw)).toBeNull();
    },
  );

  it.each([
    ["4 lbs.", 4],
    ["1 lb.", 1],
    ["1/2 lb.", 0.5],
    ["1-1/2 lbs.", 1.5],
    ["2,000 lbs.", 2000],
    ["+10 lbs.", 10],
  ])("peso %s -> %s lb", (raw, lb) => {
    expect(parseWeightLb(raw)).toBe(lb);
  });

  it.each(["—", "", "special", "3 cp", "×2"])("peso %j -> null", (raw) => {
    expect(parseWeightLb(raw)).toBeNull();
  });

  it("quita la marca de nota al pie de los listados", () => {
    expect(stripFootnote("3 lbs.1")).toBe("3 lbs.");
    expect(stripFootnote("1/2 lb.1")).toBe("1/2 lb.");
    expect(stripFootnote("2 gp")).toBe("2 gp");
  });
});

describe("estadísticas de armas y armaduras (R24)", () => {
  const base = {
    Category: "One-Handed",
    Proficiency: "Martial",
    Damage: "1d6 (small), 1d8 (medium)",
    Critical: "19-20/x2",
    Range: "—",
    Type: "S",
    Special: "—",
  };
  it("crítico 19-20/x2, x2, x3/x4 y 18-20/x2", () => {
    expect(parseWeaponStats(base).critical).toEqual({ range: 19, multiplier: 2 });
    expect(parseWeaponStats({ ...base, Critical: "x3" }).critical).toEqual({
      range: 20,
      multiplier: 3,
    });
    expect(parseWeaponStats({ ...base, Critical: "x3/x4" }).critical).toEqual({
      range: 20,
      multiplier: 3,
      secondaryMultiplier: 4,
    });
    expect(parseWeaponStats({ ...base, Critical: "18-20/x2" }).critical?.range).toBe(18);
    expect(parseWeaponStats({ ...base, Critical: "—" }).critical).toBeNull();
  });
  it("daño pequeño/mediano, daño fijo, arma doble y celdas con guion", () => {
    expect(parseWeaponStats(base).damage).toEqual({ small: "1d6", medium: "1d8" });
    expect(parseWeaponStats({ ...base, Damage: "1 (small), 1d2 (medium)" }).damage).toEqual({
      small: "1",
      medium: "1d2",
    });
    expect(
      parseWeaponStats({ ...base, Damage: "1d6/1d4 (small), 1d8/1d6 (medium)" }).damage,
    ).toEqual({ small: "1d6/1d4", medium: "1d8/1d6" });
    expect(parseWeaponStats({ ...base, Damage: "— (small), — (medium)" }).damage).toBeNull();
  });
  it("alcance, alcance mínimo, tipos y propiedades", () => {
    const r = parseWeaponStats({
      ...base,
      Range: "10 ft.",
      Type: "P or S",
      Special: "disarm, trip",
      "Weapon Groups": "Blades, Light; Thrown",
    });
    expect(r.rangeIncrementFt).toBe(10);
    expect(r.damageTypes).toEqual(["P", "S"]);
    expect(r.special).toEqual(["disarm", "trip"]);
    expect(r.weaponGroups).toEqual(["Blades, Light", "Thrown"]);
    const m = parseWeaponStats({ ...base, Range: "300 ft. (100 ft. min.)" });
    expect([m.rangeIncrementFt, m.minRangeFt]).toEqual([300, 100]);
  });
  it("fallo cerrado ante formas desconocidas", () => {
    expect(() => parseWeaponStats({ ...base, Critical: "19-20/x5" })).toThrow(EquipmentParseError);
    expect(() => parseWeaponStats({ ...base, Category: "Floating" })).toThrow(EquipmentParseError);
    expect(() => parseWeaponStats({ ...base, Proficiency: "Firearm" })).toThrow(
      EquipmentParseError,
    );
    expect(() => parseWeaponStats({ ...base, Damage: "lots" })).toThrow(EquipmentParseError);
    expect(() => parseWeaponStats({ ...base, Type: "X" })).toThrow(EquipmentParseError);
    expect(() => parseWeaponStats({ Category: "Light" })).toThrow(EquipmentParseError);
  });
  it("armadura: bonificador, Des máx, penalizador, fallo arcano y velocidades", () => {
    expect(
      parseDefenseStats({
        "Armor Bonus": "+9",
        "Max Dex Bonus": "+1",
        "Armor Check Penalty": "-6",
        "Arcane Spell Failure Chance": "35%",
        Speed: "20 ft./15 ft.",
      }),
    ).toEqual({
      bonus: 9,
      maxDex: 1,
      armorCheckPenalty: -6,
      arcaneSpellFailurePct: 35,
      speed30: 20,
      speed20: 15,
    });
    const shield = parseDefenseStats({
      "Armor Bonus": "+1",
      "Max Dex Bonus": "—",
      "Armor Check Penalty": "0",
      "Arcane Spell Failure Chance": "5%",
      Speed: "—/—",
    });
    expect(shield).toMatchObject({ maxDex: null, armorCheckPenalty: 0, speed30: null });
    expect(() =>
      parseDefenseStats({
        "Armor Bonus": "9",
        "Max Dex Bonus": "+1",
        "Armor Check Penalty": "-6",
        "Arcane Spell Failure Chance": "35%",
        Speed: "20 ft./15 ft.",
      }),
    ).toThrow(EquipmentParseError);
  });
});

describe("universo CRB y descubrimiento (R24-R26, R93-style)", () => {
  it("la sección declara N y lista N enlaces (con repetidos)", () => {
    const source = pages().find((p) => p.url === CRB_SOURCE_URL)!;
    const weapons = crbSection(source, "Equipment (Weapons)")!;
    expect(weapons.declaredCount).toBe(11);
    expect(weapons.names).toHaveLength(11);
    expect(crbSection(source, "Equipment (Nope)")).toBeUndefined();
  });

  it("discover: URLs y expectedCount (armas: 10 distintas, un enlace repetido)", () => {
    const seeds = pages().filter((p) => !ITEM_PAGE.test(p.url));
    const cfg = { allowedSections: [], slugAliases: ALIASES };
    const w = discover({ category: "weapons", subset: undefined, seedPages: seeds, config: cfg });
    expect(w.urls).toHaveLength(10);
    expect(w.expectations?.expectedCount).toBe(10);
    const a = discover({ category: "armor", subset: undefined, seedPages: seeds, config: cfg });
    expect(a.urls).toEqual(["Full plate", "Padded"].map((n) => itemPageUrl("armor", n)).sort());
    const s = discover({ category: "shields", subset: undefined, seedPages: seeds, config: cfg });
    expect(s.expectations?.expectedCount).toBe(2);
    const g = discover({ category: "gear", subset: undefined, seedPages: seeds, config: cfg });
    // 9 bienes + 1 complemento de armadura (armor spikes, listado «Extra»)
    expect(g.expectations?.expectedCount).toBe(10);
    expect(g.urls).toContain(itemPageUrl("armor", "Armor spikes"));
  });

  it("discover con subconjunto no descubre nada", () => {
    const d = discover({
      category: "weapons",
      subset: "x",
      seedPages: [],
      config: { allowedSections: [], slugAliases: {} },
    });
    expect(d.urls).toEqual([]);
  });

  it("falla si el recuento declarado no coincide con los enlaces", () => {
    const html = read("crb-source-extract").replace(
      "Equipment (Armor) [5]",
      "Equipment (Armor) [6]",
    );
    expect(() =>
      discover({
        category: "armor",
        subset: undefined,
        seedPages: pages({ source: html }).filter((p) => !ITEM_PAGE.test(p.url)),
        config: { allowedSections: [], slugAliases: {} },
      }),
    ).toThrow(/declara 6 pero lista 5/);
  });

  it("falla si un nombre no figura en ningún listado", () => {
    const list = pages().filter((p) => !ITEM_PAGE.test(p.url));
    const patched = list.map((p) =>
      p.url === armorListingUrl("Heavy")
        ? { ...p, html: p.html.replace("Full plate", "Other plate") }
        : p,
    );
    expect(() =>
      discover({
        category: "armor",
        subset: undefined,
        seedPages: patched,
        config: { allowedSections: [], slugAliases: {} },
      }),
    ).toThrow(/figura en 0 listados/);
  });

  it("falla si falta la página de fuente", () => {
    expect(() =>
      discover({
        category: "gear",
        subset: undefined,
        seedPages: [],
        config: { allowedSections: [], slugAliases: {} },
      }),
    ).toThrow(/falta la página/);
  });
});

describe("parse de armas (R24, R2, R3, R6, R7, R8)", () => {
  const out = run("weapons");

  it("todas las entradas pasan el schema real y son CRB", () => {
    expect(out.entries).toHaveLength(10);
    for (const e of out.entries) {
      const parsed = WeaponSchema.parse(e);
      expect(parsed.book).toBe("CRB");
      expect(parsed.sourceRef).toMatch(/^PRPG Core Rulebook pg\. \d+$/);
    }
  });

  it("golden Longsword: 15 gp, 1d6/1d8, 19-20/x2, 4 lb, S", () => {
    const e = WeaponSchema.parse(byId(out.entries, "longsword"));
    expect(e).toMatchObject({
      costCp: 1500,
      costRaw: "15 gp",
      weightLb: 4,
      damage: { small: "1d6", medium: "1d8" },
      critical: { range: 19, multiplier: 2 },
      damageTypes: ["S"],
      category: "martial",
      handedness: "oneHanded",
      rangeIncrementFt: null,
    });
  });

  it("golden Dagger: 2 gp, 1d3/1d4, 19-20/x2, 10 ft, 1 lb, P o S", () => {
    expect(WeaponSchema.parse(byId(out.entries, "dagger"))).toMatchObject({
      costCp: 200,
      damage: { small: "1d3", medium: "1d4" },
      critical: { range: 19, multiplier: 2 },
      rangeIncrementFt: 10,
      weightLb: 1,
      damageTypes: ["P", "S"],
      category: "simple",
      handedness: "light",
    });
  });

  it("casos límite: arma doble, red, escudo como arma, munición y máquinas de asedio", () => {
    expect(WeaponSchema.parse(byId(out.entries, "gnome-hooked-hammer"))).toMatchObject({
      critical: { range: 20, multiplier: 3, secondaryMultiplier: 4 },
      damage: { small: "1d6/1d4", medium: "1d8/1d6" },
      special: ["double", "trip"],
    });
    expect(WeaponSchema.parse(byId(out.entries, "net"))).toMatchObject({
      damage: null,
      critical: null,
      damageTypes: [],
    });
    expect(WeaponSchema.parse(byId(out.entries, "heavy-shield"))).toMatchObject({
      costCp: null,
      costRaw: "7 gp/20 gp",
      weightLb: null,
      weightRaw: "special",
    });
    expect(WeaponSchema.parse(byId(out.entries, "arrows-20"))).toMatchObject({
      category: "ammunition",
      handedness: "ammunition",
      damage: null,
      costCp: 100,
    });
    expect(WeaponSchema.parse(byId(out.entries, "catapult-heavy"))).toMatchObject({
      category: "siege",
      handedness: "siege",
      rangeIncrementFt: 300,
      minRangeFt: 100,
      costCp: 100000,
    });
    expect(WeaponSchema.parse(byId(out.entries, "unarmed-strike"))).toMatchObject({
      costCp: null,
      costRaw: "—",
      handedness: "unarmed",
    });
  });

  it("conserva los campos de la página tal cual (stats) y el texto sin HTML", () => {
    const e = WeaponSchema.parse(byId(out.entries, "longsword"));
    expect(e.stats["Damage"]).toBe("1d6 (small), 1d8 (medium)");
    expect(e.stats["Weapon Groups"]).toBe("Blades, Heavy");
    expect(e.textEn).toContain("**Cost** 15 gp");
    expect(e.textEn).toContain("This sword is about 3-1/2 feet in length.");
    expect(e.textEn).not.toMatch(/<[a-z]/i);
    expect(e.textEn).not.toContain("Ultimate Equipment");
  });

  it("R4: id por slug del nombre del enlace (arrows-20, catapult-heavy)", () => {
    expect(out.entries.map((e) => e.id).sort()).toEqual(
      [
        "arrows-20",
        "catapult-heavy",
        "crossbow-bolts-10",
        "dagger",
        "gnome-hooked-hammer",
        "heavy-shield",
        "longsword",
        "net",
        "siege-tower-large",
        "unarmed-strike",
      ].sort(),
    );
  });

  it("enlace repetido en la fuente: una sola entrada y una nota", () => {
    expect(out.entries.filter((e) => e.id === "crossbow-bolts-10")).toHaveLength(1);
    expect(
      out.notes?.some((n) => n.includes("enlace repetido") && n.includes("Crossbow bolts")),
    ).toBe(true);
  });

  it("R45: la tabla h2 permitida de la torre de asedio se conserva como contenido", () => {
    const e = WeaponSchema.parse(byId(out.entries, "siege-tower-large"));
    expect(e.textEn).toContain("**Table 3-17: Siege Tower Complement**");
    expect(e.textEn).toContain("| **Size** | **Soldiers** |");
  });

  it("páginas con varias etiquetas Source: se cuentan y sourceRef es la CRB", () => {
    expect(out.counters?.["páginas con varias etiquetas Source"]).toBeGreaterThan(0);
    expect(WeaponSchema.parse(byId(out.entries, "longsword")).sourceRef).toBe(
      "PRPG Core Rulebook pg. 142",
    );
  });

  it("R44: dos ejecuciones dan el mismo resultado", () => {
    expect(JSON.stringify(run("weapons").entries)).toBe(JSON.stringify(out.entries));
  });
});

describe("parse de armaduras y escudos (R24)", () => {
  it("golden Full plate: 1,500 gp, +9, Des máx +1, ACP -6, ASF 35 %, 50 lb", () => {
    const out = run("armor");
    expect(out.entries.map((e) => e.id).sort()).toEqual(["full-plate", "padded"]);
    const e = ArmorSchema.parse(byId(out.entries, "full-plate"));
    expect(e).toMatchObject({
      category: "heavy",
      costCp: 150000,
      weightLb: 50,
      armorBonus: 9,
      maxDex: 1,
      armorCheckPenalty: -6,
      arcaneSpellFailurePct: 35,
      speed30: 20,
      speed20: 15,
    });
    expect(ArmorSchema.parse(byId(out.entries, "padded"))).toMatchObject({
      category: "light",
      armorCheckPenalty: 0,
      maxDex: 8,
    });
  });

  it("golden Heavy steel (escudo): +2, ACP -2, ASF 15 %, 15 lb; id con alias", () => {
    const out = run("shields");
    expect(out.entries.map((e) => e.id).sort()).toEqual(["heavy-steel-shield", "tower-shield"]);
    const e = ShieldSchema.parse(byId(out.entries, "heavy-steel-shield"));
    expect(e).toMatchObject({
      name: "Heavy steel",
      shieldBonus: 2,
      maxDex: null,
      armorCheckPenalty: -2,
      arcaneSpellFailurePct: 15,
      weightLb: 15,
      costCp: 2000,
      speed30: null,
    });
    expect(ShieldSchema.parse(byId(out.entries, "tower-shield"))).toMatchObject({
      shieldBonus: 4,
      maxDex: 2,
      armorCheckPenalty: -10,
    });
  });
});

describe("parse de bienes (R25)", () => {
  const out = run("gear");

  it("todas las entradas pasan el schema real", () => {
    expect(out.entries).toHaveLength(10);
    for (const e of out.entries) GearSchema.parse(e);
  });

  it("coste y peso salen de la fila del listado (la página agrupa variantes)", () => {
    const e = GearSchema.parse(byId(out.entries, "backpack-common"));
    expect(e).toMatchObject({
      name: "Backpack (common)",
      category: "adventuring-gear",
      costCp: 200,
      costRaw: "2 gp",
      weightLb: 2,
      weightRaw: "2 lbs.",
    });
    expect(e.stats["Price"]).toContain("25 gp (carrier)");
    const horse = GearSchema.parse(byId(out.entries, "horse-heavy"));
    expect(horse).toMatchObject({ category: "mounts-pets", costCp: 20000, weightLb: 2000 });
  });

  it("monedas distintas, importes no fijos y pesos ausentes", () => {
    expect(GearSchema.parse(byId(out.entries, "hireling-trained"))).toMatchObject({
      costCp: 30,
      costRaw: "3 sp per day",
      weightLb: null,
      weightRaw: "",
    });
    expect(GearSchema.parse(byId(out.entries, "spellcasting"))).toMatchObject({
      costCp: null,
      category: "lodging-services",
    });
    expect(GearSchema.parse(byId(out.entries, "barding-large-creature"))).toMatchObject({
      costCp: null,
      costRaw: "×4",
      weightRaw: "×2",
    });
    expect(GearSchema.parse(byId(out.entries, "carriage"))).toMatchObject({
      costCp: 10000,
      weightLb: null,
      category: "transport-land",
    });
  });

  it("complementos de armadura (listado Extra): coste y peso son sumandos", () => {
    expect(GearSchema.parse(byId(out.entries, "armor-spikes"))).toMatchObject({
      category: "armor-extra",
      costCp: 5000,
      costRaw: "+50 gp",
      weightLb: 10,
      weightRaw: "+10 lbs.",
    });
  });

  it("la subsección «Alchemical Recipe» se conserva en el texto", () => {
    const e = GearSchema.parse(byId(out.entries, "acid"));
    expect(e.textEn).toContain("**Alchemical Recipe**");
    expect(e.category).toBe("alchemical-weapons");
  });

  it("sin descripción en la fuente: no se copia la nota editorial de AoN", () => {
    const e = GearSchema.parse(byId(out.entries, "oar"));
    expect(e.textEn).not.toContain("Nethys");
    expect(e.textEn).toContain("**Price** 2 gp");
    expect(out.counters?.["páginas sin descripción en la fuente"]).toBe(1);
  });

  it("R46: la sección «Expanded Information» de otro libro se ignora y se cuenta", () => {
    const e = GearSchema.parse(byId(out.entries, "manacles-common"));
    expect(e.textEn).not.toContain("Fetters");
    expect(out.counters?.["secciones de otros libros ignoradas"]).toBe(1);
  });
});

describe("errores del parser (R45, R46, R47-style)", () => {
  it("R45: un encabezado h3 desconocido detiene el parseo nombrando página y encabezado", () => {
    const html = read("weapons-dagger").replace("Description</h3>", "Secret Rules</h3>");
    let error: unknown;
    try {
      run("weapons", { Dagger: html });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(SectionError);
    expect((error as SectionError).heading).toBe("Secret Rules");
    expect((error as SectionError).page).toContain("ItemName=Dagger");
  });

  it("R45: un h2 sin Source de otro libro detiene el parseo", () => {
    const html = read("misc-oar").replace(
      "</span>",
      '<h2 class="title">Extra Rules</h2>Some text.</span>',
    );
    expect(() => run("gear", { Oar: html })).toThrow(SectionError);
  });

  it("R46: una página listada sin etiqueta Source CRB se excluye y se informa", () => {
    const html = read("weapons-dagger")
      .replace(
        /<a[^>]*><i>PRPG Core Rulebook pg\. 142<\/i><\/a>/,
        "<i>Ultimate Equipment pg. 17</i>",
      )
      .replace(/, <i>Ultimate Equipment pg\. 17<\/i>/, "");
    const out = run("weapons", { Dagger: html });
    expect(out.entries.map((e) => e.id)).not.toContain("dagger");
    expect(out.excluded).toHaveLength(1);
    expect(out.excluded[0]!.url).toContain("ItemName=Dagger");
    expect(out.notes?.some((n) => n.startsWith("excluida:"))).toBe(true);
  });

  it("falla si falta la página de un ítem del universo", () => {
    const list = scoped("weapons", pages()).filter((p) => !p.url.includes("ItemName=Dagger"));
    expect(() => parse(input("weapons", list))).toThrow(/falta en la procedencia/);
  });

  it("falla si hay una página de equipo ajena al universo", () => {
    const list = [...scoped("weapons", pages())];
    list.push(page(itemPageUrl("weapons", "Extra sword"), read("weapons-dagger")));
    expect(() => parse(input("weapons", list))).toThrow(/no pertenecen al universo/);
  });

  it("una categoría ajena al lote no se procesa", () => {
    expect(() => parse(input("feats" as EquipmentKind, []))).toThrow(/no procesa/);
  });
});
