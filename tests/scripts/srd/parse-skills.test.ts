import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { ParserInput, ParserPage } from "../../../scripts/srd/lib/parser-contract";
import { SectionError } from "../../../scripts/srd/lib/sections";
import { CRB_SOURCE_URL } from "../../../scripts/srd/parsers/race-skill-common";
import { discover, KNOWLEDGE_SUBJECTS, parse } from "../../../scripts/srd/parsers/skills";
import { SkillSchema } from "../../../src/data/schema/skill";
import { ROOT } from "../../project/helpers";

// Fixtures: páginas reales de Archives of Nethys (contenido del `span` de la habilidad y la lista de
// navegación recortada a las cinco habilidades de la prueba; Knowledge conserva solo la primera sección
// de otro libro) y el extracto real de «Skill Uses [27]» de la página de fuente CRB. El subconjunto
// (`crb-source-subset`) deja solo los usos de esas cinco habilidades.
const dir = resolve(ROOT, "tests", "fixtures", "srd-html", "skills");
const read = (name: string): string => readFileSync(resolve(dir, `${name}.html`), "utf8");
const skillUrl = (name: string): string => `https://aonprd.com/Skills.aspx?ItemName=${name}`;
const page = (url: string, html: string): ParserPage => ({ url, html, sha256: "0".repeat(64) });

const FILES: Record<string, string> = {
  Stealth: "stealth",
  Knowledge: "knowledge",
  Diplomacy: "diplomacy",
  Appraise: "appraise",
  Perform: "perform",
};
const ALLOWED = ["Directing Crowds"];

function input(pages: ParserPage[]): ParserInput {
  return {
    category: "skills",
    subset: undefined,
    pages,
    config: { allowedSections: ALLOWED, slugAliases: {} },
  };
}
const skillPages = (patch: (name: string, html: string) => string = (_n, h) => h): ParserPage[] =>
  Object.entries(FILES).map(([name, file]) => page(skillUrl(name), patch(name, read(file))));
const withSource = (pages: ParserPage[]): ParserPage[] => [
  page(CRB_SOURCE_URL, read("crb-source-subset")),
  ...pages,
];
const parsed = (): Record<string, Record<string, unknown>> =>
  Object.fromEntries(parse(input(withSource(skillPages()))).entries.map((e) => [e.id, e]));

describe("discover de habilidades (R16, R26)", () => {
  const config = { allowedSections: ALLOWED, slugAliases: {} };
  const sourcePage = page(CRB_SOURCE_URL, read("crb-source-extract"));

  it("R16/R26: 26 páginas de habilidad y expectedCount 35 (Knowledge se expande en 10)", () => {
    const found = discover({
      category: "skills",
      subset: undefined,
      seedPages: [sourcePage],
      config,
    });
    expect(found.urls).toHaveLength(26);
    expect(new Set(found.urls).size).toBe(26);
    expect(found.urls).toContain(skillUrl("Knowledge"));
    expect(found.urls).toContain(skillUrl("Sleight%20of%20Hand"));
    expect(found.expectations).toEqual({ expectedCount: 35 });
    expect(KNOWLEDGE_SUBJECTS).toHaveLength(10);
  });

  it("sin la página de fuente no descubre nada; una sección o un recuento incoherentes fallan", () => {
    expect(discover({ category: "skills", subset: undefined, seedPages: [], config }).urls).toEqual(
      [],
    );
    const wrong = page(
      CRB_SOURCE_URL,
      read("crb-source-extract").replace("Uses [27]", "Uses [28]"),
    );
    expect(() =>
      discover({ category: "skills", subset: undefined, seedPages: [wrong], config }),
    ).toThrow(/declara 28 usos pero lista 27/);
    const noKnowledge = page(
      CRB_SOURCE_URL,
      read("crb-source-extract")
        .replace(/<a href="Skills.aspx\?ItemName=Knowledge">[^<]*<\/a>,? ?/, "")
        .replace("Uses [27]", "Uses [26]"),
    );
    expect(() =>
      discover({ category: "skills", subset: undefined, seedPages: [noKnowledge], config }),
    ).toThrow(/no incluye la habilidad Knowledge/);
  });
});

describe("parser de habilidades (R16, R45, R46)", () => {
  it("R2/R16: todas las entradas pasan el schema real; Knowledge da 10 entradas y el resto una", () => {
    const out = parse(input(withSource(skillPages())));
    for (const entry of out.entries) {
      const result = SkillSchema.safeParse(entry);
      expect(result.success, `${entry.id}: ${JSON.stringify(result.error?.issues)}`).toBe(true);
      expect(String(entry["textEn"])).not.toMatch(/<[a-z]/i);
    }
    const ids = out.entries.map((e) => e.id).sort();
    expect(ids).toEqual(
      [
        "appraise",
        "diplomacy",
        "perform",
        "stealth",
        ...KNOWLEDGE_SUBJECTS.map((s) => `knowledge-${s}`),
      ].sort(),
    );
    expect(out.counters!["entradas de Knowledge"]).toBe(10);
  });

  it("R16: Stealth (Dex; Armor Check Penalty; no trained only; CRB pg. 106)", () => {
    const stealth = parsed()["stealth"]!;
    expect(stealth["name"]).toBe("Stealth");
    expect(stealth["keyAbility"]).toBe("dex");
    expect(stealth["armorCheckPenalty"]).toBe(true);
    expect(stealth["trainedOnly"]).toBe(false);
    expect(stealth["sourceRef"]).toBe("PRPG Core Rulebook pg. 106");
    expect(stealth["knowledgeSubject"]).toBeUndefined();
    expect(String(stealth["textEn"])).toContain("**Check**: Your Stealth check is opposed");
  });

  it("R16: Knowledge (arcana) (Int; trained only; sin penalizador) con la materia y el texto de Knowledge", () => {
    const arcana = parsed()["knowledge-arcana"]!;
    expect(arcana["name"]).toBe("Knowledge (arcana)");
    expect(arcana["keyAbility"]).toBe("int");
    expect(arcana["trainedOnly"]).toBe(true);
    expect(arcana["armorCheckPenalty"]).toBe(false);
    expect(arcana["knowledgeSubject"]).toBe("arcana");
    expect(arcana["sourceRef"]).toBe("PRPG Core Rulebook pg. 99");
    expect(String(arcana["textEn"])).toContain("- Engineering (buildings, aqueducts");
    expect(String(arcana["textEn"])).toContain("| **Task** | **Knowledge Skill** | **DC** |");
    for (const subject of KNOWLEDGE_SUBJECTS) {
      expect(parsed()[`knowledge-${subject}`]!["knowledgeSubject"]).toBe(subject);
    }
  });

  it("R16: Perform es una sola entrada (Cha), sin expandir", () => {
    const perform = parsed()["perform"]!;
    expect(perform["keyAbility"]).toBe("cha");
    expect(perform["trainedOnly"]).toBe(false);
    expect(parsed()["perform-act"]).toBeUndefined();
  });

  it("R27/R46: el texto de otros libros (Skill Unlock, Psychometry...) queda fuera y se cuenta", () => {
    const out = parse(input(withSource(skillPages())));
    const text = out.entries.map((e) => String(e["textEn"])).join("\n");
    expect(text).not.toContain("Skill Unlock");
    expect(text).not.toContain("Pathfinder Unchained");
    expect(text).not.toContain("Psychometry");
    expect(text).not.toContain("Occult Skill Unlocks");
    expect(out.counters!["secciones de otros libros ignoradas"]).toBeGreaterThanOrEqual(8);
  });

  it("R27: una sección h2 que declara el CRB y está en la lista permitida se incluye (Directing Crowds)", () => {
    const diplomacy = String(parsed()["diplomacy"]!["textEn"]);
    expect(diplomacy).toContain("**Directing Crowds**");
    expect(diplomacy).toContain("It takes a DC 15 Diplomacy check or DC 20 Intimidate check");
    expect(diplomacy).not.toContain("Calling for the Guards");
  });

  it("R45: una sección del CRB fuera de la lista permitida falla con página y encabezado", () => {
    const strict: ParserInput = {
      ...input(withSource(skillPages())),
      config: { allowedSections: [], slugAliases: {} },
    };
    expect(() => parse(strict)).toThrow(SectionError);
    expect(() => parse(strict)).toThrow(/Directing Crowds/);
    expect(() => parse(strict)).toThrow(/Diplomacy/);
  });

  it("R45: una sección sin Source, un indicador desconocido o un h1 raro detienen el parseo", () => {
    const noSource = skillPages((n, h) => {
      if (n !== "Stealth") return h;
      const second = h.indexOf("<b>Source</b>", h.indexOf("<b>Source</b>") + 1);
      return h.slice(0, second) + "<b>Origin</b>" + h.slice(second + "<b>Source</b>".length);
    });
    expect(() => parse(input(withSource(noSource)))).toThrow("Skill Unlock (sin Source)");
    const badFlag = skillPages((n, h) =>
      n === "Stealth" ? h.replace("Armor Check Penalty)", "Armor Check Penalty; Fancy)") : h,
    );
    expect(() => parse(input(withSource(badFlag)))).toThrow(/indicador "Fancy"/);
    const badAbility = skillPages((n, h) => (n === "Stealth" ? h.replace("(Dex;", "(Luck;") : h));
    expect(() => parse(input(withSource(badAbility)))).toThrow(/característica clave/);
  });

  it("R45: la lista de materias de Knowledge debe ser la esperada", () => {
    const pages = skillPages((n, h) =>
      n === "Knowledge" ? h.replace("<li>Engineering (", "<li>Alchemy (") : h,
    );
    expect(() => parse(input(withSource(pages)))).toThrow(/lista de materias de Knowledge/);
  });

  it("R16: la navegación de AoN y «Skill Uses» de la fuente deben coincidir con las páginas", () => {
    const missingPage = skillPages().filter((p) => !p.url.endsWith("Perform"));
    expect(() => parse(input(withSource(missingPage)))).toThrow(/navegación sin página: Perform/);
    const noUse = page(
      CRB_SOURCE_URL,
      read("crb-source-subset").replace(">Core (Perform)<", ">Perform (Cha)<"),
    );
    expect(() => parse(input([noUse, ...skillPages()]))).toThrow(
      /no figura como Core \(\.\.\.\) en la fuente CRB: Perform/,
    );
  });

  it("R46: una página que no declara el CRB se excluye y se lista", () => {
    const pages = skillPages((n, h) =>
      n === "Perform" ? h.replaceAll("PRPG Core Rulebook", "Advanced Player's Guide") : h,
    );
    const out = parse(input(withSource(pages)));
    expect(out.entries.some((e) => e.id === "perform")).toBe(false);
    expect(out.excluded.map((e) => e.url)).toEqual([skillUrl("Perform")]);
  });

  it("R44: dos ejecuciones producen el mismo resultado", () => {
    const run = (): string => JSON.stringify(parse(input(withSource(skillPages()))));
    expect(run()).toBe(run());
  });
});
