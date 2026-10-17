import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { ParserInput, ParserPage } from "../../../scripts/srd/lib/parser-contract";
import { SectionError } from "../../../scripts/srd/lib/sections";
import { CRB_SOURCE_URL } from "../../../scripts/srd/parsers/race-skill-common";
import { discover, parse } from "../../../scripts/srd/parsers/races";
import { RaceSchema } from "../../../src/data/schema/race";
import { ROOT } from "../../project/helpers";

// Fixtures: páginas reales de Archives of Nethys (contenido del `span` de la raza, con las subrazas, los
// rasgos alternativos y las opciones de clase predilecta recortados) y el extracto real «Races [7]» de la
// página de fuente CRB. Los recuentos de la fuente no se tocan.
const dir = resolve(ROOT, "tests", "fixtures", "srd-html", "races");
const read = (name: string): string => readFileSync(resolve(dir, `${name}.html`), "utf8");
const raceUrl = (name: string): string => `https://aonprd.com/RacesDisplay.aspx?ItemName=${name}`;
const page = (url: string, html: string): ParserPage => ({ url, html, sha256: "0".repeat(64) });

const ALLOWED = [
  "Racial Traits",
  "Subraces",
  "Alternate Racial Trait",
  "Alternate Racial Traits",
  "Favored Class Options",
];
const FIXTURES: Record<string, string> = {
  Dwarf: "dwarf",
  Gnome: "gnome",
  "Half-Elf": "half-elf",
  Human: "human",
};

function input(pages: ParserPage[]): ParserInput {
  return {
    category: "races",
    subset: undefined,
    pages,
    config: { allowedSections: ALLOWED, slugAliases: {} },
  };
}
const allPages = (): ParserPage[] =>
  Object.entries(FIXTURES).map(([name, file]) => page(raceUrl(name), read(file)));
const parsed = (): Record<string, Record<string, unknown>> =>
  Object.fromEntries(parse(input(allPages())).entries.map((e) => [e.id, e]));

describe("discover de razas (R15, R26)", () => {
  const sourcePage = page(CRB_SOURCE_URL, read("crb-source-extract"));
  const config = { allowedSections: ALLOWED, slugAliases: {} };

  it("R15/R26: las 7 razas de «Races [7]» y su recuento congelable", () => {
    const found = discover({
      category: "races",
      subset: undefined,
      seedPages: [sourcePage],
      config,
    });
    expect(found.expectations).toEqual({ expectedCount: 7 });
    expect(found.urls).toEqual(
      ["Dwarf", "Elf", "Gnome", "Half-Elf", "Halfling", "Half-Orc", "Human"].map(raceUrl),
    );
  });

  it("sin la página de fuente no descubre nada; con un recuento incoherente falla", () => {
    expect(discover({ category: "races", subset: undefined, seedPages: [], config }).urls).toEqual(
      [],
    );
    const wrong = page(
      CRB_SOURCE_URL,
      read("crb-source-extract").replace("Races [7]", "Races [8]"),
    );
    expect(() =>
      discover({ category: "races", subset: undefined, seedPages: [wrong], config }),
    ).toThrow(/declara 8 razas pero lista 7/);
    const missing = page(CRB_SOURCE_URL, "<html><body><h2>Feats [1]</h2></body></html>");
    expect(() =>
      discover({ category: "races", subset: undefined, seedPages: [missing], config }),
    ).toThrow(/no tiene la sección "Races \[N\]"/);
  });
});

describe("parser de razas (R15, R45, R46)", () => {
  it("R2/R15: todas las entradas pasan el schema real y son del CRB", () => {
    const out = parse(input(allPages()));
    expect(out.entries.map((e) => e.id).sort()).toEqual(["dwarf", "gnome", "half-elf", "human"]);
    for (const entry of out.entries) {
      const result = RaceSchema.safeParse(entry);
      expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
      expect(entry["book"]).toBe("CRB");
      expect(String(entry["sourceRef"])).toMatch(/^PRPG Core Rulebook pg\. \d+$/);
      expect(String(entry["textEn"])).not.toMatch(/<[a-z]/i);
    }
  });

  it("R15: Dwarf (+2 Con, +2 Wis, -2 Cha; Medium; 20 ft; Common y Dwarven)", () => {
    const dwarf = parsed()["dwarf"]!;
    expect(dwarf["sourceRef"]).toBe("PRPG Core Rulebook pg. 21");
    expect(dwarf["abilityModifiers"]).toEqual({ con: 2, wis: 2, cha: -2 });
    expect(dwarf["abilityChoice"]).toBeUndefined();
    expect(dwarf["size"]).toBe("Medium");
    expect(dwarf["baseSpeedFt"]).toBe(20);
    expect(dwarf["languages"]).toEqual({
      automatic: ["Common", "Dwarven"],
      bonus: ["Giant", "Gnome", "Goblin", "Orc", "Terran", "Undercommon"],
      bonusAny: false,
    });
    const names = (dwarf["traits"] as { name: string }[]).map((t) => t.name);
    expect(names).toEqual([
      "+2 Constitution, +2 Wisdom, –2 Charisma",
      "Medium",
      "Slow and Steady",
      "Darkvision",
      "Defensive Training",
      "Greed",
      "Hatred",
      "Hardy",
      "Stability",
      "Stonecunning",
      "Weapon Familiarity",
      "Languages",
    ]);
  });

  it("R15: Gnome es Small con 20 ft; los hechizos de Gnome Magic conservan su texto sin HTML", () => {
    const gnome = parsed()["gnome"]!;
    expect(gnome["abilityModifiers"]).toEqual({ con: 2, cha: 2, str: -2 });
    expect(gnome["size"]).toBe("Small");
    expect(gnome["baseSpeedFt"]).toBe(20);
    expect(String(gnome["textEn"])).toContain("*dancing lights*");
  });

  it("R15: Human y Half-Elf eligen un +2 (sin modificadores fijos) y cualquier idioma extra", () => {
    for (const id of ["human", "half-elf"]) {
      const race = parsed()[id]!;
      expect(race["abilityModifiers"], id).toEqual({});
      expect(race["abilityChoice"], id).toEqual({ amount: 2 });
      expect((race["languages"] as { bonusAny: boolean }).bonusAny, id).toBe(true);
      expect((race["languages"] as { bonus: string[] }).bonus, id).toEqual([]);
      expect(race["baseSpeedFt"], id).toBe(30);
    }
    expect((parsed()["human"]!["languages"] as { automatic: string[] }).automatic).toEqual([
      "Common",
    ]);
  });

  it("R7/Q13: cada raza declara varias etiquetas Source y queda needsReview; el sourceRef es el del CRB", () => {
    const out = parse(input(allPages()));
    expect(out.needsReview.map((n) => n.id).sort()).toEqual([
      "dwarf",
      "gnome",
      "half-elf",
      "human",
    ]);
    expect(out.needsReview[0]!.reason).toContain("PRPG Core Rulebook");
    expect(out.counters!["razas con varias etiquetas Source"]).toBe(4);
    expect(out.notes!.join("\n")).toContain("Human: su idioma étnico");
  });

  it("R27/R46: las subrazas y los rasgos alternativos de otros libros se excluyen y se cuentan", () => {
    const out = parse(input(allPages()));
    const text = out.entries.map((e) => String(e["textEn"])).join("\n");
    expect(text).not.toContain("Advanced Race Guide");
    expect(text).not.toContain("Deep Delver");
    expect(text).not.toContain("Replaces");
    expect(out.counters!["subrazas de otros libros excluidas"]).toBeGreaterThan(0);
    expect(out.counters!["rasgos raciales alternativos de otros libros excluidos"]).toBeGreaterThan(
      0,
    );
    expect(out.counters!["grupos de clase predilecta excluidos"]).toBe(4);
  });

  it("R8: el textEn lleva la descripción y todos los rasgos en Markdown", () => {
    const dwarf = String(parsed()["dwarf"]!["textEn"]);
    expect(dwarf.startsWith("Dwarves are a stoic but stern race")).toBe(true);
    expect(dwarf).toContain("**Physical Description**:");
    expect(dwarf).toContain("**Racial Traits**");
    expect(dwarf).toContain("**Hardy**: Dwarves receive a +2 racial bonus on saving throws");
  });

  it("R45: un encabezado h1 desconocido falla nombrando la página y el encabezado", () => {
    const html = read("dwarf").replace(
      '<h1 class="title">Subraces</h1>',
      '<h1 class="title">Dwarf Mythic Traits</h1>',
    );
    const url = raceUrl("Dwarf");
    expect(() => parse(input([page(url, html)]))).toThrow(SectionError);
    expect(() => parse(input([page(url, html)]))).toThrow(
      new RegExp(`Mythic Traits.*${url.replace(/[?.]/g, "\\$&")}|${url.replace(/[?.]/g, "\\$&")}`),
    );
  });

  it("R45: un grupo de otro libro que declare el CRB, o un h2 dentro de los rasgos, falla", () => {
    const sneaky = read("dwarf").replace(
      '<h1 class="title">Dwarf Favored Class Options</h1>',
      '<h1 class="title">Dwarf Favored Class Options</h1>(PRPG Core Rulebook pg. 21) ',
    );
    expect(() => parse(input([page(raceUrl("Dwarf"), sneaky)]))).toThrow(/declara el CRB/);
    const nested = read("dwarf").replace(
      '<h1 class="title">Subraces</h1>',
      '<h2 class="title">Extra</h2><h1 class="title">Subraces</h1>',
    );
    expect(() => parse(input([page(raceUrl("Dwarf"), nested)]))).toThrow(SectionError);
  });

  it("R46: una página que no declara el CRB se excluye y se lista", () => {
    const html = read("dwarf").replaceAll("PRPG Core Rulebook", "Advanced Race Guide");
    const out = parse(input([page(raceUrl("Dwarf"), html)]));
    expect(out.entries).toEqual([]);
    expect(out.excluded).toHaveLength(1);
    expect(out.excluded[0]!.url).toBe(raceUrl("Dwarf"));
    expect(out.excluded[0]!.book).toContain("Advanced Race Guide");
  });

  it("un rasgo de modificadores o de idiomas no reconocido falla con la página", () => {
    const badMods = read("dwarf").replace("+2 Constitution, +2 Wisdom, –2 Charisma", "+2 Luck");
    expect(() => parse(input([page(raceUrl("Dwarf"), badMods)]))).toThrow(
      /modificadores de característica no reconocidos/,
    );
    const badLang = read("dwarf").replace("begin play speaking", "start speaking");
    expect(() => parse(input([page(raceUrl("Dwarf"), badLang)]))).toThrow(/idiomas iniciales/);
  });

  it("R44: dos ejecuciones producen el mismo resultado", () => {
    expect(JSON.stringify(parse(input(allPages())))).toBe(JSON.stringify(parse(input(allPages()))));
  });
});
