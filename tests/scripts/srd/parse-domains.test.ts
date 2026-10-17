import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { discover, parse } from "../../../scripts/srd/parsers/domains";
import type { ParserInput, ParserPage } from "../../../scripts/srd/lib/parser-contract";
import { SectionError } from "../../../scripts/srd/lib/sections";
import { DomainSchema } from "../../../src/data/schema/domain";
import { ROOT } from "../../project/helpers";

// Fixtures: extractos reales de DomainDisplay.aspx (subdominios y lista de deidades abreviados).
const dir = resolve(ROOT, "tests", "fixtures", "srd-html", "domains");
const read = (name: string): string => readFileSync(resolve(dir, `${name}.html`), "utf8");
const page = (name: string, html = read(name.toLowerCase())): ParserPage => ({
  url: `https://www.aonprd.com/DomainDisplay.aspx?ItemName=${name}`,
  html,
  sha256: "0".repeat(64),
});
const index: ParserPage = {
  url: "https://www.aonprd.com/ClericDomains.aspx",
  html: read("cleric-domains-index"),
  sha256: "0".repeat(64),
};
const config = { allowedSections: [], slugAliases: {} };
const input = (pages: ParserPage[]): ParserInput => ({
  category: "domains",
  subset: undefined,
  pages,
  config,
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- datos JSON de prueba sin tipar
type Row = Record<string, any>;

describe("parser de dominios (R23)", () => {
  it("R23: Air tiene sus poderes y los conjuros 1-9 con cualificadores", () => {
    const out = parse(input([page("Air")]));
    const air = out.entries[0] as Row;
    expect(air).toMatchObject({
      id: "air",
      name: "Air",
      sourceRef: "PRPG Core Rulebook pg. 41",
      book: "CRB",
    });
    expect(air["grantedPowers"].map((p: Row) => [p.name, p.abilityType, p.level])).toEqual([
      ["Lightning Arc", "Sp", 1],
      ["Electricity Resistance", "Ex", 6],
    ]);
    expect(air["spells"]).toHaveLength(9);
    expect(air["spells"][0]).toEqual({
      level: 1,
      spellId: "obscuring-mist",
      name: "obscuring mist",
    });
    expect(air["spells"][6]).toEqual({
      level: 7,
      spellId: "elemental-body-iv",
      name: "elemental body IV",
      note: "air only",
    });
  });

  it("las entradas pasan el schema real y el texto no contiene HTML, fuente ni deidades", () => {
    const out = parse(input([page("Air"), page("Death"), page("Chaos")]));
    for (const entry of out.entries) {
      expect(DomainSchema.safeParse(entry).success, entry.id).toBe(true);
      const text = (entry as Row)["textEn"] as string;
      expect(text).not.toMatch(/<\/?[a-z]/i);
      expect(text).not.toContain("Apollyon");
      expect(text).not.toContain("Cloud Subdomain");
    }
  });

  it("R45: la variante 'Pharasma-Friendly Death Domain' (otra fuente) se excluye y se cuenta", () => {
    const out = parse(input([page("Death")]));
    const death = out.entries[0] as Row;
    expect(death["textEn"]).not.toContain("Pharasma-Friendly");
    expect(death["spells"].map((s: Row) => s.name)).toContain("animate dead");
    expect(out.counters).toMatchObject({
      "variantes de otra fuente excluidas": 1,
      "secciones de subdominio excluidas (otro libro)": 1,
      "secciones de variante por deidad excluidas (otro libro)": 1,
    });
  });

  it("R45: una sección de variante por deidad de otro libro se excluye (Chaos / Cayden Cailean)", () => {
    const out = parse(input([page("Chaos")]));
    expect(out.entries).toHaveLength(1);
    expect(out.counters?.["secciones de variante por deidad excluidas (otro libro)"]).toBe(1);
  });

  it("R45: un encabezado sin fuente y fuera de la lista permitida detiene el parseo", () => {
    const html = read("air").replace("</span>", '<h2 class="title">Extra</h2>Texto.</span>');
    expect(() => parse(input([page("Air", html)]))).toThrowError(SectionError);
  });

  it("R45: una sección h2 que declare el CRB no se puede excluir", () => {
    const html = read("air").replace("Advanced Player's Guide pg. 1", "PRPG Core Rulebook pg. 1");
    expect(() => parse(input([page("Air", html)]))).toThrow(/declara el CRB/);
  });

  it("una etiqueta en negrita desconocida detiene el parseo", () => {
    const html = read("air").replace(
      "<b>Domain Spells</b>",
      "<b>Domain Spells</b>: 1st—x<br><br><b>Mystery Label</b>",
    );
    expect(() => parse(input([page("Air", html)]))).toThrow();
  });

  it("R46: la página de dominio de otro libro se excluye y se lista", () => {
    const out = parse(input([page("Air"), page("Scalykind")]));
    expect(out.entries.map((e) => e.id)).toEqual(["air"]);
    expect(out.excluded).toEqual([
      expect.objectContaining({
        book: "Book of the Damned",
        url: expect.stringContaining("Scalykind"),
      }),
    ]);
  });

  it("faltan conjuros de dominio: el parseo falla", () => {
    const html = read("air").replace(/, 9th—<i>elemental swarm<\/i>[^.]*\./, ".");
    expect(() => parse(input([page("Air", html)]))).toThrow(/9/);
  });

  it("R44: dos ejecuciones producen el mismo resultado", () => {
    const pages = [page("Air"), page("Death"), page("Chaos"), page("Scalykind")];
    expect(JSON.stringify(parse(input(pages)))).toBe(JSON.stringify(parse(input(pages))));
  });
});

describe("discover de dominios", () => {
  it("el recuento esperado sale de las páginas con fuente CRB y el índice queda cubierto", () => {
    const pages = [index, page("Air"), page("Death"), page("Chaos"), page("Scalykind")];
    const out = discover({ category: "domains", subset: undefined, seedPages: pages, config });
    expect(out.expectations).toEqual({ expectedCount: 3 });
    expect(out.urls).toEqual([]);
  });

  it("un dominio del índice que falta en las semillas detiene el import", () => {
    const pages = [index, page("Air"), page("Death"), page("Chaos")];
    expect(() =>
      discover({ category: "domains", subset: undefined, seedPages: pages, config }),
    ).toThrow(/Scalykind/);
  });
});
