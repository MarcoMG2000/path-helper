import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CRB_SOURCE_URL,
  crbFeatIndex,
  discover,
  expandTables,
  featNamesOfListing,
  featPageUrl,
  parse,
  structurePrerequisites,
  tokenizePrerequisites,
  type FeatNames,
} from "../../../scripts/srd/parsers/feats";
import { loadHtml, nodesToMarkdown } from "../../../scripts/srd/lib/html";
import type { ParserInput, ParserPage } from "../../../scripts/srd/lib/parser-contract";
import { SectionError } from "../../../scripts/srd/lib/sections";
import { FeatSchema, type Feat } from "../../../src/data/schema/feat";
import { ROOT } from "../../project/helpers";

// Fixtures: páginas reales de Archives of Nethys (contenido de `MainContent_DataListTypes_LabelName_0`
// copiado tal cual, sin la cabecera de la web) y extractos reales del índice de fuente CRB y de los
// listados por tipo. El recuento de «Feats [N]» del extracto se ajusta al número de enlaces que conserva.
const dir = resolve(ROOT, "tests", "fixtures", "srd-html", "feats");
const read = (name: string): string => readFileSync(resolve(dir, `${name}.html`), "utf8");
const page = (url: string, html: string): ParserPage => ({ url, html, sha256: "0".repeat(64) });

const ALLOWED = ["Source", "Prerequisites", "Prerequisite", "Benefit", "Normal", "Special"];
const ALIASES = {
  feats: {
    "light-armor-proficiency": "armor-proficiency-light",
    "medium-armor-proficiency": "armor-proficiency-medium",
    "heavy-armor-proficiency": "armor-proficiency-heavy",
  },
};

const CRB_FIXTURES: Record<string, string> = {
  "Power Attack": "power-attack",
  Cleave: "cleave",
  "Great Cleave": "great-cleave",
  "Mounted Combat": "mounted-combat",
  "Empower Spell": "empower-spell",
  "Improved Initiative": "improved-initiative",
  "Armor Proficiency, Heavy": "armor-proficiency-heavy",
  "Armor Proficiency, Light": "armor-proficiency-light",
  "Armor Proficiency, Medium": "armor-proficiency-medium",
  "Augment Summoning": "augment-summoning",
  "Alignment Channel": "alignment-channel",
  "Acrobatic Steps": "acrobatic-steps",
  Alertness: "alertness",
  "Extra Channel": "extra-channel",
  "Rapid Reload": "rapid-reload",
  "Greater Weapon Focus": "greater-weapon-focus",
  "Weapon Focus": "weapon-focus",
};

function pages(extra: ParserPage[] = [], options: { listings?: boolean } = {}): ParserPage[] {
  const list: ParserPage[] = [page(CRB_SOURCE_URL, read("crb-source-extract"))];
  for (const [name, file] of Object.entries(CRB_FIXTURES)) {
    list.push(page(featPageUrl(name), read(file)));
  }
  if (options.listings !== false) {
    list.push(
      page("https://aonprd.com/Feats.aspx?Category=Combat", read("listing-combat")),
      page("https://aonprd.com/Feats.aspx?Category=Metamagic", read("listing-metamagic")),
    );
  }
  return [...list, ...extra];
}

function input(list: ParserPage[]): ParserInput {
  return {
    category: "feats",
    subset: undefined,
    pages: list,
    config: { allowedSections: ALLOWED, slugAliases: ALIASES },
  };
}

const out = parse(input(pages()));
const byId = new Map(out.entries.map((e) => [e.id, e]));
const entry = (id: string): Feat => {
  const e = byId.get(id);
  if (!e) throw new Error(`falta ${id}`);
  return FeatSchema.parse(e);
};

describe("parser de dotes: universo y descubrimiento (R17, R26, R27)", () => {
  it("R17: lee la sección «Feats [N]» de la página de fuente CRB y no la de otras tablas", () => {
    const index = crbFeatIndex(page(CRB_SOURCE_URL, read("crb-source-extract")))!;
    expect(index.declaredCount).toBe(17);
    expect(index.names).toHaveLength(17);
    expect(index.names).toContain("Armor Proficiency, Heavy");
    expect(index.names).not.toContain("Absorbing Shield");
  });

  it("R26: discover devuelve las URLs de la sección y el recuento declarado", () => {
    const found = discover({
      category: "feats",
      subset: undefined,
      seedPages: [page(CRB_SOURCE_URL, read("crb-source-extract"))],
      config: { allowedSections: ALLOWED, slugAliases: {} },
    });
    expect(found.expectations).toEqual({ expectedCount: 17 });
    expect(found.urls).toContain("https://aonprd.com/FeatDisplay.aspx?ItemName=Power%20Attack");
    expect(found.urls).toContain(
      "https://aonprd.com/FeatDisplay.aspx?ItemName=Armor%20Proficiency%2C%20Heavy",
    );
    expect(found.urls).toHaveLength(17);
  });

  it("R26: un recuento declarado distinto del número de enlaces falla", () => {
    const html = read("crb-source-extract").replace("Feats [17]", "Feats [18]");
    expect(() =>
      discover({
        category: "feats",
        subset: undefined,
        seedPages: [page(CRB_SOURCE_URL, html)],
        config: { allowedSections: ALLOWED, slugAliases: {} },
      }),
    ).toThrow(/declara 18 dotes pero lista 17/);
  });

  it("con subconjunto no se descubre nada", () => {
    expect(
      discover({ category: "feats", subset: "x", seedPages: [], config: input([]).config }).urls,
    ).toEqual([]);
  });

  it("los listados por tipo se leen por la primera dote de cada fila", () => {
    const names = featNamesOfListing(
      page("https://aonprd.com/Feats.aspx?Category=Combat", read("listing-combat")),
    );
    expect(names).toContain("Power Attack");
    expect(names).toHaveLength(11);
  });

  it("R27/R46: una página de otro libro o vacía se excluye y se lista", () => {
    const result = parse(
      input(
        pages([
          page(featPageUrl("Abeyance"), read("abeyance")),
          page(featPageUrl("Bloody Frenzy Style"), read("bloody-frenzy-style")),
        ]),
      ),
    );
    expect(result.entries).toHaveLength(17);
    expect(result.excluded.map((e) => e.url).sort()).toEqual([
      featPageUrl("Abeyance"),
      featPageUrl("Bloody Frenzy Style"),
    ]);
    expect(result.excluded.find((e) => e.url.endsWith("Abeyance"))?.book).not.toMatch(
      /Core Rulebook/,
    );
    expect(result.excluded.find((e) => e.url.endsWith("Style"))?.book).toBe("(sin contenido)");
  });

  it("R27: una página con etiqueta CRB que el índice no lista detiene el parseo", () => {
    const html = read("power-attack");
    expect(() => parse(input(pages([page(featPageUrl("Extra Feat"), html)])))).toThrow(
      /ausente del índice «Feats \[N\]»/,
    );
  });

  it("R26: una dote listada sin página en la procedencia detiene el parseo", () => {
    const list = pages().filter((p) => !p.url.endsWith("Alertness"));
    expect(() => parse(input(list))).toThrow(/falta su página en la procedencia: Alertness/);
  });

  it("R27: una dote listada cuya página no es del CRB detiene el parseo", () => {
    const list = pages().map((p) =>
      p.url.endsWith("Alertness") ? page(p.url, read("abeyance")) : p,
    );
    expect(() => parse(input(list))).toThrow(/listada como CRB pero sin etiqueta Source CRB/);
  });

  it("sin la página de fuente CRB no hay universo", () => {
    expect(() => parse(input(pages().slice(1)))).toThrow(/falta en la procedencia la página/);
  });
});

describe("parser de dotes: entradas (R17)", () => {
  it("R17: las 17 dotes pasan FeatSchema (R2, R3, R7, R8)", () => {
    expect(out.entries).toHaveLength(17);
    for (const e of out.entries) {
      expect(FeatSchema.safeParse(e).success, e.id).toBe(true);
    }
  });

  it("R17: Power Attack (golden del spec: Str 13, BAB +1) con texto íntegro y sin otros libros", () => {
    const e = entry("power-attack");
    expect(e["types"]).toEqual(["Combat"]);
    expect(e["sourceRef"]).toBe("PRPG Core Rulebook pg. 131");
    expect(e["source"]).toBe("https://aonprd.com/FeatDisplay.aspx?ItemName=Power%20Attack");
    expect(e["prerequisites"]).toEqual({
      raw: "Str 13, base attack bonus +1.",
      abilities: { str: 13 },
      bab: 1,
      featIds: [],
      skills: [],
      other: [],
    });
    expect(e["benefit"]).toMatch(/^You can choose to take a –1 penalty on all melee attack rolls/);
    expect(e["benefit"]).toContain(
      "When your base attack bonus reaches +4, and every 4 points thereafter",
    );
    expect(e["benefit"]).toMatch(/touch attacks or effects that do not deal hit point damage\.$/);
    expect(e["textEn"]).toContain("You can make exceptionally deadly melee attacks");
    expect(e["textEn"]).toContain("**Prerequisites**: Str 13, base attack bonus +1.");
    expect(e["textEn"]).toContain("**Benefit**: You can choose to take a –1 penalty");
    // El contenido de otros libros (Pathfinder Unchained, mítico) no entra en los datos.
    expect(e["textEn"]).not.toMatch(/Combat Trick|stamina|mythic power|Mythic/i);
    expect(e["normal"]).toBeUndefined();
  });

  it("R17/R18: Cleave exige Str 13 y Power Attack; Great Cleave exige Cleave y Power Attack (goldens)", () => {
    const cleave = entry("cleave")["prerequisites"];
    expect(cleave.abilities).toEqual({ str: 13 });
    expect(cleave.featIds).toEqual(["power-attack"]);
    // La fuente añade «base attack bonus +1», que el golden del spec no menciona (discrepancia menor).
    expect(cleave.bab).toBe(1);
    const great = entry("great-cleave")["prerequisites"];
    expect(great.abilities).toEqual({ str: 13 });
    expect(great.featIds).toEqual(["cleave", "power-attack"]);
    expect(great.bab).toBe(4);
  });

  it("R17: habilidad con rangos (Mounted Combat: Ride 1 rank)", () => {
    expect(entry("mounted-combat")["prerequisites"].skills).toEqual([
      { skillId: "ride", ranks: 1 },
    ]);
  });

  it("R17: dote metamágica sin prerrequisitos", () => {
    const e = entry("empower-spell");
    expect(e["types"]).toEqual(["Metamagic"]);
    expect(e["prerequisites"]).toEqual({ raw: "", featIds: [], skills: [], other: [] });
  });

  it("R17: una dote sin etiqueta de tipo es General", () => {
    expect(entry("alertness")["types"]).toEqual(["General"]);
    expect(entry("acrobatic-steps")["types"]).toEqual(["General"]);
  });

  it("R17: Normal y Special se separan de Benefit", () => {
    const e = entry("armor-proficiency-heavy");
    expect(e["benefit"]).toBe("See Armor Proficiency, Light.");
    expect(e["normal"]).toBe("See Armor Proficiency, Light.");
    expect(e["special"]).toMatch(
      /^Fighters and paladins automatically have Heavy Armor Proficiency/,
    );
  });

  it("R17: «Light/Medium Armor Proficiency» se resuelve a las dotes con el alias declarado", () => {
    expect(entry("armor-proficiency-heavy")["prerequisites"].featIds).toEqual([
      "armor-proficiency-light",
      "armor-proficiency-medium",
    ]);
    expect(entry("armor-proficiency-heavy")["prerequisites"].other).toEqual([]);
  });

  it("R17: un enlace con calificador (Spell Focus (conjuration)) deja la dote y el texto completo", () => {
    const p = entry("augment-summoning")["prerequisites"];
    expect(p.featIds).toEqual(["spell-focus"]);
    expect(p.other).toEqual(["Spell Focus (conjuration)"]);
    expect(p.raw).toBe("Spell Focus (conjuration).");
  });

  it("R17: lo no estructurable va a other y raw se conserva literal", () => {
    const p = entry("alignment-channel")["prerequisites"];
    expect(p).toEqual({
      raw: "Ability to channel energy.",
      featIds: [],
      skills: [],
      other: ["Ability to channel energy"],
    });
    const steps = entry("acrobatic-steps")["prerequisites"];
    expect(steps.raw).toBe("Dex 15, Nimble Moves.");
    expect(steps.abilities).toEqual({ dex: 15 });
    expect(steps.featIds).toEqual(["nimble-moves"]);
  });

  it("R2/R6: source es la URL de la página y sourceRef la etiqueta CRB", () => {
    for (const e of out.entries) {
      expect(String(e["source"])).toMatch(/^https:\/\/aonprd\.com\/FeatDisplay\.aspx\?ItemName=/);
      expect(String(e["sourceRef"])).toMatch(/^PRPG Core Rulebook pg\. \d+$/);
    }
  });

  it("shardOf reparte por inicial del id", () => {
    expect(out.shardOf!(entry("power-attack") as never)).toBe("feats/p.json");
    expect(out.shardOf!(entry("armor-proficiency-heavy") as never)).toBe("feats/a.json");
  });

  it("R17: dotes reales con varias etiquetas Source (Extra Channel, Rapid Reload) quedan en needsReview", () => {
    expect(out.needsReview.map((n) => n.id)).toEqual(["extra-channel", "rapid-reload"]);
    expect(out.needsReview[1]!.reason).toBe(
      "varias etiquetas Source: Ultimate Combat pg. 115, Inner Sea World Guide pg. 288, PRPG Core Rulebook pg. 132",
    );
    expect(entry("extra-channel").sourceRef).toBe("PRPG Core Rulebook pg. 123");
    expect(entry("rapid-reload").sourceRef).toBe("PRPG Core Rulebook pg. 132");
  });

  it("segunda lectura de types: coincide con los listados por tipo", () => {
    expect(out.counters!["dotes con segunda lectura de tipo distinta"]).toBe(0);
  });

  it("segunda lectura de types: una discrepancia con el listado marca needsReview", () => {
    const wrongListing = read("listing-combat").replace(
      /<tr[^>]*>\s*<td>(?:(?!<\/tr>)[\s\S])*?ItemName=Power Attack"[\s\S]*?<\/tr>/,
      "",
    );
    const list = pages().map((p) =>
      p.url.endsWith("Category=Combat") ? page(p.url, wrongListing) : p,
    );
    const result = parse(input(list));
    expect(result.needsReview.map((n) => n.id)).toContain("power-attack");
    expect(result.entries.find((e) => e.id === "power-attack")).toBeDefined();
  });

  it("R44: el resultado no depende del orden de las páginas", () => {
    const reversed = parse(input([...pages()].reverse()));
    expect(JSON.stringify(reversed)).toBe(JSON.stringify(out));
  });
});

describe("parser de dotes: varias etiquetas Source y secciones (R45, R46)", () => {
  it("una dote CRB con varias etiquetas Source en el bloque principal marca needsReview", () => {
    const html = read("alertness").replace(
      "</i></a><br />",
      '</i></a>, <a href="http://paizo.com/x" class="external-link"><i>Advanced Player\'s Guide pg. 1</i></a><br />',
    );
    const list = pages().map((p) => (p.url.endsWith("Alertness") ? page(p.url, html) : p));
    const result = parse(input(list));
    const flagged = result.needsReview.find((n) => n.id === "alertness");
    expect(flagged?.reason).toMatch(/varias etiquetas Source/);
    expect(result.entries.find((e) => e.id === "alertness")?.["sourceRef"]).toBe(
      "PRPG Core Rulebook pg. 117",
    );
    expect(result.counters!["dotes con varias etiquetas Source"]).toBe(3);
  });

  it("R45: una etiqueta en negrita desconocida al inicio de párrafo detiene el parseo con página y etiqueta", () => {
    const html = read("alertness").replace("<h2", "<br /><br /><b>Drawback</b>: extra.<h2");
    const list = pages().map((p) => (p.url.endsWith("Alertness") ? page(p.url, html) : p));
    let error: unknown;
    try {
      parse(input(list));
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(SectionError);
    expect((error as SectionError).heading).toBe("Drawback");
    expect((error as SectionError).page).toBe(featPageUrl("Alertness"));
  });

  it("R45: una sección h2 sin Source (o con Source CRB) detiene el parseo", () => {
    const html = read("alertness").replace(
      /<h2 class="title">Mythic Alertness<\/h2>/,
      '<h2 class="title">Variante rara</h2>',
    );
    const list = pages().map((p) => (p.url.endsWith("Alertness") ? page(p.url, html) : p));
    // el Source del h2 sigue siendo Mythic Adventures: se acepta; sin Source falla
    expect(() => parse(input(list))).not.toThrow();
    const noSource = html.replace(
      /<b>Source<\/b> <a[^>]*><i>Mythic Adventures[^<]*<\/i><\/a><br \/>/,
      "",
    );
    const bad = pages().map((p) => (p.url.endsWith("Alertness") ? page(p.url, noSource) : p));
    expect(() => parse(input(bad))).toThrow(SectionError);
  });

  it("R45: sin la etiqueta Benefit no se acepta la dote", () => {
    const html = read("alertness").replace("<b>Benefit</b>", "<b>Special</b>");
    const list = pages().map((p) => (p.url.endsWith("Alertness") ? page(p.url, html) : p));
    expect(() => parse(input(list))).toThrow(/Benefit \(ausente\)/);
  });

  it("R17: un tipo de dote desconocido en el título detiene el parseo", () => {
    const html = read("alertness").replace("Alertness</h1>", "Alertness (Teamwork)</h1>");
    const list = pages().map((p) => (p.url.endsWith("Alertness") ? page(p.url, html) : p));
    expect(() => parse(input(list))).toThrow(/no es un tipo de dote del CRB/);
  });
});

describe("prerrequisitos: tokenización y estructura (R17)", () => {
  const feats: FeatNames = {
    byName: new Map([
      ["power attack", "power-attack"],
      ["combat expertise", "combat-expertise"],
      ["armor proficiency, heavy", "armor-proficiency-heavy"],
      ["weapon focus", "weapon-focus"],
    ]),
    ids: new Set(["power-attack", "combat-expertise", "armor-proficiency-heavy", "weapon-focus"]),
  };
  const run = (html: string): ReturnType<typeof structurePrerequisites> => {
    const $ = loadHtml(`<div id="x">${html}</div>`);
    const nodes = $("#x").contents().get();
    const raw = $("#x")
      .text()
      .replace(/^\s*:\s*/, "")
      .trim();
    return structurePrerequisites(raw, tokenizePrerequisites($, nodes), feats, {});
  };

  it("características, BAB, nivel de lanzador y rangos", () => {
    const p = run(": Str 13, Dex 15, base attack bonus +6, caster level 3rd, Spellcraft 5 ranks.");
    expect(p.abilities).toEqual({ str: 13, dex: 15 });
    expect(p.bab).toBe(6);
    expect(p.casterLevel).toBe(3);
    expect(p.skills).toEqual([{ skillId: "spellcraft", ranks: 5 }]);
    expect(p.other).toEqual([]);
  });

  it("Knowledge (x) se expande a knowledge-x y otras habilidades con paréntesis usan la base", () => {
    const p = run(": Knowledge (arcana) 5 ranks, Perform (dance) 3 ranks, Use Magic Device 1 rank");
    expect(p.skills).toEqual([
      { skillId: "knowledge-arcana", ranks: 5 },
      { skillId: "perform", ranks: 3 },
      { skillId: "use-magic-device", ranks: 1 },
    ]);
  });

  it("dotes por texto (sin enlace) y por enlace; un nombre con coma no se parte", () => {
    const p = run(
      ': <a href="FeatDisplay.aspx?ItemName=Power Attack">Power Attack</a>, Combat Expertise, Armor Proficiency, Heavy.',
    );
    expect(p.featIds).toEqual(["power-attack", "combat-expertise", "armor-proficiency-heavy"]);
    expect(p.other).toEqual([]);
  });

  it("alternativas, nivel de clase y capacidades de clase van a other", () => {
    const p = run(": Int 13 or Combat Expertise, fighter level 4th, sneak attack class feature");
    expect(p.abilities).toBeUndefined();
    expect(p.featIds).toEqual([]);
    expect(p.other).toEqual([
      "Int 13 or Combat Expertise",
      "fighter level 4th",
      "sneak attack class feature",
    ]);
  });

  it("dote con calificador entre paréntesis: dote en featIds y texto en other", () => {
    const p = run(": Weapon Focus (longbow), Str 13");
    expect(p.featIds).toEqual(["weapon-focus"]);
    expect(p.other).toEqual(["Weapon Focus (longbow)"]);
    expect(p.abilities).toEqual({ str: 13 });
  });

  it("«Weapon Focus with selected weapon»: la dote en featIds y el texto completo en other", () => {
    const p = run(
      ": Proficiency with selected weapon, Weapon Focus with selected weapon, base attack bonus +1",
    );
    expect(p.featIds).toEqual(["weapon-focus"]);
    expect(p.other).toEqual([
      "Proficiency with selected weapon",
      "Weapon Focus with selected weapon",
    ]);
    expect(p.bab).toBe(1);
  });

  it("la misma característica repetida conserva el mayor valor; featIds sin repetidos", () => {
    const p = run(": Str 13, Str 15, Power Attack, Power Attack");
    expect(p.abilities).toEqual({ str: 15 });
    expect(p.featIds).toEqual(["power-attack"]);
  });
});

describe("tablas con celdas combinadas (Leadership)", () => {
  it("expandTables repite el contenido de rowspan/colspan para alinear las columnas", () => {
    const $ = loadHtml(
      "<div id='x'><table><tr><td rowspan='2'><b>Score</b></td><td colspan='2'><b>Followers</b></td></tr>" +
        "<tr><td><b>1st</b></td><td><b>2nd</b></td></tr><tr><td>10</td><td>5</td><td>&mdash;</td></tr></table></div>",
    );
    const nodes = $("#x").contents().get();
    expandTables($, nodes);
    expect(nodesToMarkdown($, nodes)).toBe(
      [
        "| **Score** | **Followers** | **Followers** |",
        "| --- | --- | --- |",
        "| **Score** | **1st** | **2nd** |",
        "| 10 | 5 | — |",
      ].join("\n"),
    );
  });

  it("R17: el textEn de la dote real con tabla no conserva HTML (R8)", () => {
    expect(out.entries.every((e) => !/<[a-z/]/i.test(String(e["textEn"])))).toBe(true);
  });
});
