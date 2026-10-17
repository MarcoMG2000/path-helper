import type { AnyNode, Element } from "domhandler";
import { resolveEntryId } from "../../../src/data/integrity/ids";
import { CRB_SOURCE_REF_PREFIX } from "../../../src/data/schema/common";
import {
  findContent,
  labelledFields,
  loadHtml,
  nodesToMarkdown,
  sourceLabels,
  splitSections,
  type Dom,
  type Field,
  type Section,
} from "../lib/html";
import type {
  CategoryParser,
  DiscoverInput,
  DiscoverOutput,
  ExcludedPage,
  NeedsReviewItem,
  ParsedEntry,
  ParserPage,
} from "../lib/parser-contract";
import { assertAllowedHeadings, SectionError } from "../lib/sections";
import { collapseWhitespace } from "../lib/text";
import {
  crbUniverse,
  EquipmentParseError,
  itemNameOfHref,
  kebabOfListing,
  parseCostCp,
  parseDefenseStats,
  parseWeaponStats,
  parseWeightLb,
  stripFootnote,
  type EquipmentKind,
} from "./equipment-common";

// Parser de equipo de Archives of Nethys (Lote E, R24-R27, R45, R46). Puro y determinista. Las
// cuatro categorías (`weapons`, `armor`, `shields`, `gear`) comparten módulo y se distinguen por
// `input.category`. El universo sale de la página de fuente CRB de AoN («Equipment (Weapons) [N]»,
// «Equipment (Armor) [N]», «Equipment (Misc.) [N]») y de los listados por categoría.

const KINDS: readonly EquipmentKind[] = ["weapons", "armor", "shields", "gear"];

function kindOf(category: string): EquipmentKind {
  if (!(KINDS as readonly string[]).includes(category)) {
    throw new Error(`el parser de equipo no procesa la categoría "${category}"`);
  }
  return category as EquipmentKind;
}

export function discover(input: DiscoverInput): DiscoverOutput {
  const kind = kindOf(input.category);
  if (input.subset !== undefined) return { urls: [] };
  const universe = crbUniverse(kind, input.seedPages);
  return {
    urls: universe.items.map((i) => i.url),
    expectations: { expectedCount: universe.items.length },
  };
}

// --- página ----------------------------------------------------------------------------------------

function isElement(node: AnyNode): node is Element {
  return node.type === "tag";
}

function boldLabel($: Dom, node: AnyNode): string | undefined {
  if (!isElement(node) || (node.name !== "b" && node.name !== "strong")) return undefined;
  return collapseWhitespace($(node).text());
}

interface ItemPage {
  title: string;
  labels: string[];
  fields: Field[];
  /** Markdown del cuerpo (sin la línea Source). */
  textEn: string;
  /** Secciones de otros libros ignoradas. */
  otherBookSections: number;
  /** La página solo trae la nota editorial de AoN «No description was provided» (no se copia). */
  noDescription: boolean;
}

/** Quita del bloque principal la línea `Source` (hasta el primer `<br>` o el final). */
function withoutSourceLine($: Dom, nodes: readonly AnyNode[]): AnyNode[] {
  const start = nodes.findIndex((n) => boldLabel($, n)?.toLowerCase() === "source");
  if (start < 0) return [...nodes];
  let end = start + 1;
  while (end < nodes.length && !(isElement(nodes[end]!) && (nodes[end] as Element).name === "br"))
    end++;
  return [...nodes.slice(0, start), ...nodes.slice(end + 1)];
}

/** Nota editorial de AoN que sustituye a una descripción ausente; no es texto del CRB. */
const NO_DESCRIPTION = /^\*+From Nethys\*+:?\s*No description was provided for this entry\.\*?$/;

function readItemPage(page: ParserPage, allowed: readonly string[]): ItemPage {
  const $ = loadHtml(page.html);
  const sections = splitSections($, findContent($));
  const mainIndex = sections.findIndex((s) => s.level === 1);
  if (mainIndex < 0) throw new SectionError(page.url, "(sin título h1)");
  const main = sections[mainIndex]!;
  const allowedSet = new Set(allowed.map((a) => a.toLowerCase()));
  // Un h2 permitido (p. ej. una tabla de la descripción) es contenido; cualquier otro h2 abre el
  // contenido de otros libros.
  const firstOther = sections.findIndex(
    (s, i) => i > mainIndex && s.level <= 2 && !allowedSet.has(s.heading.toLowerCase()),
  );
  const subs: Section[] = sections.slice(mainIndex + 1, firstOther < 0 ? undefined : firstOther);
  const others: Section[] =
    firstOther < 0 ? [] : sections.slice(firstOther).filter((s) => s.level <= 2);

  assertAllowedHeadings(
    page.url,
    subs.map((s) => s.heading),
    allowed,
  );

  const fields = [
    ...labelledFields($, main.nodes),
    ...subs
      .filter((s) => s.heading.toLowerCase() === "statistics")
      .flatMap((s) => labelledFields($, s.nodes)),
  ];
  const labels = sourceLabels(fields);

  let otherBookSections = 0;
  for (const section of others) {
    const found = sourceLabels(labelledFields($, section.nodes));
    if (found.length === 0 || found.some((l) => l.startsWith(CRB_SOURCE_REF_PREFIX))) {
      throw new SectionError(page.url, section.heading);
    }
    otherBookSections++;
  }

  const blocks: string[] = [];
  let noDescription = false;
  const lead = nodesToMarkdown($, withoutSourceLine($, main.nodes));
  if (lead) blocks.push(lead);
  for (const sub of subs) {
    let md = nodesToMarkdown($, sub.nodes);
    if (sub.heading.toLowerCase() === "description" && NO_DESCRIPTION.test(md)) {
      noDescription = true;
      md = "";
    }
    const isPlain = ["statistics", "description"].includes(sub.heading.toLowerCase());
    if (isPlain) {
      if (md) blocks.push(md);
    } else {
      blocks.push(`**${sub.heading}**`);
      if (md) blocks.push(md);
    }
  }
  return {
    title: main.heading,
    labels,
    fields: fields.filter((f) => f.label.toLowerCase() !== "source"),
    textEn: blocks.join("\n\n"),
    otherBookSections,
    noDescription,
  };
}

function statsOf(fields: readonly Field[], url: string): Record<string, string> {
  const stats: Record<string, string> = {};
  for (const f of fields) {
    if (stats[f.label] !== undefined) throw new SectionError(url, `${f.label} (repetida)`);
    stats[f.label] = f.value;
  }
  return stats;
}

// --- parse -----------------------------------------------------------------------------------------

export const parse: CategoryParser = (input) => {
  const kind = kindOf(input.category);
  const allowed = input.config.allowedSections;
  const aliases = input.config.slugAliases;
  const universe = crbUniverse(kind, input.pages);
  const pagesByUrl = new Map(input.pages.map((p) => [p.url, p] as const));

  const excluded: ExcludedPage[] = [];
  const needsReview: NeedsReviewItem[] = [];
  const entries: ParsedEntry[] = [];
  const notes: string[] = [];
  const counters: Record<string, number> = {
    "entradas CRB": 0,
    "páginas de otro libro": 0,
    "secciones de otros libros ignoradas": 0,
    "páginas con varias etiquetas Source": 0,
    "coste sin cantidad fija (costCp null)": 0,
    "peso sin libras (weightLb null)": 0,
    "páginas sin descripción en la fuente": 0,
  };
  if (universe.duplicates.length > 0) {
    notes.push(
      `enlace repetido en la sección de la página de fuente (cuenta ${universe.declaredCount}, entradas distintas ${universe.items.length}): ${universe.duplicates.join(", ")}`,
    );
  }

  // Páginas de ítem presentes en la procedencia que no están en el universo: incoherencia.
  const known = new Set(universe.items.map((i) => i.url));
  const stray = input.pages.filter((p) => itemNameOfHref(p.url) !== undefined && !known.has(p.url));
  if (stray.length > 0) {
    throw new EquipmentParseError(
      `páginas de equipo en la procedencia que no pertenecen al universo CRB de ${kind}:\n${stray.map((p) => `  - ${p.url}`).join("\n")}`,
    );
  }

  for (const item of universe.items) {
    const page = pagesByUrl.get(item.url);
    if (!page) throw new EquipmentParseError(`falta en la procedencia la página ${item.url}`);
    const info = readItemPage(page, allowed);
    const crbLabel = info.labels.find((l) => l.startsWith(CRB_SOURCE_REF_PREFIX));
    if (crbLabel === undefined) {
      counters["páginas de otro libro"]!++;
      excluded.push({
        url: item.url,
        book: info.labels.join(", ") || "(sin Source)",
        reason: "sin etiqueta Source CRB (R27, R46)",
      });
      notes.push(
        `excluida: ${item.url} figura en la página de fuente CRB pero su Source es ${info.labels.join(", ") || "(sin Source)"} (el recuento quedará por debajo de expectedCount, R26)`,
      );
      continue;
    }
    counters["secciones de otros libros ignoradas"]! += info.otherBookSections;
    if (info.noDescription) {
      counters["páginas sin descripción en la fuente"]!++;
      notes.push(
        `${item.name}: la fuente no trae descripción (solo la nota editorial de AoN); textEn contiene solo la cabecera`,
      );
    }
    if (info.labels.length > 1) counters["páginas con varias etiquetas Source"]!++;

    const stats = statsOf(info.fields, item.url);
    const id = resolveEntryId(kind, item.name, aliases);
    const reasons: string[] = [];
    const base = {
      id,
      name: item.name,
      textEn: info.textEn,
      source: item.url,
      sourceRef: crbLabel,
      book: "CRB",
    };

    // Coste y peso literales: la propia página (armas, armaduras, escudos, complementos) o la fila del
    // listado (bienes, cuyas páginas agrupan varias variantes de precio).
    let costRaw: string;
    let weightRaw: string;
    if (kind === "gear" && item.listing !== "Extra") {
      costRaw = stripFootnote(item.row.cost);
      weightRaw = stripFootnote(item.row.weight);
      const pagePrice = stats["Price"];
      if (
        pagePrice !== undefined &&
        !pagePrice.includes("(") &&
        collapseWhitespace(pagePrice) !== costRaw
      ) {
        reasons.push(`el precio de la página "${pagePrice}" difiere del listado "${costRaw}"`);
      }
    } else {
      costRaw = stripFootnote(stats["Cost"] ?? "");
      weightRaw = stripFootnote(stats["Weight"] ?? "");
      if (stats["Cost"] === undefined) throw new SectionError(item.url, "Cost (ausente)");
    }
    const money = {
      costCp: parseCostCp(costRaw),
      costRaw,
      weightLb: parseWeightLb(weightRaw),
      weightRaw,
      stats,
    };
    if (money.costCp === null) counters["coste sin cantidad fija (costCp null)"]!++;
    if (money.weightLb === null) counters["peso sin libras (weightLb null)"]!++;
    const blank = (v: string): boolean => v === "" || v === "—";
    if (
      (money.costCp === null && !blank(costRaw)) ||
      (money.weightLb === null && !blank(weightRaw))
    ) {
      notes.push(`${id}: costRaw "${costRaw}", weightRaw "${weightRaw}"`);
    }

    let entry: ParsedEntry;
    try {
      if (kind === "weapons") {
        entry = { ...base, ...parseWeaponStats(stats), ...money };
      } else if (kind === "armor") {
        const d = parseDefenseStats(stats);
        entry = {
          ...base,
          category: item.listing.toLowerCase(),
          ...money,
          armorBonus: d.bonus,
          maxDex: d.maxDex,
          armorCheckPenalty: d.armorCheckPenalty,
          arcaneSpellFailurePct: d.arcaneSpellFailurePct,
          speed30: d.speed30,
          speed20: d.speed20,
        };
      } else if (kind === "shields") {
        const d = parseDefenseStats(stats);
        entry = {
          ...base,
          ...money,
          shieldBonus: d.bonus,
          maxDex: d.maxDex,
          armorCheckPenalty: d.armorCheckPenalty,
          arcaneSpellFailurePct: d.arcaneSpellFailurePct,
          speed30: d.speed30,
          speed20: d.speed20,
        };
      } else {
        entry = {
          ...base,
          category: item.listing === "Extra" ? "armor-extra" : kebabOfListing(item.listing),
          ...money,
        };
      }
    } catch (error) {
      if (error instanceof EquipmentParseError) {
        throw new EquipmentParseError(`${item.url}: ${error.message}`);
      }
      throw error;
    }

    if (
      (kind === "weapons" || kind === "armor" || kind === "shields") &&
      collapseWhitespace(info.title).toLowerCase() !== item.name.toLowerCase()
    ) {
      reasons.push(`el título "${info.title}" no coincide con ItemName "${item.name}"`);
    }
    counters["entradas CRB"]!++;
    if (reasons.length > 0) needsReview.push({ id, reason: reasons.join("; ") });
    entries.push(entry);
  }

  return {
    entries,
    needsReview,
    excluded,
    counters,
    notes,
  };
};
