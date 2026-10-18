import type { AnyNode, Element } from "domhandler";
import { labelledFields, loadHtml, nodesToMarkdown, type Dom } from "../../lib/html";
import type { ParserPage } from "../../lib/parser-contract";
import { SectionError } from "../../lib/sections";
import { collapseWhitespace } from "../../lib/text";

// Cabecera y secciones de una página de objeto mágico de AoN (R45, R65, R86).
// Estructura: `<span id="MainContent_DataListTypes_LabelName_N">` con `h1` (nombre), campos
// `<b>Source|Aura|CL|Slot|Price|Weight</b>`, y secciones `h3` (`Description`, `Construction`,
// `Resonance`, `Destruction`). Una página puede traer varios `span` (p. ej. las piedras ioun).

export const HEADER_LABELS = ["Source", "Aura", "CL", "Slot", "Price", "Weight"] as const;
type HeaderLabel = (typeof HEADER_LABELS)[number];

export interface RawSection {
  heading: string;
  nodes: AnyNode[];
}

export interface RawConstruction {
  requirements: string;
  /** Valor del campo `Cost` (o `Price` en las habilidades de arma/armadura). */
  cost: string;
  costLabel: string;
}

export interface RawItem {
  title: string;
  /** Etiquetas `Source` en orden (`PRPG Core Rulebook pg. 469`...). */
  labels: string[];
  /** Línea `Source` literal sin marcas de cursiva. */
  sourceLine: string;
  crbLabel: string | undefined;
  aura: string;
  cl: string;
  slot: string;
  price: string;
  weight: string;
  hasPriceField: boolean;
  /** `Description`, `Resonance`, `Destruction`... en orden (sin `Construction`). */
  sections: RawSection[];
  construction: RawConstruction | undefined;
  /** Subtítulos `h2` dentro del contenido (se conservan como texto en negrita). */
  inlineHeadings: string[];
  /** Nodos de la sección `Construction` (para el Markdown con cursivas de los conjuros). */
  constructionNodes: AnyNode[];
}

function isElement(node: AnyNode): node is Element {
  return node.type === "tag";
}

/** Los saltos de línea de la fuente dentro de un párrafo no son saltos: se vuelven espacios. */
function flattenNewlines(root: AnyNode): void {
  const visit = (node: AnyNode): void => {
    if (node.type === "text") {
      node.data = node.data.replace(/\s*\n\s*/g, " ");
    } else if (isElement(node)) {
      for (const child of node.children) visit(child);
    }
  };
  visit(root);
}

const MARKS = /\*/g;
const plain = (value: string): string => collapseWhitespace(value.replace(MARKS, ""));

export interface PageItems {
  $: Dom;
  items: RawItem[];
}

/**
 * Lee todos los objetos de una página. `allowedSections` son los encabezados `h3` permitidos
 * (R45): cualquier otro detiene el parseo con la página y el encabezado.
 */
export function readItems(page: ParserPage, allowedSections: readonly string[]): PageItems {
  const $ = loadHtml(page.html);
  const allowed = new Set(allowedSections.map((s) => collapseWhitespace(s).toLowerCase()));
  const items: RawItem[] = [];
  const spans = $('span[id^="MainContent_DataListTypes_LabelName"]').get();
  for (const span of spans) {
    flattenNewlines(span);
    const nodes = $(span).contents().get();
    const h1Index = nodes.findIndex((n) => isElement(n) && n.name === "h1");
    if (h1Index < 0) continue;
    const title = collapseWhitespace($(nodes[h1Index]!).text());

    const header: AnyNode[] = [];
    const sections: RawSection[] = [];
    const inlineHeadings: string[] = [];
    let current: RawSection | undefined;
    for (const node of nodes.slice(h1Index + 1)) {
      if (isElement(node) && node.name === "h3") {
        const heading = collapseWhitespace($(node).text());
        if (!allowed.has(heading.toLowerCase())) throw new SectionError(page.url, heading);
        current = { heading, nodes: [] };
        sections.push(current);
      } else if (current === undefined) {
        header.push(node);
      } else {
        if (isElement(node) && node.name === "h2") {
          const heading = collapseWhitespace($(node).text());
          if (!heading.toLowerCase().startsWith(title.toLowerCase())) {
            throw new SectionError(page.url, heading);
          }
          inlineHeadings.push(heading);
        } else if (isElement(node) && /^h[1456]$/.test(node.name)) {
          throw new SectionError(page.url, collapseWhitespace($(node).text()));
        }
        current.nodes.push(node);
      }
    }

    const fields = labelledFields($, header);
    const byLabel = new Map<HeaderLabel, string>();
    for (const field of fields) {
      const label = HEADER_LABELS.find((l) => l.toLowerCase() === field.label.toLowerCase());
      if (label === undefined) throw new SectionError(page.url, `campo ${field.label}`);
      if (byLabel.has(label)) throw new SectionError(page.url, `campo ${field.label} (repetido)`);
      byLabel.set(label, field.value);
    }
    const sourceValue = byLabel.get("Source");
    if (sourceValue === undefined) throw new SectionError(page.url, "campo Source (ausente)");
    // Cada etiqueta acaba en «pg. N»; el nombre del libro puede llevar comas («Andoran, Spirit of Liberty»).
    const labels = plain(sourceValue)
      .split(/(?<=\bpg\.\s*\d+(?:[-–]\d+)?),\s*/)
      .map((l) => l.trim())
      .filter((l) => l !== "");
    for (const label of labels) {
      if (!/ pg\. \d+$/.test(label)) {
        throw new Error(`${page.url}: etiqueta Source con formato inesperado "${label}"`);
      }
    }

    let construction: RawConstruction | undefined;
    const constructionSection = sections.find((s) => s.heading.toLowerCase() === "construction");
    if (constructionSection) {
      const cf = labelledFields($, constructionSection.nodes);
      const requirements = cf.find((f) => f.label.toLowerCase() === "requirements");
      const cost = cf.find((f) => ["cost", "price"].includes(f.label.toLowerCase()));
      const unknown = cf.filter(
        (f) => !["requirements", "cost", "price"].includes(f.label.toLowerCase()),
      );
      if (unknown.length > 0) throw new SectionError(page.url, `campo ${unknown[0]!.label}`);
      if (!requirements) throw new SectionError(page.url, "Requirements (ausente)");
      construction = {
        requirements: plain(requirements.value),
        cost: cost ? plain(cost.value) : "",
        costLabel: cost ? cost.label : "Cost",
      };
    }

    items.push({
      title,
      labels,
      sourceLine: plain(sourceValue),
      crbLabel: labels.find((l) => l.startsWith("PRPG Core Rulebook")),
      aura: plain(byLabel.get("Aura") ?? ""),
      cl: plain(byLabel.get("CL") ?? ""),
      slot: plain(byLabel.get("Slot") ?? ""),
      price: plain(byLabel.get("Price") ?? ""),
      weight: plain(byLabel.get("Weight") ?? ""),
      hasPriceField: byLabel.has("Price"),
      sections: sections.filter((s) => s.heading.toLowerCase() !== "construction"),
      construction,
      inlineHeadings,
      constructionNodes: constructionSection?.nodes ?? [],
    });
  }
  return { $, items };
}

/**
 * Secciones de una página que AoN añade desde otros libros y que NO existen en el CRB: se leen
 * (para no fallar con R45) pero se omiten del `textEn`. `Resonance` es una regla de Ultimate
 * Equipment / Adventurer's Guide: el PRD del CRB no la tiene en ningún objeto (corrección B de f3).
 */
export const OTHER_BOOK_SECTIONS: ReadonlySet<string> = new Set(["resonance"]);

export function isOtherBookSection(heading: string): boolean {
  return OTHER_BOOK_SECTIONS.has(heading.toLowerCase());
}

/** Markdown de las secciones de contenido (`**Description**`...) más la construcción. */
export function itemMarkdown($: Dom, item: RawItem): string {
  const parts: string[] = [];
  const headerLine = [
    `**Aura** ${item.aura}`,
    `**CL** ${item.cl}`,
    `**Slot** ${item.slot}`,
    ...(item.hasPriceField ? [`**Price** ${item.price}`] : []),
    `**Weight** ${item.weight || "—"}`,
  ]
    .filter((p) => !/^\*\*\w+\*\* $/.test(p))
    .join("; ");
  parts.push(headerLine);
  for (const section of item.sections) {
    if (isOtherBookSection(section.heading)) continue;
    parts.push(`**${section.heading}**`);
    const body = nodesToMarkdown($, section.nodes);
    if (body !== "") parts.push(body);
  }
  if (item.construction) {
    parts.push("**Construction**");
    parts.push(nodesToMarkdown($, item.constructionNodes));
  }
  return parts.join("\n\n");
}
