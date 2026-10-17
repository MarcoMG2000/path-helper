import type { AnyNode, Element } from "domhandler";
import { labelledFields, loadHtml, nodesToMarkdown, sourceLabels, type Dom } from "../../lib/html";
import type { ParserPage } from "../../lib/parser-contract";
import { collapseWhitespace } from "../../lib/text";
import { parseCoins } from "./variants";

// Secciones de reglas del capítulo 15 (`kind: general`, R66, R71): la página de reglas de AoN
// `Rules.aspx?ID=365` trae el capítulo entero con una `h1` por sección y su etiqueta `Source`.

export interface RulesSection {
  title: string;
  /** Enlace de la propia sección (`Rules.aspx?ID=376`). */
  href: string | undefined;
  labels: string[];
  crbLabel: string | undefined;
  sourceLine: string;
  textEn: string;
  /** Tablas de la sección como filas de celdas de texto plano. */
  tables: string[][][];
}

function isElement(node: AnyNode): node is Element {
  return node.type === "tag";
}

function flatten(root: AnyNode): void {
  if (root.type === "text") root.data = root.data.replace(/\s*\n\s*/g, " ");
  else if (isElement(root)) for (const child of root.children) flatten(child);
}

/** Una `RulesSection` por cada `h1.title` de la página de reglas. */
export function readRulesSections(page: ParserPage): RulesSection[] {
  const $ = loadHtml(page.html);
  const root = $("#MainContent_DetailedOutput").first();
  if (root.length === 0) throw new Error(`${page.url}: falta #MainContent_DetailedOutput`);
  flatten(root.get(0)!);
  const sections: { title: string; href: string | undefined; nodes: AnyNode[] }[] = [];
  for (const node of root.contents().get()) {
    if (isElement(node) && node.name === "h1") {
      sections.push({
        title: collapseWhitespace($(node).text()),
        href: $(node).find("a").first().attr("href"),
        nodes: [],
      });
    } else if (sections.length > 0) {
      sections[sections.length - 1]!.nodes.push(node);
    }
  }
  return sections.map((section) => {
    const sourceIndex = section.nodes.findIndex(
      (n) =>
        isElement(n) && (n.name === "b" || n.name === "strong") && $(n).text().trim() === "Source",
    );
    if (sourceIndex < 0)
      throw new Error(`${page.url}: la sección «${section.title}» no tiene Source`);
    const brIndex = section.nodes.findIndex(
      (n, i) => i > sourceIndex && isElement(n) && n.name === "br",
    );
    const sourceNodes = section.nodes.slice(sourceIndex, brIndex < 0 ? undefined : brIndex);
    const fields = labelledFields($, sourceNodes);
    const labels = sourceLabels(fields);
    const body = section.nodes.slice(brIndex < 0 ? section.nodes.length : brIndex + 1);
    const tables: string[][][] = [];
    for (const table of body.flatMap((n) => [
      ...(isElement(n) && n.name === "table" ? [n] : []),
      ...$(n).find("table").get(),
    ])) {
      tables.push(
        $(table)
          .find("tr")
          .get()
          .map((tr) =>
            $(tr)
              .children("td,th")
              .get()
              .map((cell) => collapseWhitespace($(cell).text())),
          ),
      );
    }
    return {
      title: section.title,
      href: section.href,
      labels,
      crbLabel: labels.find((l) => l.startsWith("PRPG Core Rulebook")),
      sourceLine: fields.map((f) => f.value.replace(/\*/g, "")).join(", "),
      textEn: nodesToMarkdown($ as Dom, body),
      tables,
    };
  });
}

export interface EnhancementPrice {
  bonus: number;
  priceCp: number;
}

/**
 * Precios base de mejora +1..+5 de las tablas 15-3 (filas «+N armor» y «+N shield») y 15-8 (columna
 * «Weapon Bonus»). Si armadura y escudo difieren, falla (la entrada `general` solo tiene una lista).
 */
export function enhancementPrices(
  title: string,
  tables: readonly string[][][],
): EnhancementPrice[] | undefined {
  const wanted =
    title === "Magic Armor" ? "armor" : title === "Magic Weapons" ? "weapon" : undefined;
  if (wanted === undefined) return undefined;
  const byKind = new Map<string, Map<number, number>>();
  for (const table of tables) {
    for (const row of table) {
      const priceCell = row[row.length - 1] ?? "";
      const cp = parseCoins(priceCell);
      if (cp === undefined) continue;
      const m =
        wanted === "weapon"
          ? /^\+(\d+)$/.exec(row[row.length - 2] ?? "")
          : /^\+(\d+) (armor|shield)$/.exec(row[row.length - 2] ?? "");
      if (!m) continue;
      const kind = wanted === "weapon" ? "weapon" : m[2]!;
      const bonus = Number(m[1]);
      if (bonus < 1 || bonus > 5) continue;
      const prices = byKind.get(kind) ?? new Map<number, number>();
      prices.set(bonus, cp);
      byKind.set(kind, prices);
    }
  }
  const main = byKind.get(wanted);
  if (!main || main.size !== 5) {
    throw new Error(`«${title}»: no se encontraron los 5 precios de mejora +1..+5`);
  }
  if (wanted === "armor") {
    const shield = byKind.get("shield");
    for (const [bonus, cp] of main) {
      if (shield?.get(bonus) !== cp) {
        throw new Error(`«${title}»: el precio de escudo +${bonus} no coincide con el de armadura`);
      }
    }
  }
  return [...main].sort(([a], [b]) => a - b).map(([bonus, priceCp]) => ({ bonus, priceCp }));
}
