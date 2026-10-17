import type { AnyNode, Element } from "domhandler";
import { CRB_SOURCE_REF_PREFIX } from "../../../src/data/schema/common";
import { labelledFields, loadHtml, sourceLabels, type Dom, type Section } from "../lib/html";
import type { ParserPage } from "../lib/parser-contract";
import { collapseWhitespace } from "../lib/text";

// Utilidades compartidas por los parsers de razas y habilidades (Lote B).

/**
 * Página de AoN con todo lo del CRB agrupado por tabla («Races [7]», «Skill Uses [27]»...). El
 * índice general no trae el libro de cada entrada, así que el universo sale de aquí.
 */
export const CRB_SOURCE_URL =
  "https://aonprd.com/SourceDisplay.aspx?FixedSource=PRPG Core Rulebook";
const ORIGIN = "https://aonprd.com/";

export function aonUrl(href: string): string {
  return `${ORIGIN}${href.trim().replace(/ /g, "%20")}`;
}

export interface SourceLink {
  text: string;
  href: string;
}

export interface SourceSection {
  /** Recuento declarado en el encabezado «Título [N]». */
  declaredCount: number;
  links: SourceLink[];
}

/** Sección «<título> [N]» de la página de fuente CRB; `undefined` si no existe. */
export function crbSourceSection(page: ParserPage, title: string): SourceSection | undefined {
  const $ = loadHtml(page.html);
  const heading = $("h2")
    .filter((_i, h) => {
      const text = collapseWhitespace($(h).text());
      return text.startsWith(`${title} [`) && /^.+ \[\d+\]$/.test(text);
    })
    .first();
  if (heading.length === 0) return undefined;
  const declaredCount = Number(/\[(\d+)\]/.exec(collapseWhitespace(heading.text()))![1]);
  const links = heading
    .nextUntil("h2, br")
    .filter("a")
    .get()
    .map((a) => ({ text: collapseWhitespace($(a).text()), href: $(a).attr("href") ?? "" }));
  return { declaredCount, links };
}

export function isElement(node: AnyNode): node is Element {
  return node.type === "tag";
}

/** Etiquetas `Source` del arranque de una sección (`<b>Source</b> ...<br>`). */
export function sectionSourceLabels($: Dom, section: Section): string[] {
  const first = section.nodes.findIndex((n) => isElement(n) && n.name === "b");
  if (first < 0) return [];
  return sourceLabels(labelledFields($, section.nodes));
}

/** La etiqueta del CRB (`PRPG Core Rulebook pg. N`) entre las etiquetas dadas, si hay. */
export function crbLabel(labels: readonly string[]): string | undefined {
  return labels.find((l) => l.startsWith(CRB_SOURCE_REF_PREFIX));
}

/** Nodos de una sección tras su línea `Source` (el primer `<br>`), sin esa línea. */
export function nodesAfterSource(section: Section): AnyNode[] {
  const start = section.nodes.findIndex((n) => isElement(n) && n.name === "b");
  const brIndex = section.nodes.findIndex((n, i) => i > start && isElement(n) && n.name === "br");
  if (start < 0 || brIndex < 0) return [...section.nodes];
  return section.nodes.slice(brIndex + 1);
}
