import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { noHtmlTags } from "../../../src/data/schema/common";
import {
  findContent,
  labelledFields,
  loadHtml,
  nodesToMarkdown,
  nodesToText,
  sourceLabels,
  splitSections,
} from "../../../scripts/srd/lib/html";
import { SectionError, assertAllowedHeadings } from "../../../scripts/srd/lib/sections";
import { ROOT } from "../../project/helpers";

const fixture = readFileSync(
  resolve(ROOT, "tests", "fixtures", "srd-html", "common", "magic-missile.html"),
  "utf8",
);

describe("html.ts con una página de AoN real (Magic Missile)", () => {
  const $ = loadHtml(fixture);
  const sections = splitSections($, findContent($));

  it("divide en secciones por encabezado, incluidos los de otro libro", () => {
    expect(sections.map((s) => s.heading)).toEqual([
      "Magic Missile",
      "Casting",
      "Effect",
      "Description",
      "Mythic Magic Missile",
    ]);
  });

  it("R45: assertAllowedHeadings falla con página y encabezado del libro ajeno", () => {
    const headings = sections.map((s) => s.heading);
    expect(() =>
      assertAllowedHeadings("magic-missile", headings, [
        "Magic Missile",
        "Casting",
        "Effect",
        "Description",
      ]),
    ).toThrow(SectionError);
    try {
      assertAllowedHeadings("magic-missile", headings, [
        "magic missile",
        "CASTING",
        "Effect",
        "Description",
      ]);
    } catch (e) {
      expect((e as SectionError).page).toBe("magic-missile");
      expect((e as SectionError).heading).toBe("Mythic Magic Missile");
      expect((e as Error).message).toContain("Mythic Magic Missile");
    }
    expect(() =>
      assertAllowedHeadings("p", headings, [...headings.map((h) => h.toUpperCase())]),
    ).not.toThrow();
  });

  it("extrae campos etiquetados y las etiquetas de fuente", () => {
    const head = sections[0]!;
    const fields = labelledFields($, head.nodes);
    expect(fields.map((f) => f.label)).toEqual(["Source", "School", "Level"]);
    expect(sourceLabels(fields)).toEqual(["PRPG Core Rulebook pg. 309"]);
    expect(fields[1]?.value).toBe("evocation [force]");
    expect(fields[2]?.value).toContain("sorcerer 1, wizard 1");
    const casting = labelledFields($, sections[1]!.nodes);
    expect(casting.map((f) => [f.label, f.value])).toEqual([
      ["Casting Time", "1 standard action"],
      ["Components", "V, S"],
    ]);
    const effect = labelledFields($, sections[2]!.nodes);
    expect(effect.map((f) => f.label)).toEqual([
      "Range",
      "Targets",
      "Duration",
      "Saving Throw",
      "Spell Resistance",
    ]);
    expect(effect[3]?.value).toBe("none");
  });

  it("R8: el Markdown generado no contiene etiquetas HTML y conserva párrafos y cursivas", () => {
    const md = nodesToMarkdown($, sections[3]!.nodes);
    expect(noHtmlTags(md)).toBe(true);
    expect(md.split("\n\n")).toHaveLength(3);
    expect(md).toContain("dealing 1d4+1 points of force damage.");
    const mythic = nodesToMarkdown($, sections[4]!.nodes);
    expect(mythic).toContain("**Source**");
    expect(mythic).toContain("*shield*");
    expect(nodesToText($, sections[1]!.nodes)).toBe(
      "Casting Time 1 standard action Components V, S",
    );
  });
});

describe("nodesToMarkdown: listas y tablas", () => {
  it("convierte ul/ol y tablas simples a Markdown", () => {
    const $ = loadHtml(
      "<div id=main><p>Intro <b>bold</b></p><ul><li>uno</li><li>dos</li></ul>" +
        "<table><tr><th>Level</th><th>BAB</th></tr><tr><td>1st</td><td>+1</td></tr><tr><td>2nd</td><td>—</td></tr></table></div>",
    );
    const md = nodesToMarkdown($, $("#main").contents().get());
    expect(md).toBe(
      [
        "Intro **bold**",
        "- uno\n- dos",
        "| Level | BAB |\n| --- | --- |\n| 1st | +1 |\n| 2nd | — |",
      ].join("\n\n"),
    );
  });

  it("escapa | dentro de celdas y completa filas cortas", () => {
    const $ = loadHtml("<table><tr><td>a|b</td></tr><tr><td>x</td><td>y</td></tr></table>");
    const md = nodesToMarkdown($, $("body").contents().get());
    expect(md).toContain("a\\|b");
    expect(md.split("\n")[0]).toBe("| a\\|b |  |");
  });
});
