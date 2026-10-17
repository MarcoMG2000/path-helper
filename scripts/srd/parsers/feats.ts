import type { AnyNode, Element } from "domhandler";
import { resolveEntryId } from "../../../src/data/integrity/ids";
import {
  ABILITY_ENUM_VALUES,
  CRB_SOURCE_REF_PREFIX,
  slugify,
} from "../../../src/data/schema/common";
import { FEAT_TYPES, type FeatType } from "../../../src/data/schema/feat";
import {
  findContent,
  loadHtml,
  nodesToMarkdown,
  nodesToText,
  sourceLabels,
  splitSections,
  type Dom,
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
import { SectionError } from "../lib/sections";
import { collapseWhitespace } from "../lib/text";

// Parser de dotes de Archives of Nethys (Lote C, R17-R19, R45, R46). Puro y determinista.
// Estructura de una página (`FeatDisplay.aspx?ItemName=...`): un `h1` "Nombre (Tipo[, Tipo])" y, tras
// él, el bloque del libro principal (`Source`, frase de ambientación, `Prerequisites`, `Benefit`,
// `Normal`, `Special`); el contenido de otros libros (míticos, Pathfinder Unchained...) va debajo en
// secciones `h2` con su propio `Source`.

/**
 * Página de AoN con todo lo del CRB agrupado por tabla («Feats [176]», «Spells [623]»...). Es el
 * índice filtrado por libro del que sale el universo de dotes y su recuento (R17, R26): el índice
 * general `Feats.aspx` no trae el libro de cada dote (comprobado el 2026-10-16).
 */
export const CRB_SOURCE_URL =
  "https://aonprd.com/SourceDisplay.aspx?FixedSource=PRPG Core Rulebook";
const ORIGIN = "https://aonprd.com/";
const CATEGORY_URL = /^https:\/\/aonprd\.com\/Feats\.aspx\?Category=(.+)$/;
const FEAT_PAGE_URL = /FeatDisplay\.aspx\?ItemName=/i;

/** Listados de AoN por tipo que sirven de segunda lectura de `types` (General no tiene listado). */
const LISTED_TYPES = ["Combat", "Metamagic", "Item Creation", "Critical"] as const;

/** URL canónica de la página de una dote: `ItemName` codificado (los espacios como `%20`). */
export function featPageUrl(itemName: string): string {
  return `${ORIGIN}FeatDisplay.aspx?ItemName=${encodeURIComponent(itemName)}`;
}

/** `ItemName` de un enlace `FeatDisplay.aspx?ItemName=...` (sin codificar), o `undefined`. */
export function itemNameOfHref(href: string): string | undefined {
  const match = /FeatDisplay\.aspx\?ItemName=(.+)$/i.exec(href.trim());
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]!.replace(/\+/g, " "));
  } catch {
    return match[1];
  }
}

/** Nombres de dote (en orden de aparición, sin repetidos) de una tabla de dotes de AoN. */
export function featNamesOfListing(page: ParserPage): string[] {
  const $ = loadHtml(page.html);
  const names: string[] = [];
  const seen = new Set<string>();
  $("table#MainContent_GridView6 tr").each((_i, row) => {
    const href = $(row).find("a[href*='FeatDisplay.aspx']").first().attr("href");
    const name = href === undefined ? undefined : itemNameOfHref(href);
    if (name !== undefined && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  });
  return names;
}

export interface CrbFeatIndex {
  /** Recuento declarado por la propia página en el encabezado «Feats [N]». */
  declaredCount: number;
  /** `ItemName` de cada enlace de la sección, en orden y sin repetidos. */
  names: string[];
}

/** Sección «Feats [N]» de la página de fuente CRB; `undefined` si la página no la tiene. */
export function crbFeatIndex(page: ParserPage): CrbFeatIndex | undefined {
  const $ = loadHtml(page.html);
  const heading = $("h2")
    .filter((_i, h) => /^Feats \[\d+\]$/.test(collapseWhitespace($(h).text())))
    .first();
  if (heading.length === 0) return undefined;
  const declaredCount = Number(/\[(\d+)\]/.exec(heading.text())![1]);
  const names: string[] = [];
  for (const node of heading.nextUntil("h2, br").get()) {
    const anchors = node.type === "tag" && node.name === "a" ? [node] : [];
    for (const a of anchors) {
      const name = itemNameOfHref($(a).attr("href") ?? "");
      if (name !== undefined && !names.includes(name)) names.push(name);
    }
  }
  return { declaredCount, names };
}

/**
 * Universo de dotes: los enlaces de «Feats [N]» en la página de fuente CRB. El recuento declarado
 * (`expectedCount`) debe coincidir con el número de enlaces. Con subconjunto no se descubre nada.
 */
export function discover(input: DiscoverInput): DiscoverOutput {
  if (input.subset !== undefined) return { urls: [] };
  const page = input.seedPages.find((p) => p.url === CRB_SOURCE_URL);
  if (!page) return { urls: [] };
  const index = crbFeatIndex(page);
  if (!index) throw new Error(`${CRB_SOURCE_URL}: no tiene la sección "Feats [N]"`);
  if (index.declaredCount !== index.names.length) {
    throw new Error(
      `${CRB_SOURCE_URL}: «Feats [${index.declaredCount}]» declara ${index.declaredCount} dotes pero lista ${index.names.length}`,
    );
  }
  return {
    urls: index.names.map(featPageUrl),
    expectations: { expectedCount: index.declaredCount },
  };
}

// --- prerrequisitos ---------------------------------------------------------------------------

export interface PrereqToken {
  text: string;
  /** `ItemName` de los enlaces a dotes del token. */
  feats: string[];
}

export interface ParsedPrerequisites {
  raw: string;
  abilities?: Record<string, number>;
  bab?: number;
  casterLevel?: number;
  featIds: string[];
  skills: { skillId: string; ranks: number }[];
  other: string[];
}

function isElement(node: AnyNode): node is Element {
  return node.type === "tag";
}

/**
 * Trocea el texto de los prerrequisitos en comas y puntos y coma fuera de paréntesis. El texto de un
 * enlace es atómico (`Armor Proficiency, Heavy` lleva una coma dentro).
 */
export function tokenizePrerequisites($: Dom, nodes: readonly AnyNode[]): PrereqToken[] {
  const tokens: PrereqToken[] = [];
  let text = "";
  let feats: string[] = [];
  let depth = 0;
  const push = (): void => {
    const clean = collapseWhitespace(text).replace(/\.+$/, "").trim();
    if (clean !== "") tokens.push({ text: clean, feats });
    text = "";
    feats = [];
  };
  const walk = (node: AnyNode): void => {
    if (node.type === "text") {
      for (const ch of node.data) {
        if (ch === ":" && tokens.length === 0 && text.trim() === "") continue; // «Prerequisites»: ...
        if (ch === "(") depth++;
        else if (ch === ")") depth = Math.max(0, depth - 1);
        if ((ch === "," && depth === 0) || ch === ";") push();
        else text += ch;
      }
    } else if (isElement(node)) {
      if (node.name === "a") {
        const name = itemNameOfHref($(node).attr("href") ?? "");
        if (name !== undefined) feats.push(name);
        text += $(node).text();
      } else if (node.name !== "br") {
        for (const child of $(node).contents().get()) walk(child);
      }
    }
  };
  for (const node of nodes) walk(node);
  push();
  return tokens;
}

const ABILITY_NAMES: Readonly<Record<string, (typeof ABILITY_ENUM_VALUES)[number]>> = {
  str: "str",
  strength: "str",
  dex: "dex",
  dexterity: "dex",
  con: "con",
  constitution: "con",
  int: "int",
  intelligence: "int",
  wis: "wis",
  wisdom: "wis",
  cha: "cha",
  charisma: "cha",
};

function skillIdOf(name: string): string | undefined {
  const knowledge = /^knowledge\s*\(([^)]+)\)$/i.exec(name);
  if (knowledge) return `knowledge-${slugify(knowledge[1]!)}`;
  const base = name.replace(/\s*\([^)]*\)\s*$/, "");
  const id = slugify(base);
  return id === "" ? undefined : id;
}

export interface FeatNames {
  /** Nombre inglés en minúsculas -> id, de las dotes CRB del lote. */
  byName: ReadonlyMap<string, string>;
  ids: ReadonlySet<string>;
}

type Aliases = Readonly<Record<string, Readonly<Record<string, string>>>>;

/** Id de la dote CRB que nombra `text` (nombre exacto, slug o alias declarado), si la hay. */
function featIdOfText(text: string, feats: FeatNames, aliases: Aliases): string | undefined {
  const direct = feats.byName.get(text.toLowerCase());
  if (direct !== undefined) return direct;
  const id = resolveEntryId("feats", text, aliases);
  return feats.ids.has(id) ? id : undefined;
}

type Classified =
  | { kind: "ability"; ability: string; score: number }
  | { kind: "bab"; value: number }
  | { kind: "casterLevel"; value: number }
  | { kind: "skill"; skillId: string; ranks: number }
  | { kind: "feat"; id: string; qualifier: boolean }
  | { kind: "other" };

function classifyToken(token: PrereqToken, feats: FeatNames, aliases: Aliases): Classified {
  const text = token.text;
  // Alternativas («A or B») y conjunciones internas no se pueden representar: van a `other`.
  if (/\b(?:or|and)\b/i.test(text.replace(/\([^)]*\)/g, ""))) return { kind: "other" };

  const ability = /^([A-Za-z]+)\s+(\d+)$/.exec(text);
  if (ability && ABILITY_NAMES[ability[1]!.toLowerCase()]) {
    return {
      kind: "ability",
      ability: ABILITY_NAMES[ability[1]!.toLowerCase()]!,
      score: Number(ability[2]),
    };
  }
  const bab = /^base attack bonus\s*\+?(\d+)$/i.exec(text);
  if (bab) return { kind: "bab", value: Number(bab[1]) };
  const casterLevel = /^(?:caster level|CL)\s+(\d+)(?:st|nd|rd|th)?$/i.exec(text);
  if (casterLevel) return { kind: "casterLevel", value: Number(casterLevel[1]) };
  const skill = /^(.+?)\s+(\d+)\s+ranks?$/i.exec(text);
  if (skill) {
    const skillId = skillIdOf(skill[1]!.trim());
    if (skillId !== undefined) return { kind: "skill", skillId, ranks: Number(skill[2]) };
  }

  if (token.feats.length === 1) {
    const linked = token.feats[0]!;
    const id = featIdOfText(linked, feats, aliases) ?? resolveEntryId("feats", linked, aliases);
    // Un texto más largo que el nombre del enlace (p. ej. «Spell Focus (conjuration)») se conserva.
    return { kind: "feat", id, qualifier: text.toLowerCase() !== linked.toLowerCase() };
  }
  const exact = featIdOfText(text, feats, aliases);
  if (exact !== undefined) return { kind: "feat", id: exact, qualifier: false };
  // «Weapon Focus (longbow)» y «Weapon Focus with selected weapon»: la dote más su calificador.
  const qualified = /^(.+?)(?:\s*\([^)]+\)|\s+with\s+.+)$/i.exec(text);
  if (qualified) {
    const base = featIdOfText(qualified[1]!.trim(), feats, aliases);
    if (base !== undefined) return { kind: "feat", id: base, qualifier: true };
  }
  return { kind: "other" };
}

/**
 * Estructura los prerrequisitos (R17). Lo que no se sabe estructurar (clase, nivel de clase,
 * alternativas con «or», capacidades de clase...) va a `other`; `raw` se conserva siempre literal.
 * Una dote con calificador entre paréntesis queda en `featIds` y su texto completo en `other`.
 */
export function structurePrerequisites(
  raw: string,
  tokens: readonly PrereqToken[],
  feats: FeatNames,
  aliases: Aliases,
): ParsedPrerequisites {
  const out: ParsedPrerequisites = { raw, featIds: [], skills: [], other: [] };
  const abilities: Record<string, number> = {};

  // Une «A, B» partido por la coma cuando la unión es el nombre de una dote (Armor Proficiency, Heavy).
  const merged: PrereqToken[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const a = tokens[i]!;
    const b = tokens[i + 1];
    if (
      b !== undefined &&
      a.feats.length === 0 &&
      b.feats.length === 0 &&
      feats.byName.has(`${a.text}, ${b.text}`.toLowerCase())
    ) {
      merged.push({ text: `${a.text}, ${b.text}`, feats: [] });
      i++;
    } else {
      merged.push(a);
    }
  }

  for (const token of merged) {
    const c = classifyToken(token, feats, aliases);
    switch (c.kind) {
      case "ability":
        abilities[c.ability] = Math.max(abilities[c.ability] ?? 0, c.score);
        break;
      case "bab":
        out.bab = Math.max(out.bab ?? 0, c.value);
        break;
      case "casterLevel":
        out.casterLevel = Math.max(out.casterLevel ?? 0, c.value);
        break;
      case "skill":
        out.skills.push({ skillId: c.skillId, ranks: c.ranks });
        break;
      case "feat":
        if (!out.featIds.includes(c.id)) out.featIds.push(c.id);
        if (c.qualifier) out.other.push(token.text);
        break;
      case "other":
        out.other.push(token.text);
        break;
    }
  }
  if (Object.keys(abilities).length > 0) out.abilities = abilities;
  return out;
}

// --- página -----------------------------------------------------------------------------------

interface Segment {
  label: string | null; // null: texto previo a la primera etiqueta
  nodes: AnyNode[];
}

function labelOf($: Dom, node: AnyNode): string | undefined {
  if (!isElement(node) || (node.name !== "b" && node.name !== "strong")) return undefined;
  return collapseWhitespace($(node).text()).replace(/:$/, "").trim();
}

/**
 * Divide el bloque principal en segmentos por las etiquetas en negrita que abren un párrafo.
 * Una etiqueta desconocida es un encabezado fuera de la lista permitida (R45).
 */
/** Etiquetas que abren un campo de la dote; el resto de las permitidas son subtítulos de contenido. */
const STRUCTURAL_LABELS: ReadonlySet<string> = new Set([
  "source",
  "prerequisites",
  "prerequisite",
  "benefit",
  "normal",
  "special",
]);

function segmentsOf(
  $: Dom,
  nodes: readonly AnyNode[],
  allowed: ReadonlySet<string>,
  page: string,
  inlineLabels: string[],
): Segment[] {
  const segments: Segment[] = [{ label: null, nodes: [] }];
  let atStart = true;
  for (const node of nodes) {
    const label = atStart ? labelOf($, node) : undefined;
    if (label !== undefined) {
      if (!allowed.has(label.toLowerCase())) throw new SectionError(page, label);
      if (STRUCTURAL_LABELS.has(label.toLowerCase())) {
        segments.push({ label, nodes: [] });
        atStart = false;
        continue;
      }
      // Subtítulo permitido dentro de un campo (p. ej. «Leadership Modifiers» en Benefit): es contenido.
      if (segments.length < 3) throw new SectionError(page, label);
      inlineLabels.push(label);
    }
    segments[segments.length - 1]!.nodes.push(node);
    if (isElement(node) && node.name === "br") atStart = true;
    else if (node.type === "text" ? node.data.trim() !== "" : true) atStart = false;
  }
  return segments;
}

/**
 * Expande `rowspan`/`colspan` repitiendo el contenido de la celda en las posiciones que ocupa, de modo
 * que la tabla en Markdown (que no admite celdas combinadas) conserve cada columna bajo su encabezado.
 */
export function expandTables($: Dom, nodes: readonly AnyNode[]): void {
  const tables = nodes.flatMap((node) => {
    const own = isElement(node) && node.name === "table" ? [node] : [];
    return [...own, ...$(node).find("table").get()];
  });
  for (const table of tables) {
    const grid: string[][] = [];
    $(table)
      .find("tr")
      .each((r, tr) => {
        const row = (grid[r] ??= []);
        let c = 0;
        $(tr)
          .children("td,th")
          .each((_i, cell) => {
            while (row[c] !== undefined) c++;
            const colspan = Math.max(1, Number($(cell).attr("colspan") ?? 1) || 1);
            const rowspan = Math.max(1, Number($(cell).attr("rowspan") ?? 1) || 1);
            const html = $(cell).html() ?? "";
            for (let dr = 0; dr < rowspan; dr++) {
              const target = (grid[r + dr] ??= []);
              for (let dc = 0; dc < colspan; dc++) target[c + dc] = html;
            }
            c += colspan;
          });
      });
    const body = grid
      .map((row) => `<tr>${Array.from(row, (html) => `<td>${html ?? ""}</td>`).join("")}</tr>`)
      .join("");
    $(table).html(body);
  }
}

/** Texto plano literal: concatena sin separadores (los enlaces no insertan espacios). */
function plainText($: Dom, nodes: readonly AnyNode[]): string {
  return collapseWhitespace(nodes.map((n) => $(n).text()).join(""));
}

function stripLead(markdown: string): string {
  return markdown.replace(/^\s*:\s*/, "").trim();
}

interface PageInfo {
  url: string;
  html: string;
  itemName: string;
  title: string;
  main: Section;
  others: Section[];
  labels: string[];
  crbLabel: string | undefined;
}

function sourceOf($: Dom, nodes: readonly AnyNode[]): string[] {
  const idx = nodes.findIndex((n) => labelOf($, n)?.toLowerCase() === "source");
  if (idx < 0) return [];
  const rest: AnyNode[] = [];
  for (const node of nodes.slice(idx + 1)) {
    if (isElement(node) && node.name === "br") break;
    rest.push(node);
  }
  return sourceLabels([{ label: "Source", value: nodesToText($, rest), nodes: [] }]);
}

/** Lee el `h1` y los bloques de una página de dote; `undefined` si no tiene el contenido esperado. */
function readPage(page: ParserPage): PageInfo | undefined {
  const $ = loadHtml(page.html);
  const sections = splitSections($, findContent($));
  const mainIndex = sections.findIndex((s) => s.level === 1);
  if (mainIndex < 0) return undefined;
  const main = sections[mainIndex]!;
  const labels = sourceOf($, main.nodes);
  if (labels.length === 0) return undefined;
  const itemName = itemNameOfHref(page.url) ?? main.heading;
  return {
    url: page.url,
    html: page.html,
    itemName,
    title: main.heading,
    main,
    others: sections.slice(mainIndex + 1),
    labels,
    crbLabel: labels.find((l) => l.startsWith(CRB_SOURCE_REF_PREFIX)),
  };
}

function nameAndTypes(title: string, page: string): { name: string; types: FeatType[] } {
  const m = /^(.*?)\s*\(([^()]+)\)$/.exec(title);
  if (!m) return { name: title, types: ["General"] };
  const tags = m[2]!.split(",").map((t) => t.trim());
  const known = tags.filter((t): t is FeatType => (FEAT_TYPES as readonly string[]).includes(t));
  if (known.length !== tags.length) {
    throw new Error(
      `${page}: la etiqueta de tipo "(${m[2]})" del título "${title}" no es un tipo de dote del CRB`,
    );
  }
  return { name: m[1]!.trim(), types: [...new Set(known)] };
}

export const parse: CategoryParser = (input) => {
  const allowed = new Set(input.config.allowedSections.map((s) => s.toLowerCase()));
  const aliases = input.config.slugAliases;
  const pages = [...input.pages].sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));

  // Segunda lectura de `types`: los listados de AoN por tipo.
  const listed = new Map<string, Set<string>>();
  for (const page of pages) {
    const m = CATEGORY_URL.exec(page.url);
    if (!m) continue;
    const category = decodeURIComponent(m[1]!.replace(/\+/g, " "));
    if ((LISTED_TYPES as readonly string[]).includes(category)) {
      listed.set(category, new Set(featNamesOfListing(page).map((n) => n.toLowerCase())));
    }
  }

  // Universo: la sección «Feats [N]» de la página de fuente CRB (R17, R26, R27).
  const sourcePage = pages.find((p) => p.url === CRB_SOURCE_URL);
  const universe = sourcePage ? crbFeatIndex(sourcePage) : undefined;
  if (!universe) {
    throw new Error(
      `falta en la procedencia la página ${CRB_SOURCE_URL} con la sección "Feats [N]"`,
    );
  }
  if (universe.declaredCount !== universe.names.length) {
    throw new Error(
      `«Feats [${universe.declaredCount}]» declara ${universe.declaredCount} dotes pero lista ${universe.names.length}`,
    );
  }
  const listedNames = new Set(universe.names);

  const excluded: ExcludedPage[] = [];
  const crbPages: PageInfo[] = [];
  const unreadable: string[] = [];
  const unlistedCrb: string[] = [];
  const foundListed = new Set<string>();
  for (const page of pages) {
    if (!FEAT_PAGE_URL.test(page.url)) continue;
    const itemName = itemNameOfHref(page.url) ?? page.url;
    const info = readPage(page);
    if (listedNames.has(itemName)) {
      if (info?.crbLabel === undefined) unreadable.push(page.url);
      else {
        foundListed.add(itemName);
        crbPages.push(info);
      }
    } else if (info?.crbLabel !== undefined) {
      unlistedCrb.push(page.url); // etiqueta CRB que el índice de fuente no recoge
    } else {
      excluded.push({
        url: page.url,
        book: info === undefined ? "(sin contenido)" : info.labels.join(", "),
        reason: "libro distinto de CRB (R27)",
      });
    }
  }
  const missing = universe.names.filter(
    (n) => !foundListed.has(n) && !unreadable.some((u) => itemNameOfHref(u) === n),
  );
  const problems = [
    ...unreadable.map((u) => `  - listada como CRB pero sin etiqueta Source CRB legible: ${u}`),
    ...unlistedCrb.map(
      (u) => `  - con etiqueta Source CRB pero ausente del índice «Feats [N]»: ${u}`,
    ),
    ...missing.map((n) => `  - listada en el índice pero falta su página en la procedencia: ${n}`),
  ];
  if (problems.length > 0) {
    throw new Error(`el universo de dotes CRB no es coherente:\n${problems.join("\n")}`);
  }

  // Nombres de las dotes CRB (para reconocer prerrequisitos sin enlace y detectar repetidos).
  const byName = new Map<string, string>();
  for (const info of crbPages) {
    const { name } = nameAndTypes(info.title, info.url);
    byName.set(name.toLowerCase(), resolveEntryId("feats", name, aliases));
  }
  const featNames: FeatNames = { byName, ids: new Set(byName.values()) };

  const entries: ParsedEntry[] = [];
  const inlineLabels: string[] = [];
  const needsReview: NeedsReviewItem[] = [];
  const notes: string[] = [];
  const counters: Record<string, number> = {
    "dotes CRB": 0,
    "páginas de otro libro": excluded.length,
    "secciones de otros libros ignoradas": 0,
    "dotes con varias etiquetas Source": 0,
    "dotes con prerrequisitos en other": 0,
    "dotes con segunda lectura de tipo distinta": 0,
  };
  for (const type of FEAT_TYPES) counters[`dotes de tipo ${type}`] = 0;

  for (const info of crbPages) {
    const $ = loadHtml(info.html);
    const reasons: string[] = [];
    const { name, types } = nameAndTypes(info.title, info.url);
    const id = resolveEntryId("feats", name, aliases);
    if (name.toLowerCase() !== info.itemName.toLowerCase()) {
      reasons.push(`el título "${info.title}" no coincide con ItemName "${info.itemName}"`);
    }

    // Secciones de otros libros: cada una debe declarar un Source que no sea el CRB (R45).
    for (const section of info.others) {
      const labels = sourceOf($, section.nodes);
      if (labels.length === 0 || labels.some((l) => l.startsWith(CRB_SOURCE_REF_PREFIX))) {
        throw new SectionError(info.url, section.heading);
      }
      counters["secciones de otros libros ignoradas"]!++;
    }

    expandTables($, info.main.nodes);
    const segments = segmentsOf($, info.main.nodes, allowed, info.url, inlineLabels);
    const sourceSeg = segments.findIndex((s) => s.label?.toLowerCase() === "source");
    if (sourceSeg !== 1) throw new SectionError(info.url, "Source (no es la primera etiqueta)");
    const body = segments.slice(2);
    const sourceRest = segments[1]!.nodes;
    // Texto tras la línea Source: ambientación (hasta la primera etiqueta) + etiquetas.
    const brIndex = sourceRest.findIndex((n) => isElement(n) && n.name === "br");
    const flavor = brIndex < 0 ? [] : sourceRest.slice(brIndex + 1);
    const textNodes = [...flavor, ...body.flatMap((s) => [...labelNodes($, s), ...s.nodes])];

    const byLabel = new Map<string, Segment>();
    for (const seg of body) {
      const key = seg.label!.toLowerCase();
      if (byLabel.has(key)) throw new SectionError(info.url, `${seg.label} (repetida)`);
      byLabel.set(key, seg);
    }
    const prereqSeg = byLabel.get("prerequisites") ?? byLabel.get("prerequisite");
    const benefit = byLabel.get("benefit");
    if (!benefit) throw new SectionError(info.url, "Benefit (ausente)");
    const rawPrereq = prereqSeg ? stripLead(plainText($, prereqSeg.nodes)) : "";
    const prerequisites = structurePrerequisites(
      rawPrereq,
      prereqSeg ? tokenizePrerequisites($, prereqSeg.nodes) : [],
      featNames,
      aliases,
    );

    const entry: ParsedEntry = {
      id,
      name,
      textEn: nodesToMarkdown($, textNodes),
      source: info.url,
      sourceRef: info.crbLabel!,
      book: "CRB",
      types,
      prerequisites: cleanPrerequisites(prerequisites),
      benefit: stripLead(nodesToMarkdown($, benefit.nodes)),
    };
    const normal = byLabel.get("normal");
    if (normal) entry["normal"] = stripLead(nodesToMarkdown($, normal.nodes));
    const special = byLabel.get("special");
    if (special) entry["special"] = stripLead(nodesToMarkdown($, special.nodes));

    // Varias etiquetas Source en el bloque principal: el texto puede ser el de otro libro (design §2).
    if (info.labels.length > 1) {
      counters["dotes con varias etiquetas Source"]!++;
      reasons.push(`varias etiquetas Source: ${info.labels.join(", ")}`);
    }
    // Segunda lectura de `types` contra los listados por tipo.
    for (const type of LISTED_TYPES) {
      const set = listed.get(type);
      if (!set) continue;
      const inList = set.has(info.itemName.toLowerCase());
      if (inList !== types.includes(type)) {
        counters["dotes con segunda lectura de tipo distinta"]!++;
        reasons.push(
          `el título dice types=[${types.join(", ")}] pero el listado ${type} ${inList ? "la incluye" : "no la incluye"}`,
        );
      }
    }
    if (prerequisites.other.length > 0) {
      counters["dotes con prerrequisitos en other"]!++;
      notes.push(`other: ${id}: ${prerequisites.other.join(" | ")} (raw: ${prerequisites.raw})`);
    }
    for (const type of types) counters[`dotes de tipo ${type}`]!++;
    counters["dotes CRB"]!++;
    if (reasons.length > 0) needsReview.push({ id, reason: reasons.join("; ") });
    entries.push(entry);
  }

  if (!listed.size) notes.push("sin listados por tipo en la procedencia: no se contrastó `types`");

  if (inlineLabels.length > 0) {
    notes.push(
      `subtítulos permitidos dentro de un campo (se conservan como contenido): ${inlineLabels.join(", ")}`,
    );
  }

  return {
    entries,
    shardOf: (entry) => `feats/${entry.id.charAt(0)}.json`,
    needsReview,
    excluded,
    counters,
    notes,
  };
};

function labelNodes($: Dom, segment: Segment): AnyNode[] {
  // Reconstruye el nodo `<b>Etiqueta</b>` para que el Markdown lleve `**Etiqueta**`.
  const b = $("<b></b>").text(segment.label ?? "");
  return b.get();
}

function cleanPrerequisites(p: ParsedPrerequisites): Record<string, unknown> {
  const out: Record<string, unknown> = { raw: p.raw };
  if (p.abilities) out["abilities"] = p.abilities;
  if (p.bab !== undefined) out["bab"] = p.bab;
  if (p.casterLevel !== undefined) out["casterLevel"] = p.casterLevel;
  out["featIds"] = p.featIds;
  out["skills"] = p.skills;
  out["other"] = p.other;
  return out;
}
