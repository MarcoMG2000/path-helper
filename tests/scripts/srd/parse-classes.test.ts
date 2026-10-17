import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { discover, parse } from "../../../scripts/srd/parsers/classes";
import {
  normalizeSpecialName,
  parseClassSkills,
  parseProficiencies,
} from "../../../scripts/srd/parsers/class-features";
import type { ParserInput, ParserPage } from "../../../scripts/srd/lib/parser-contract";
import { SectionError } from "../../../scripts/srd/lib/sections";
import { ClassSchema } from "../../../src/data/schema/class";
import { ROOT } from "../../project/helpers";

// Fixtures: el contenido de `MainContent_DataListTypes_LabelName_0` de las páginas reales de
// Archives of Nethys (ClassDisplay.aspx) copiado tal cual, sin la cabecera de la web.
const dir = resolve(ROOT, "tests", "fixtures", "srd-html", "classes");
const read = (name: string): string => readFileSync(resolve(dir, `${name}.html`), "utf8");
const url = (c: string): string => `https://www.aonprd.com/ClassDisplay.aspx?ItemName=${c}`;
const page = (c: string, html = read(c.toLowerCase())): ParserPage => ({
  url: url(c),
  html,
  sha256: "0".repeat(64),
});

const ALLOWED = [
  "Class Skills",
  "Class Features",
  "Ex-Barbarians",
  "Ex-Clerics",
  "Ex-Druids",
  "Ex-Paladins",
];
const input = (pages: ParserPage[]): ParserInput => ({
  category: "classes",
  subset: undefined,
  pages,
  config: { allowedSections: ALLOWED, slugAliases: {} },
});
const one = (c: string) => {
  const out = parse(input([page(c)]));
  expect(out.entries).toHaveLength(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- datos JSON de prueba sin tipar
  return out.entries[0] as unknown as Record<string, any>;
};

describe("parser de clases: tabla de 20 filas (R10)", () => {
  it("R10: el druida tiene 20 filas con BAB iterativo como lista de números", () => {
    const druid = one("Druid");
    expect(druid["table"]).toHaveLength(20);
    expect(druid["table"][7].bab).toEqual([6, 1]);
    expect(druid["table"][19].bab).toEqual([15, 10, 5]);
    expect(druid["table"][0]).toMatchObject({ level: 1, bab: [0], fort: 2, ref: 0, will: 2 });
  });

  it("R10: en el druida '—' de la columna special es [] y el nombre se conserva tal cual", () => {
    const druid = one("Druid");
    expect(druid["table"][4].special).toEqual([]);
    expect(druid["table"][3].special).toEqual(["Resist nature's lure", "wild shape (1/day)"]);
  });

  it("R10: el druida lleva spellsPerDay con 3 y 1 en nivel 1 y '-' como null", () => {
    const druid = one("Druid");
    expect(druid["table"][0].spellsPerDay).toEqual([
      3,
      1,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(druid["table"][19].spellsPerDay).toEqual([4, 4, 4, 4, 4, 4, 4, 4, 4, 4]);
  });

  it("R10: el paladín distingue null (—) de 0 (4º nivel con 0 conjuros de 1.er nivel)", () => {
    const paladin = one("Paladin");
    for (const level of [1, 2, 3]) {
      expect(paladin["table"][level - 1].spellsPerDay.every((s: unknown) => s === null)).toBe(true);
    }
    expect(paladin["table"][3].spellsPerDay[1]).toBe(0);
    expect(paladin["table"][3].spellsPerDay[0]).toBeNull();
    expect(paladin["table"][6].spellsPerDay.slice(0, 3)).toEqual([null, 1, 0]);
  });

  it("R10: el cazador también distingue null y 0", () => {
    const ranger = one("Ranger");
    expect(ranger["table"][2].spellsPerDay[1]).toBeNull();
    expect(ranger["table"][3].spellsPerDay[1]).toBe(0);
  });

  it("R10: el pícaro no lanza: sin casting ni spellsPerDay", () => {
    const rogue = one("Rogue");
    expect(rogue["casting"]).toBeUndefined();
    expect(rogue["table"][0].spellsPerDay).toBeUndefined();
    expect(rogue["table"][0].special).toEqual(["Sneak attack +1d6", "trapfinding"]);
  });

  it("R10: el clérigo conserva la base y el hueco de dominio de '1+1'", () => {
    const cleric = one("Cleric");
    expect(cleric["table"][0].spellsPerDay.slice(0, 3)).toEqual([3, 1, null]);
    expect(cleric["table"][0].domainSpellsPerDay.slice(0, 3)).toEqual([null, 1, null]);
    expect(cleric["table"][19].domainSpellsPerDay.slice(1, 10)).toEqual(Array(9).fill(1));
  });

  it("R10: el bardo une la tabla de conjuros conocidos y no tiene columna de nivel 0 por día", () => {
    const bard = one("Bard");
    expect(bard["table"][0].spellsPerDay.slice(0, 3)).toEqual([null, 1, null]);
    expect(bard["table"][0].spellsKnown.slice(0, 3)).toEqual([4, 2, null]);
    expect(bard["table"][19].spellsKnown.slice(0, 7)).toEqual([6, 6, 6, 6, 6, 5, 5]);
  });

  it("las clases construidas pasan el schema real", () => {
    for (const c of ["Druid", "Rogue", "Paladin", "Bard", "Cleric", "Ranger", "Barbarian"]) {
      const result = ClassSchema.safeParse(one(c));
      expect(result.success, c).toBe(true);
    }
  });
});

describe("parser de clases: cabecera, progresión y competencias (R12)", () => {
  it("R12: dado de golpe, rangos, riqueza inicial y alineamiento del druida", () => {
    const druid = one("Druid");
    expect(druid).toMatchObject({
      id: "druid",
      name: "Druid",
      hitDie: 8,
      skillRanksPerLevel: 4,
      startingWealthDice: "2d6",
      alignment: "Any neutral",
      sourceRef: "PRPG Core Rulebook pg. 48",
      book: "CRB",
    });
    expect(druid["progression"]).toEqual({
      bab: "threeQuarters",
      fort: "good",
      ref: "poor",
      will: "good",
    });
    expect(druid["casting"]).toEqual({
      ability: "wis",
      tradition: "divine",
      prepared: true,
      spellListId: "druid",
    });
  });

  it("R12: el bardo es espontáneo (prepared false) y el paladín prepara", () => {
    expect(one("Bard")["casting"]).toEqual({
      ability: "cha",
      tradition: "arcane",
      prepared: false,
      spellListId: "bard",
    });
    expect(one("Paladin")["casting"]).toMatchObject({
      ability: "cha",
      tradition: "divine",
      prepared: true,
    });
  });

  it("R12: habilidades de clase como ids; Knowledge (all) del bardo se expande a 10", () => {
    const rogue = one("Rogue");
    expect(rogue["classSkills"]).toContain("sleight-of-hand");
    expect(rogue["classSkills"]).toContain("knowledge-dungeoneering");
    expect(rogue["classSkills"]).toHaveLength(21);
    const bard = one("Bard");
    expect(bard["classSkills"].filter((s: string) => s.startsWith("knowledge-"))).toHaveLength(10);
    expect(bard["classSkills"]).toContain("use-magic-device");
  });

  it("R12: competencias con armas, armaduras y escudos de cada clase", () => {
    expect(one("Druid")["proficiencies"]).toEqual({
      weapons: [
        "club",
        "dagger",
        "dart",
        "quarterstaff",
        "scimitar",
        "scythe",
        "sickle",
        "shortspear",
        "sling",
        "spear",
      ],
      armor: ["light", "medium"],
      shields: ["all-except-tower"],
    });
    expect(one("Rogue")["proficiencies"]).toEqual({
      weapons: ["simple", "hand-crossbow", "rapier", "sap", "shortbow", "short-sword"],
      armor: ["light"],
      shields: [],
    });
    expect(one("Paladin")["proficiencies"]).toEqual({
      weapons: ["simple", "martial"],
      armor: ["light", "medium", "heavy"],
      shields: ["all-except-tower"],
    });
    expect(one("Cleric")["proficiencies"].weapons).toEqual(["simple", "deity-favored-weapon"]);
    expect(one("Bard")["proficiencies"]).toEqual({
      weapons: ["simple", "longsword", "rapier", "sap", "short-sword", "shortbow", "whip"],
      armor: ["light"],
      shields: ["all-except-tower"],
    });
  });

  it("parseProficiencies falla si no reconoce las competencias con armas", () => {
    expect(() => parseProficiencies("Nothing useful here.", "x")).toThrow(/competencias/);
  });

  it("parseClassSkills falla ante una frase desconocida", () => {
    expect(() => parseClassSkills("No skills.", "x")).toThrow(/habilidades/);
  });
});

describe("parser de clases: columna special -> specialIds (R14)", () => {
  it("R14: los contadores y paréntesis de la tabla se normalizan al nombre de la capacidad", () => {
    expect(normalizeSpecialName("Smite evil 1/day")).toBe("smite evil");
    expect(normalizeSpecialName("Damage reduction 1/-")).toBe("damage reduction");
    expect(normalizeSpecialName("Sneak attack +1d6")).toBe("sneak attack");
    expect(normalizeSpecialName("Channel energy 1d6")).toBe("channel energy");
    expect(normalizeSpecialName("Wild shape (at will)")).toBe("wild shape");
    expect(normalizeSpecialName("2nd favored enemy")).toBe("favored enemy");
    expect(normalizeSpecialName("Rage power")).toBe("rage powers");
    expect(normalizeSpecialName("Lore master 3/day")).toBe("lore master");
  });

  it("R14: cada special de cada clase resuelve a un id de su clase", () => {
    for (const c of ["Druid", "Rogue", "Paladin", "Bard", "Cleric", "Ranger", "Barbarian"]) {
      const entry = one(c);
      for (const row of entry["table"]) {
        expect(row.specialIds, `${c} nivel ${row.level}`).toHaveLength(row.special.length);
        for (const id of row.specialIds) expect(id.startsWith(`${entry["id"]}.`)).toBe(true);
      }
    }
  });

  it("R14: ejemplos concretos del paladín y del bardo", () => {
    const paladin = one("Paladin");
    expect(paladin["table"][0].specialIds).toEqual([
      "paladin.aura-of-good",
      "paladin.detect-evil",
      "paladin.smite-evil",
    ]);
    expect(paladin["table"][3].specialIds).toEqual([
      "paladin.channel-positive-energy",
      "paladin.smite-evil",
    ]);
    const bard = one("Bard");
    expect(bard["table"][4].specialIds).toContain("bard.performance.inspire-courage");
    expect(bard["table"][0].special).toContain("inspire courage +1");
  });

  it("R14: un nombre sin capacidad detiene el parseo nombrándolo", () => {
    const html = read("rogue").replace("trapfinding", "lockpicking");
    expect(() => parse(input([page("Rogue", html)]))).toThrow(/lockpicking.*R14/);
  });
});

describe("parser de clases: secciones y libros (R45, R46)", () => {
  it("R45: Alternate Capstones y Favored Class Options (otros libros) se excluyen y se cuentan", () => {
    const out = parse(input([page("Druid")]));
    expect(out.counters).toMatchObject({
      "secciones de otro libro excluidas: Alternate Capstones": 1,
      "secciones de otro libro excluidas: Favored Class Options": 1,
    });
    const text = (out.entries[0] as unknown as { textEn: string }).textEn;
    expect(text).not.toContain("Chronicle of Legends");
    expect(text).not.toContain("Great Beast");
    expect(text).not.toContain("Aquatic Elf");
    expect(out.notes?.join("\n")).toContain("Chronicle of Legends");
  });

  it("R45: un encabezado desconocido detiene el parseo nombrando página y encabezado", () => {
    const html = read("druid").replace(
      /<h2 class="title">Ex-Druids/,
      '<h2 class="title">Archetypes</h2>Texto de otro libro.<h2 class="title">Ex-Druids',
    );
    let error: unknown;
    try {
      parse(input([page("Druid", html)]));
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(SectionError);
    expect((error as SectionError).heading).toBe("Archetypes");
    expect((error as SectionError).page).toBe(url("Druid"));
  });

  it("R45: una sección excluida que declare el CRB detiene el parseo en lugar de perder contenido", () => {
    const html = read("druid").replace("Chronicle of Legends pg. 28", "PRPG Core Rulebook pg. 28");
    expect(() => parse(input([page("Druid", html)]))).toThrow(/declara el CRB/);
  });

  it("R46: una página de otro libro se excluye y se lista", () => {
    const html = read("druid").replace(
      /PRPG Core Rulebook pg\. 48/,
      "Advanced Player's Guide pg. 25",
    );
    const out = parse(input([page("Druid", html)]));
    expect(out.entries).toEqual([]);
    expect(out.excluded).toEqual([
      expect.objectContaining({ url: url("Druid"), book: "Advanced Player's Guide" }),
    ]);
  });

  it("el textEn no contiene HTML y conserva la tabla y las habilidades de clase", () => {
    const text = one("Druid")["textEn"] as string;
    expect(text).not.toMatch(/<\/?[a-z]/i);
    expect(text).toContain("| Level | Base Attack Bonus |");
    expect(text).toContain("class skills are Climb (Str)");
    expect(text).toContain("**Ex-Druids**");
  });

  it("R44: dos ejecuciones producen exactamente el mismo resultado", () => {
    const a = JSON.stringify(parse(input([page("Cleric"), page("Bard")])));
    const b = JSON.stringify(parse(input([page("Cleric"), page("Bard")])));
    expect(a).toBe(b);
  });
});

describe("discover de clases", () => {
  it("el recuento esperado sale de las páginas con fuente CRB", () => {
    const pages = [page("Druid"), page("Rogue")];
    const other = page(
      "Alchemist",
      read("rogue").replace(/PRPG Core Rulebook pg\. 67/, "Advanced Player's Guide pg. 26"),
    );
    const out = discover({
      category: "classes",
      subset: undefined,
      seedPages: [...pages, other],
      config: { allowedSections: ALLOWED, slugAliases: {} },
    });
    expect(out.expectations).toEqual({ expectedCount: 2 });
  });
});
