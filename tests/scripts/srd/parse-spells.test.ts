import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SpellSchema } from "../../../src/data/schema/spell";
import { spellListsRule } from "../../../src/data/integrity/spell-lists";
import { defaultContext, emptyDataset } from "../../../src/data/integrity/types";
import type { ParserInput, ParserPage } from "../../../scripts/srd/lib/parser-contract";
import { SectionError } from "../../../scripts/srd/lib/sections";
import {
  CRB_SOURCE_URL,
  SPELL_INDEX_URL,
  discoverSpells,
  extractCrbSpells,
  extractIndexDescriptions,
  parseSpellPage,
  parseSpells,
  spellPageUrl,
  type SpellPageDeps,
} from "../../../scripts/srd/parsers/spells";
import {
  loadSpellClassCatalog,
  parseSpellBatches,
} from "../../../scripts/srd/parsers/spells-config";
import { compareSpellToGolden, loadSpellGoldens } from "../../data/spells/golden";

const FIXTURES = resolve(__dirname, "../../fixtures/srd-html/spells");
const fixture = (name: string): string => readFileSync(resolve(FIXTURES, `${name}.html`), "utf8");

const allowedSections = (
  JSON.parse(
    readFileSync(resolve(__dirname, "../../../scripts/srd/config/section-allowlist.json"), "utf8"),
  ) as { spells: string[] }
).spells;
const catalog = loadSpellClassCatalog();
const deps: SpellPageDeps = { catalog, slugAliases: {}, allowedSections };

function page(name: string, html: string): ParserPage {
  return { url: spellPageUrl(name), html, sha256: "0".repeat(64) };
}
function parsePage(file: string, name: string, over: Partial<SpellPageDeps> = {}) {
  return parseSpellPage(page(name, fixture(file)), { ...deps, ...over });
}
function entryOf(file: string, name: string): Record<string, unknown> {
  const result = parsePage(file, name);
  if (result.kind !== "entry") throw new Error(`${name} excluido`);
  return result.entry;
}

/** Añade HTML al final del contenido del conjuro (antes de cerrar su span). */
function appendToContent(html: string, extra: string): string {
  return html.replace(/<\/span>(\s*<\/td>)/, `${extra}</span>$1`);
}

const PAGES: [string, string][] = [
  ["cure-light-wounds", "Cure Light Wounds"],
  ["cure-light-wounds-mass", "Cure Light Wounds, Mass"],
  ["burning-hands", "Burning Hands"],
  ["magic-missile", "Magic Missile"],
  ["wish", "Wish"],
  ["analyze-dweomer", "Analyze Dweomer"],
  ["bless", "Bless"],
  ["commune", "Commune"],
  ["animate-dead", "Animate Dead"],
  ["charm-person", "Charm Person"],
  ["contingency", "Contingency"],
  ["mages-magnificent-mansion", "Mage's Magnificent Mansion"],
  ["blindness-deafness", "Blindness/Deafness"],
];

describe("parseSpellPage: campos de cabecera (R20)", () => {
  it("Cure Light Wounds: escuela, subescuela, niveles de clases CRB y campos", () => {
    const e = entryOf("cure-light-wounds", "Cure Light Wounds");
    expect(e).toMatchObject({
      id: "cure-light-wounds",
      name: "Cure Light Wounds",
      book: "CRB",
      sourceRef: "PRPG Core Rulebook pg. 263",
      source: "https://www.aonprd.com/SpellDisplay.aspx?ItemName=Cure Light Wounds",
      school: "conjuration",
      subschool: "healing",
      descriptors: [],
      levels: { bard: 1, cleric: 1, druid: 1, paladin: 1, ranger: 2 },
      castingTime: { raw: "1 standard action", unit: "standard", amount: 1 },
      range: { raw: "touch", kind: "touch" },
      targeting: [{ kind: "target", raw: "creature touched" }],
      duration: { kind: "instantaneous", dismissible: false },
      savingThrow: { raw: "Will half (harmless)", kind: "will", effect: "half", harmless: true },
      spellResistance: { raw: "yes (harmless); see text", applies: "yes", harmless: true },
    });
    expect(e["textEn"]).toMatch(/^When laying your hand upon a living creature/);
  });

  it("Magic Missile: descriptor, solo sorcerer/wizard entre las claves CRB y nada de otros libros", () => {
    const result = parsePage("magic-missile", "Magic Missile");
    if (result.kind !== "entry") throw new Error("excluido");
    const e = result.entry;
    expect(e["descriptors"]).toEqual(["force"]);
    expect(e["levels"]).toEqual({ sorcerer: 1, wizard: 1 });
    expect(e["range"]).toMatchObject({ kind: "medium" });
    expect(e["savingThrow"]).toMatchObject({ raw: "none", kind: "none" });
    expect(e["targeting"]).toEqual([
      {
        kind: "target",
        raw: "up to five creatures, no two of which can be more than 15 ft. apart",
      },
    ]);
    // R45/R46: la sección «Mythic Magic Missile» (otro libro) no entra en textEn.
    const text = e["textEn"] as string;
    expect(text).toContain("A missile of magical energy darts forth");
    expect(text).not.toMatch(/Mythic|2d4\+1|Augmented/);
    expect(result.counters["secciones de otro libro excluidas"]).toBe(1);
    expect(result.counters["clases de otro libro descartadas"]).toBe(4); // R97
  });

  it("Wish: nivel 9 y componente material con coste en raw y en details", () => {
    const e = entryOf("wish", "Wish");
    expect(e["school"]).toBe("universal");
    expect(e["levels"]).toEqual({ sorcerer: 9, wizard: 9 });
    expect(e["components"]).toMatchObject({
      raw: "V, S, M (diamond worth 25,000 gp)",
      material: true,
      details: { material: "diamond worth 25,000 gp" },
    });
  });

  it("foco (F) y foco divino (DF)", () => {
    expect(entryOf("analyze-dweomer", "Analyze Dweomer")["components"]).toMatchObject({
      focus: true,
      divineFocus: false,
      details: { focus: "a ruby and gold lens worth 1,500 gp" },
    });
    expect(entryOf("bless", "Bless")["components"]).toMatchObject({
      divineFocus: true,
      focus: false,
      raw: "V, S, DF",
    });
  });

  it("campos ausentes (Commune): raw vacío y kind other; se cuentan aparte", () => {
    const result = parsePage("commune", "Commune");
    if (result.kind !== "entry") throw new Error("excluido");
    expect(result.entry["castingTime"]).toMatchObject({ unit: "minute", amount: 10 });
    expect(result.entry["savingThrow"]).toMatchObject({ raw: "", kind: "other" });
    expect(result.entry["spellResistance"]).toMatchObject({ raw: "", applies: "other" });
    expect(result.counters["campo ausente: savingThrow"]).toBe(1);
    expect(result.counters["kind other: savingThrow"]).toBeUndefined();
  });

  it("kind other conserva el raw y se anota (R96): Contingency", () => {
    const result = parsePage("contingency", "Contingency");
    if (result.kind !== "entry") throw new Error("excluido");
    expect(result.entry["castingTime"]).toEqual({
      raw: "at least 10 minutes; see text",
      unit: "other",
      amount: null,
    });
    expect(result.entry["duration"]).toMatchObject({ kind: "other", dismissible: true });
    expect(result.counters["kind other: castingTime"]).toBe(1);
    expect(result.notes.some((n) => n.includes("contingency castingTime"))).toBe(true);
  });

  it("nombres con apóstrofe o barra: ids y URL", () => {
    expect(entryOf("mages-magnificent-mansion", "Mage's Magnificent Mansion")["id"]).toBe(
      "mages-magnificent-mansion",
    );
    expect(entryOf("blindness-deafness", "Blindness/Deafness")["id"]).toBe("blindness-deafness");
  });

  it("usa la entrada pedida cuando la página trae otras (Animate Dead / Lesser) y salta spans vacíos", () => {
    const e = entryOf("animate-dead", "Animate Dead");
    expect(e["name"]).toBe("Animate Dead");
    expect(e["sourceRef"]).toBe("PRPG Core Rulebook pg. 241");
    expect(entryOf("charm-person", "Charm Person")["levels"]).toEqual({
      bard: 1,
      sorcerer: 1,
      wizard: 1,
    });
  });

  it("falla si la entrada pedida no está en la página", () => {
    expect(() => parsePage("bless", "Bane")).toThrow(/Bane/);
  });

  it("toda página CRB de las fixtures supera SpellSchema y la regla R96 (sin hallazgos)", () => {
    for (const [file, name] of PAGES) {
      const e = entryOf(file, name);
      const parsed = SpellSchema.safeParse(e);
      expect(parsed.success, `${name}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
    }
    const data = { ...emptyDataset(), entries: { spells: PAGES.map(([f, n]) => entryOf(f, n)) } };
    expect(spellListsRule(data, defaultContext())).toEqual([]);
  });

  it("es determinista (R44)", () => {
    expect(JSON.stringify(entryOf("wish", "Wish"))).toBe(JSON.stringify(entryOf("wish", "Wish")));
  });
});

describe("parseSpellPage: libro (R46)", () => {
  it("excluye un conjuro de otro libro y lo nombra (Ant Haul, Advanced Player's Guide)", () => {
    const result = parsePage("ant-haul", "Ant Haul");
    expect(result.kind).toBe("excluded");
    if (result.kind === "excluded") {
      expect(result.excluded).toMatchObject({
        url: spellPageUrl("Ant Haul"),
        book: "Advanced Player's Guide",
      });
    }
  });

  it("varias etiquetas Source en la línea principal: needsReview y sourceRef es la etiqueta CRB", () => {
    const html = fixture("magic-missile").replace(
      "<i>PRPG Core Rulebook pg. 309</i></a>",
      '<i>Ultimate Magic pg. 1</i></a>, <a href="http://paizo.com/x"><i>PRPG Core Rulebook pg. 309</i></a>',
    );
    expect(html).not.toBe(fixture("magic-missile"));
    const result = parseSpellPage(page("Magic Missile", html), deps);
    if (result.kind !== "entry") throw new Error("excluido");
    expect(result.entry["sourceRef"]).toBe("PRPG Core Rulebook pg. 309");
    expect(result.review.join(" ")).toMatch(/varias etiquetas Source/);
  });
});

describe("línea Level (R94, R97, R102)", () => {
  const withLevel = (level: string) =>
    fixture("magic-missile").replace(/<b>Level<\/b> [^<]*/, `<b>Level</b> ${level}`);

  it("R94: sor/wiz se expande a sorcerer y wizard", () => {
    const result = parseSpellPage(page("Magic Missile", withLevel("sor/wiz 1")), deps);
    if (result.kind !== "entry") throw new Error("excluido");
    expect(result.entry["levels"]).toEqual({ sorcerer: 1, wizard: 1 });
  });

  it("R94: sorcerer/wizard con otra clase CRB", () => {
    const result = parseSpellPage(
      page("Magic Missile", withLevel("cleric 2, sorcerer/wizard 3, witch 4")),
      deps,
    );
    if (result.kind !== "entry") throw new Error("excluido");
    expect(result.entry["levels"]).toEqual({ cleric: 2, sorcerer: 3, wizard: 3 });
  });

  it("R97: un token desconocido falla nombrando página y token", () => {
    expect(() =>
      parseSpellPage(page("Magic Missile", withLevel("sorcerer 1, gunslinger 2, wizard 1")), deps),
    ).toThrow(/SpellDisplay\.aspx\?ItemName=Magic Missile.*gunslinger/);
  });

  it("R102: levels vacío tras descartar otros libros -> needsReview", () => {
    const result = parseSpellPage(page("Magic Missile", withLevel("arcanist 1, witch 2")), deps);
    if (result.kind !== "entry") throw new Error("excluido");
    expect(result.entry["levels"]).toEqual({});
    expect(result.review.join(" ")).toMatch(/levels vacío/);
    expect(result.counters["conjuros con levels vacío"]).toBe(1);
    expect(result.counters["clases de otro libro descartadas"]).toBe(2);
  });
});

describe("correcciones posteriores: Target/Effect y h2 hermanos de una sección excluida", () => {
  it("la etiqueta Target/Effect (con barra) se acepta y se clasifica como other (Mislead)", () => {
    const result = parsePage("mislead", "Mislead");
    if (result.kind !== "entry") throw new Error("excluido");
    expect(result.entry["targeting"]).toEqual([{ kind: "other", raw: "you/one illusory double" }]);
    expect(SpellSchema.safeParse(result.entry).success).toBe(true);
  });

  it("una etiqueta sintética con barra y Area también se acepta; una desconocida sigue fallando", () => {
    const html = fixture("bless").replace("<b>Area</b>", "<b>Target/Area</b>");
    expect(html).not.toBe(fixture("bless"));
    expect(() => parseSpellPage(page("Bless", html), deps)).not.toThrow();
    const bad = fixture("bless").replace("<b>Area</b>", "<b>Target/Weirdness</b>");
    expect(() => parseSpellPage(page("Bless", bad), deps)).toThrow(/Weirdness/);
  });

  it("Reincarnate: los h2 sin Source tras la sección de otro libro heredan su exclusión", () => {
    const result = parsePage("reincarnate", "Reincarnate");
    if (result.kind !== "entry") throw new Error("excluido");
    expect(result.entry["name"]).toBe("Reincarnate");
    expect(result.counters["secciones de otro libro excluidas"]).toBe(3);
    expect(result.entry["textEn"]).not.toMatch(/Core Incarnations|Other Incarnations/);
    expect(SpellSchema.safeParse(result.entry).success).toBe(true);
  });

  it("sintético: h2 excluido por libro + h2 hermano sin Source -> excluido", () => {
    const html = appendToContent(
      fixture("commune"),
      '<h2 class="title">Other Edition</h2><b>Source</b> <a href="x"><i>Ultimate Magic pg. 1</i></a><br />Text.' +
        "<h2>Tables</h2>More text.<h2>More Tables</h2>Even more.",
    );
    const result = parseSpellPage(page("Commune", html), deps);
    if (result.kind !== "entry") throw new Error("excluido");
    expect(result.counters["secciones de otro libro excluidas"]).toBe(3);
  });

  it("un h2 suelto sin Source que NO sigue a una sección excluida sigue fallando (R45)", () => {
    const suelto = appendToContent(fixture("commune"), "<h2>Tables</h2>More text.");
    expect(() => parseSpellPage(page("Commune", suelto), deps)).toThrow(/Tables/);
    // Tras una sección propia permitida (CRB) tampoco se hereda nada.
    const trasCrb = appendToContent(
      fixture("commune"),
      '<h2 class="title">Variant</h2><b>Source</b> <a href="x"><i>PRPG Core Rulebook pg. 1</i></a><br />Text.',
    );
    expect(() => parseSpellPage(page("Commune", trasCrb), deps)).toThrow(/Variant/);
    // La herencia no atraviesa un h2 propio: excluido, luego uno CRB que falla, luego uno suelto.
    const orden = appendToContent(
      fixture("commune"),
      '<h2>Other</h2><b>Source</b> <a href="x"><i>Ultimate Magic pg. 1</i></a><br />Text.' +
        '<h2>Mine</h2><b>Source</b> <a href="x"><i>PRPG Core Rulebook pg. 1</i></a><br />Text.',
    );
    expect(() => parseSpellPage(page("Commune", orden), deps)).toThrow(/Mine/);
    const reinicio = appendToContent(
      fixture("commune"),
      '<h2>Other</h2><b>Source</b> <a href="x"><i>Ultimate Magic pg. 1</i></a><br />Text.',
    );
    expect(() => parseSpellPage(page("Commune", reinicio), deps)).not.toThrow();
  });
});

describe("secciones permitidas (R45)", () => {
  it("un encabezado h2 sin libro y fuera de la lista falla nombrando página y encabezado", () => {
    const html = appendToContent(
      fixture("commune"),
      '<h2 class="title">Variant Rules</h2>Some text.',
    );
    try {
      parseSpellPage(page("Commune", html), deps);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(SectionError);
      expect((error as SectionError).heading).toBe("Variant Rules");
      expect((error as SectionError).page).toBe(spellPageUrl("Commune"));
    }
  });

  it("un h3 desconocido o un h4 dentro de la descripción también falla", () => {
    const h3 = fixture("bless").replace(
      '<h3 class="framing">Description</h3>',
      '<h3 class="framing">Extras</h3><h3 class="framing">Description</h3>',
    );
    expect(() => parseSpellPage(page("Bless", h3), deps)).toThrow(/Extras/);
    const h4 = appendToContent(fixture("commune"), "<h4>Sub</h4>text");
    expect(() => parseSpellPage(page("Commune", h4), deps)).toThrow(/Sub/);
  });

  it("una etiqueta de cabecera desconocida falla", () => {
    const html = fixture("bless").replace("<b>Duration</b>", "<b>Weirdness</b>");
    expect(() => parseSpellPage(page("Bless", html), deps)).toThrow(/Weirdness/);
  });
});

describe("índices (R93)", () => {
  it("extractCrbSpells lee el filtro CRB y comprueba el recuento declarado", () => {
    const list = extractCrbSpells(fixture("index-crb-source"));
    expect(list.declared).toBe(7);
    expect(list.spells.map((s) => s.name)).toEqual([
      "Analyze Dweomer",
      "Bless",
      "Burning Hands",
      "Commune",
      "Cure Light Wounds",
      "Magic Missile",
      "Wish",
    ]);
    const broken = fixture("index-crb-source").replace("Spells [7]", "Spells [8]");
    expect(() => extractCrbSpells(broken)).toThrow(/declara 8/);
  });

  it("extractIndexDescriptions toma la descripción corta del índice completo", () => {
    const d = extractIndexDescriptions(fixture("index-all"));
    expect(d.get("Magic Missile")).toBe(
      "1d4+1 damage; +1 missile per two levels above 1st (max 5).",
    );
    expect(d.get("Cure Light Wounds")).toBe("Cures 1d8 damage + 1/level (max +5).");
    expect(d.has("Abadar's Truthtelling")).toBe(true); // otros libros también están en el índice
  });
});

const BATCHES = parseSpellBatches({
  batches: [
    { id: "a-b", from: "a", to: "b" },
    { id: "c-z", from: "c", to: "z" },
  ],
  expectedCountByBatch: { "a-b": 3, "c-z": 4 },
});

function input(subset: string | undefined, pages: ParserPage[]): ParserInput {
  return {
    category: "spells",
    subset,
    pages,
    config: { allowedSections, slugAliases: {} },
  };
}
const indexPages = (): ParserPage[] => [
  { url: SPELL_INDEX_URL, html: fixture("index-all"), sha256: "1".repeat(64) },
  { url: CRB_SOURCE_URL, html: fixture("index-crb-source"), sha256: "2".repeat(64) },
];
const batchPages = (names: [string, string][]): ParserPage[] =>
  names.map(([file, name]) => page(name, fixture(file)));
const AB: [string, string][] = [
  ["analyze-dweomer", "Analyze Dweomer"],
  ["bless", "Bless"],
  ["burning-hands", "Burning Hands"],
];
const CZ: [string, string][] = [
  ["commune", "Commune"],
  ["cure-light-wounds", "Cure Light Wounds"],
  ["magic-missile", "Magic Missile"],
  ["wish", "Wish"],
];
const parseDeps = { batches: BATCHES, catalog };

describe("parseSpells: lotes y universo (R93, R99)", () => {
  it("un lote completo produce sus entradas, el shard por inicial y la descripción corta", () => {
    const out = parseSpells(input("c-z", [...indexPages(), ...batchPages(CZ)]), parseDeps);
    expect(out.entries.map((e) => e.id)).toEqual([
      "commune",
      "cure-light-wounds",
      "magic-missile",
      "wish",
    ]);
    expect(out.shardOf!(out.entries[0]!)).toBe("spells/c.json");
    expect(out.shardOf!(out.entries[3]!)).toBe("spells/w.json");
    expect(out.entries.find((e) => e.id === "wish")!["shortDescriptionEn"]).toBe(
      "As limited wish, but with fewer limits.",
    );
    expect(out.counters!["clases de otro libro descartadas"]).toBeGreaterThan(0);
    expect(out.excluded).toEqual([]);
    for (const e of out.entries) expect(SpellSchema.safeParse(e).success).toBe(true);
  });

  it("es determinista aunque cambie el orden de las páginas (R44)", () => {
    const a = parseSpells(input("c-z", [...indexPages(), ...batchPages(CZ)]), parseDeps);
    const b = parseSpells(
      input("c-z", [...batchPages([...CZ].reverse()), ...indexPages().reverse()]),
      parseDeps,
    );
    expect(JSON.stringify(a.entries)).toBe(JSON.stringify(b.entries));
  });

  it("falla si falta una página del filtro CRB del lote", () => {
    expect(() =>
      parseSpells(input("a-b", [...indexPages(), ...batchPages(AB.slice(0, 2))]), parseDeps),
    ).toThrow(/faltan 1 página.*Burning Hands/);
  });

  it("falla si sobra una página fuera del filtro CRB (Ant Haul)", () => {
    const extra = page("Ant Haul", fixture("ant-haul"));
    expect(() =>
      parseSpells(input("a-b", [...indexPages(), ...batchPages(AB), extra]), parseDeps),
    ).toThrow(/sobran 1 página.*Ant Haul/);
  });

  it("falla si una página es de otro lote o el lote no existe", () => {
    expect(() =>
      parseSpells(input("a-b", [...indexPages(), ...batchPages(CZ)]), parseDeps),
    ).toThrow(/no coinciden con el filtro CRB/);
    expect(() => parseSpells(input("x-y", indexPages()), parseDeps)).toThrow(/desconocido/);
  });

  it("falla sin la página del filtro CRB y no inventa nada con spells:index", () => {
    expect(() => parseSpells(input("a-b", batchPages(AB)), parseDeps)).toThrow(/filtro CRB/);
    const out = parseSpells(input("index", indexPages()), parseDeps);
    expect(out.entries).toEqual([]);
  });

  it("una página CRB del filtro cuya etiqueta Source no es CRB se excluye y se lista (R46)", () => {
    const html = fixture("bless").replace("PRPG Core Rulebook pg. 249", "Ultimate Magic pg. 9");
    const out = parseSpells(
      input("a-b", [
        ...indexPages(),
        page("Analyze Dweomer", fixture("analyze-dweomer")),
        page("Bless", html),
        page("Burning Hands", fixture("burning-hands")),
      ]),
      parseDeps,
    );
    expect(out.excluded).toEqual([
      expect.objectContaining({ url: spellPageUrl("Bless"), book: "Ultimate Magic" }),
    ]);
    expect(out.entries).toHaveLength(2);
  });

  it("no reconoce URLs ajenas", () => {
    expect(() =>
      parseSpells(
        input("a-b", [...indexPages(), { url: "https://example.org/x", html: "", sha256: "3" }]),
        parseDeps,
      ),
    ).toThrow(/no reconocida/);
  });
});

describe("discoverSpells: recuentos esperados (R93, R99)", () => {
  it("spells:index devuelve expectedCount del filtro CRB y exige la config al día", () => {
    const out = discoverSpells(
      {
        category: "spells",
        subset: "index",
        seedPages: indexPages(),
        config: input(undefined, []).config,
      },
      { batches: BATCHES, catalog },
    );
    expect(out).toEqual({ urls: [], expectations: { expectedCount: 7 } });

    const stale = parseSpellBatches({
      batches: BATCHES.batches,
      expectedCountByBatch: { "a-b": 2, "c-z": 5 },
    });
    expect(() =>
      discoverSpells(
        {
          category: "spells",
          subset: "index",
          seedPages: indexPages(),
          config: input(undefined, []).config,
        },
        { batches: stale, catalog },
      ),
    ).toThrow(/desfasado/);
  });

  it("spells:index falla si un conjuro del filtro CRB no está en el índice completo", () => {
    const all = fixture("index-all");
    const at = all.indexOf('ItemName=Wish"');
    const sinWish =
      all.slice(0, all.lastIndexOf("<tr>", at)) + all.slice(all.indexOf("</tr>", at) + 5);
    expect(sinWish).not.toBe(fixture("index-all"));
    expect(() =>
      discoverSpells(
        {
          category: "spells",
          subset: "index",
          seedPages: [
            { url: SPELL_INDEX_URL, html: sinWish, sha256: "1" },
            { url: CRB_SOURCE_URL, html: fixture("index-crb-source"), sha256: "2" },
          ],
          config: input(undefined, []).config,
        },
        { batches: BATCHES, catalog },
      ),
    ).toThrow(/no están en el índice completo.*Wish/);
  });

  it("spells:<lote> congela el recuento del lote y falla si las semillas no cuadran", () => {
    const config = input(undefined, []).config;
    const ok = discoverSpells(
      { category: "spells", subset: "a-b", seedPages: batchPages(AB), config },
      { batches: BATCHES, catalog },
    );
    expect(ok).toEqual({ urls: [], expectations: { expectedCountByBatch: { "a-b": 3 } } });
    expect(() =>
      discoverSpells(
        { category: "spells", subset: "a-b", seedPages: batchPages(AB.slice(1)), config },
        { batches: BATCHES, catalog },
      ),
    ).toThrow(/2 semilla.*espera 3/);
    expect(() =>
      discoverSpells(
        { category: "spells", subset: "a-b", seedPages: batchPages(CZ.slice(0, 3)), config },
        { batches: BATCHES, catalog },
      ),
    ).toThrow(/no pertenece al lote a-b/);
    expect(() =>
      discoverSpells({ category: "spells", subset: undefined, seedPages: [], config }, parseDeps),
    ).toThrow(/por lote/);
  });
});

describe("goldens de conjuros sobre las fixtures (R20)", () => {
  const goldens = loadSpellGoldens();
  const files: Record<string, [string, string]> = {
    "cure-light-wounds": ["cure-light-wounds", "Cure Light Wounds"],
    "magic-missile": ["magic-missile", "Magic Missile"],
    "burning-hands": ["burning-hands", "Burning Hands"],
    wish: ["wish", "Wish"],
  };
  it.each(Object.entries(files))("%s coincide con su golden", (id, [file, name]) => {
    expect(compareSpellToGolden(entryOf(file, name), goldens[id]!)).toEqual([]);
  });
});
