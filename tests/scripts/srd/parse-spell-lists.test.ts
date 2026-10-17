import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { ParserInput, ParserPage } from "../../../scripts/srd/lib/parser-contract";
import {
  CLASS_LIST_URLS,
  extractClassListLinks,
  parse,
} from "../../../scripts/srd/parsers/spell-lists";
import { CRB_SOURCE_URL } from "../../../scripts/srd/parsers/spells";
import { CASTER_CLASS_IDS, SpellListsSchema } from "../../../src/data/schema/spell-list";

// R21: parser de las listas por clase de Archives of Nethys, sobre la fixture recortada de la lista
// de clérigo (marcado real; incluye conjuros de otros libros) y variantes sintéticas.

const FIXTURES = resolve(__dirname, "../../fixtures/srd-html/spells");
const fixture = (name: string): string => readFileSync(resolve(FIXTURES, `${name}.html`), "utf8");

const CLERIC_HTML = fixture("class-list-cleric");
const CRB_HTML = fixture("index-crb-source");

function page(url: string, html: string): ParserPage {
  return { url, html, sha256: "0".repeat(64) };
}

function input(overrides: Partial<Record<string, string>> = {}): ParserInput {
  const pages = [page(CRB_SOURCE_URL, CRB_HTML)];
  for (const classId of CASTER_CLASS_IDS) {
    pages.push(page(CLASS_LIST_URLS[classId], overrides[classId] ?? CLERIC_HTML));
  }
  return {
    category: "spell-lists",
    subset: undefined,
    pages,
    config: { allowedSections: [], slugAliases: {} },
  };
}

describe("extractClassListLinks (R21)", () => {
  it("lee nivel y nombre de cada enlace, incluidos los de marcado roto con <sup>", () => {
    const links = extractClassListLinks(CLERIC_HTML, "fixture");
    expect(links.slice(0, 6)).toEqual([
      { name: "Bleed", level: 0 },
      { name: "Detect Magic", level: 0 },
      { name: "Guidance", level: 0 },
      { name: "Light", level: 0 },
      { name: "Abadar's Truthtelling", level: 1 },
      { name: "Bless", level: 1 },
    ]);
    expect(links.at(-1)).toEqual({ name: "Abeyance", level: 2 });
  });

  it("falla con un encabezado de nivel desconocido, con un conjuro antes del primer encabezado y sin conjuros", () => {
    const unknown = CLERIC_HTML.replace("1st-Level", "First-Level");
    expect(() => extractClassListLinks(unknown, "u")).toThrow(/First-Level/);
    const before = CLERIC_HTML.replace(
      /<h2 class="title">0-Level<\/h2>/,
      '<a href="SpellDisplay.aspx?ItemName=Zap">Zap</a><h2 class="title">0-Level</h2>',
    );
    expect(() => extractClassListLinks(before, "u")).toThrow(/antes de un encabezado/);
    expect(() => extractClassListLinks("<html><body></body></html>", "u")).toThrow(/contenedor/);
  });
});

describe("parse (spell-lists, R21)", () => {
  it("filtra por el universo CRB, descarta y cuenta los conjuros de otros libros", () => {
    const out = parse(input());
    // Solo Bless y Cure Light Wounds están en el filtro CRB recortado de la fixture.
    const cleric = (out.record as Record<string, Record<string, string[]>>)["cleric"]!;
    expect(cleric).toEqual({ "1": ["bless", "cure-light-wounds"] });
    expect(out.counters?.["conjuros CRB (cleric)"]).toBe(2);
    expect(out.counters?.["descartados (cleric)"]).toBe(10);
    expect(out.counters?.["conjuros de otro libro descartados"]).toBe(10 * 5);
    expect(out.notes?.join("\n")).toContain("cleric: descartados de otros libros: Bleed;");
    expect(out.entries).toEqual([]);
  });

  it("produce un registro que cumple SpellListsSchema, con las 5 clases y sin sorcerer/wizard", () => {
    const out = parse(input());
    expect(Object.keys(out.record as object)).toEqual([...CASTER_CLASS_IDS]);
    expect(SpellListsSchema.safeParse(out.record).success).toBe(true);
  });

  it("es determinista", () => {
    expect(parse(input())).toEqual(parse(input()));
  });

  it("falla sin la página del filtro CRB, con una lista que falta y con una página desconocida", () => {
    const base = input();
    expect(() => parse({ ...base, pages: base.pages.slice(1) })).toThrow(/filtro CRB/);
    expect(() => parse({ ...base, pages: base.pages.slice(0, -1) })).toThrow(/ranger/);
    expect(() =>
      parse({
        ...base,
        pages: [...base.pages, page("https://www.aonprd.com/Spells.aspx?Class=Witch", "")],
      }),
    ).toThrow(/no reconocida/);
  });

  it("falla ante un conjuro repetido en la misma lista", () => {
    const dup = CLERIC_HTML.replace(
      /<h2 class="title">2nd-Level<\/h2>/,
      '<a href="SpellDisplay.aspx?ItemName=Bless">Bless</a><h2 class="title">2nd-Level</h2>',
    );
    expect(() => parse(input({ cleric: dup }))).toThrow(/dos veces/);
  });
});
