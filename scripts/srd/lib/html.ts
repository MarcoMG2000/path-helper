import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import { collapseWhitespace } from "./text";

// Utilidades HTML -> Markdown restringido (R8) para los parsers. Cada parser decide qué secciones
// y campos extrae; aquí solo hay mecánica común, sin conocimiento de ninguna categoría.

export type Dom = cheerio.CheerioAPI;
export type Nodes = readonly AnyNode[];

/**
 * AoN escribe a veces el signo de multiplicar (×, U+00D7) como el carácter de control U+001F
 * (*flaming burst*: «critical multiplier is ×3»; *dragonhide plate*: «2d4 × 100»). Se restituye
 * antes de parsear: un carácter de control en `textEn` rompe la lectura de multiplicadores.
 */
const AON_TIMES_GLITCH = new RegExp(String.fromCharCode(0x1f), "g");

export function loadHtml(html: string): Dom {
  return cheerio.load(html.replace(AON_TIMES_GLITCH, "×"));
}

/** Contenedor del artículo en Archives of Nethys; si no existe, `#main` o `body`. */
export function findContent($: Dom): Nodes {
  for (const selector of [
    'span[id^="MainContent_DataListTypes_LabelName"]',
    "#MainContent",
    "#main",
    "body",
  ]) {
    const found = $(selector).first();
    if (found.length > 0) return found.get();
  }
  return $.root().get();
}

function isElement(node: AnyNode): node is Element {
  return node.type === "tag";
}

const HEADING = /^h[1-6]$/;

export interface Section {
  level: number; // 1..6; 0 para el contenido previo al primer encabezado
  heading: string;
  nodes: AnyNode[];
}

/** Divide el contenido hijo a hijo en secciones; un h1-h6 abre una sección nueva. */
export function splitSections($: Dom, root: Nodes): Section[] {
  const sections: Section[] = [{ level: 0, heading: "", nodes: [] }];
  for (const container of root) {
    for (const node of $(container).contents().get()) {
      if (isElement(node) && HEADING.test(node.name)) {
        sections.push({
          level: Number(node.name.slice(1)),
          heading: collapseWhitespace($(node).text()),
          nodes: [],
        });
      } else {
        sections[sections.length - 1]!.nodes.push(node);
      }
    }
  }
  return sections.filter((s) => s.level > 0 || s.nodes.length > 0);
}

function cellText($: Dom, cell: AnyNode): string {
  return collapseWhitespace(inline($, [cell])).replace(/\|/g, "\\|");
}

function table($: Dom, el: Element): string {
  const rows = $(el)
    .find("tr")
    .get()
    .map((tr) =>
      $(tr)
        .children("th,td")
        .get()
        .map((c) => cellText($, c)),
    );
  const nonEmpty = rows.filter((r) => r.length > 0);
  if (nonEmpty.length === 0) return "";
  const width = Math.max(...nonEmpty.map((r) => r.length));
  const pad = (r: string[]): string[] => [...r, ...Array<string>(width - r.length).fill("")];
  const line = (r: string[]): string => `| ${pad(r).join(" | ")} |`;
  const [head, ...rest] = nonEmpty;
  return [
    line(head!),
    `| ${Array<string>(width).fill("---").join(" | ")} |`,
    ...rest.map(line),
  ].join("\n");
}

function inline($: Dom, nodes: Nodes): string {
  let out = "";
  for (const node of nodes) {
    if (node.type === "text") {
      out += node.data;
    } else if (isElement(node)) {
      const inner = (): string => inline($, $(node).contents().get());
      switch (node.name) {
        case "b":
        case "strong": {
          const text = inner();
          const trimmed = text.trim();
          out += trimmed
            ? `${text.slice(0, text.length - text.trimStart().length)}**${trimmed}**${text.slice(text.trimEnd().length)}`
            : text;
          break;
        }
        case "i":
        case "em": {
          const text = inner();
          const trimmed = text.trim();
          out += trimmed
            ? `${text.slice(0, text.length - text.trimStart().length)}*${trimmed}*${text.slice(text.trimEnd().length)}`
            : text;
          break;
        }
        case "br":
          out += "\n";
          break;
        case "script":
        case "style":
        case "img":
          break;
        default:
          out += inner();
      }
    }
  }
  return out;
}

function block($: Dom, nodes: Nodes, listDepth = 0): string[] {
  const blocks: string[] = [];
  let run: AnyNode[] = [];
  const flush = (): void => {
    if (run.length === 0) return;
    const text = inline($, run)
      .split("\n")
      .map((l) => collapseWhitespace(l))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (text) blocks.push(text);
    run = [];
  };
  for (const node of nodes) {
    if (isElement(node)) {
      if (node.name === "table") {
        flush();
        const md = table($, node);
        if (md) blocks.push(md);
        continue;
      }
      if (node.name === "ul" || node.name === "ol") {
        flush();
        const ordered = node.name === "ol";
        const items = $(node)
          .children("li")
          .get()
          .map((li, i) => {
            const body = block($, $(li).contents().get(), listDepth + 1).join("\n");
            return `${"  ".repeat(listDepth)}${ordered ? `${i + 1}.` : "-"} ${body}`;
          });
        if (items.length > 0) blocks.push(items.join("\n"));
        continue;
      }
      if (node.name === "p" || node.name === "div" || node.name === "blockquote") {
        flush();
        blocks.push(...block($, $(node).contents().get(), listDepth));
        continue;
      }
      if (HEADING.test(node.name)) {
        flush();
        const text = collapseWhitespace($(node).text());
        if (text) blocks.push(`**${text}**`);
        continue;
      }
    }
    run.push(node);
  }
  flush();
  return blocks;
}

/** Markdown restringido (párrafos, negritas, cursivas, listas, tablas simples), sin etiquetas HTML. */
export function nodesToMarkdown($: Dom, nodes: Nodes): string {
  return block($, nodes).join("\n\n");
}

/** Texto plano con espacios colapsados. */
export function nodesToText($: Dom, nodes: Nodes): string {
  return collapseWhitespace(nodes.map((n) => $(n).text()).join(" "));
}

export interface Field {
  label: string;
  /** Valor en Markdown restringido, sin el `;` final. */
  value: string;
  nodes: AnyNode[];
}

/**
 * Campos `<b>Etiqueta</b> valor` de una cabecera. Un campo termina en el siguiente `<b>`, en un
 * `<br>` o al acabar los nodos. Solo para cabeceras: en las descripciones hay negritas de contenido.
 */
export function labelledFields($: Dom, nodes: Nodes): Field[] {
  const fields: Field[] = [];
  let current: Field | undefined;
  const close = (): void => {
    if (!current) return;
    current.value = collapseWhitespace(inline($, current.nodes))
      .replace(/\s*;\s*$/, "")
      .trim();
    fields.push(current);
    current = undefined;
  };
  for (const node of nodes) {
    if (isElement(node) && (node.name === "b" || node.name === "strong")) {
      close();
      current = { label: collapseWhitespace($(node).text()), value: "", nodes: [] };
    } else if (isElement(node) && node.name === "br") {
      close();
    } else if (current) {
      current.nodes.push(node);
    }
  }
  close();
  return fields;
}

/** Etiquetas de fuente de un campo `Source` (`PRPG Core Rulebook pg. 309`, ...), en orden. */
export function sourceLabels(fields: readonly Field[]): string[] {
  const source = fields.find((f) => f.label.toLowerCase() === "source");
  if (!source) return [];
  return source.value
    .replace(/\*/g, "")
    .split(/\s*,\s*(?=[A-Z])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
