import type { AnyNode } from "domhandler";
import { CRB_SOURCE_REF_PREFIX } from "../../../src/data/schema/common";
import { SPELL_DESCRIPTORS, SPELL_SCHOOLS, SPELL_SUBSCHOOLS } from "../../../src/data/schema/spell";
import {
  classifyCastingTime,
  classifyComponents,
  classifyDuration,
  classifyRange,
  classifySavingThrow,
  classifySpellResistance,
  targetingKindFromLabel,
  unrecognizedComponentTokens,
  type Targeting,
} from "../../../src/data/spells/fields";
import {
  labelledFields,
  loadHtml,
  nodesToMarkdown,
  sourceLabels,
  type Dom,
  type Field,
} from "../lib/html";
import { assertAllowedHeadings } from "../lib/sections";
import { resolveEntryId, slugify } from "../lib/slug";
import { collapseWhitespace, normalizePunctuation } from "../lib/text";
import type {
  DiscoverInput,
  DiscoverOutput,
  ExcludedPage,
  NeedsReviewItem,
  ParsedEntry,
  ParserInput,
  ParserOutput,
  ParserPage,
} from "../lib/parser-contract";
import {
  LevelLineError,
  loadSpellBatches,
  loadSpellClassCatalog,
  parseLevelLine,
  type SpellBatches,
  type SpellClassCatalog,
} from "./spells-config";

// Parser de conjuros del capítulo 10 del CRB (R20, R45, R93, R94, R97, R99, R102).
//
// Universo (R93): el índice de Archives of Nethys (`Spells.aspx?Class=All`) NO trae el libro de
// cada conjuro; el filtro CRB sale de la página de fuente `SourceDisplay.aspx?FixedSource=PRPG Core
// Rulebook` (sección «Spells [N]»). Ambas páginas son semillas del subconjunto `index` y, en cada
// `data:parse spells:<lote>`, llegan junto a las páginas del lote (procedencia `spells/index.json`).
// El parser comprueba que las páginas del lote son EXACTAMENTE las del filtro CRB de su rango.

export const AON_ORIGIN = "https://www.aonprd.com";
export const SPELL_INDEX_URL = `${AON_ORIGIN}/Spells.aspx?Class=All`;
export const CRB_SOURCE_URL = `${AON_ORIGIN}/SourceDisplay.aspx?FixedSource=PRPG Core Rulebook`;
export const SPELL_PAGE_PREFIX = `${AON_ORIGIN}/SpellDisplay.aspx?ItemName=`;

/** URL canónica de la página de un conjuro (el nombre tal cual lo enlaza la fuente). */
export function spellPageUrl(itemName: string): string {
  return `${SPELL_PAGE_PREFIX}${itemName}`;
}

// --- Índices -----------------------------------------------------------------------------------

export interface CrbSpellRef {
  name: string;
  url: string;
}

export interface CrbSpellList {
  /** Recuento declarado en el encabezado «Spells [N]» de la fuente. */
  declared: number;
  spells: CrbSpellRef[];
}

/** Conjuros CRB de la página de fuente (`SourceDisplay.aspx?FixedSource=PRPG Core Rulebook`). */
export function extractCrbSpells(html: string): CrbSpellList {
  const $ = loadHtml(html);
  const headings = $("h2")
    .toArray()
    .filter((h) => /^Spells \[\d+\]$/.test(collapseWhitespace($(h).text())));
  if (headings.length !== 1) {
    throw new Error(`${CRB_SOURCE_URL}: se esperaba un único encabezado «Spells [N]»`);
  }
  const heading = headings[0]!;
  const declared = Number(/\[(\d+)\]/.exec($(heading).text())![1]);
  const spells: CrbSpellRef[] = [];
  const seen = new Set<string>();
  for (const link of $(heading).nextUntil("h2").filter("a").toArray()) {
    const href = $(link).attr("href") ?? "";
    const match = /^SpellDisplay\.aspx\?ItemName=(.+)$/.exec(href);
    if (!match) throw new Error(`${CRB_SOURCE_URL}: enlace de conjuro inesperado "${href}"`);
    const name = match[1]!;
    if (collapseWhitespace($(link).text()) !== name) {
      throw new Error(`${CRB_SOURCE_URL}: el texto del enlace no coincide con "${name}"`);
    }
    if (seen.has(name)) throw new Error(`${CRB_SOURCE_URL}: conjuro repetido "${name}"`);
    seen.add(name);
    spells.push({ name, url: spellPageUrl(name) });
  }
  if (spells.length !== declared) {
    throw new Error(
      `${CRB_SOURCE_URL}: el encabezado declara ${declared} conjuros y hay ${spells.length} enlaces`,
    );
  }
  return { declared, spells };
}

/** Nombres de todos los conjuros del índice completo (`Spells.aspx?Class=All`). */
export function extractIndexNames(html: string): Set<string> {
  const $ = loadHtml(html);
  const names = new Set<string>();
  for (const link of $('a[href^="SpellDisplay.aspx?ItemName="]').toArray()) {
    const href = $(link).attr("href") ?? "";
    names.add(href.slice(href.indexOf("ItemName=") + "ItemName=".length));
  }
  return names;
}

/** Descripción corta de cada conjuro del índice completo (`Spells.aspx?Class=All`), por nombre. */
export function extractIndexDescriptions(html: string): Map<string, string> {
  const $ = loadHtml(html);
  const found = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const span of $('span[id^="MainContent_DataListTypes_LabelName"]').toArray()) {
    const link = $(span).find('a[href^="SpellDisplay.aspx?ItemName="]').first();
    const href = link.attr("href");
    if (!href) continue;
    const name = href.slice(href.indexOf("ItemName=") + "ItemName=".length);
    const copy = $(span).clone();
    copy.find("b, sup").remove();
    const text = collapseWhitespace(copy.text()).replace(/^:\s*/, "");
    if (found.has(name)) ambiguous.add(name);
    found.set(name, text);
  }
  for (const name of ambiguous) found.delete(name); // nombre repetido: no se adivina
  for (const [name, text] of found) if (text === "") found.delete(name);
  return found;
}

// --- Una página de conjuro ---------------------------------------------------------------------

type Counters = Record<string, number>;

function bump(counters: Counters, key: string, by = 1): void {
  counters[key] = (counters[key] ?? 0) + by;
}

function isTag(node: AnyNode, name: string | RegExp): boolean {
  return (
    node.type === "tag" && (typeof name === "string" ? node.name === name : name.test(node.name))
  );
}

interface Segment {
  heading: string;
  nodes: AnyNode[];
}

/** Parte `nodes` en un tramo inicial y un tramo por cada encabezado `tag`. */
function splitByTag(
  $: Dom,
  nodes: readonly AnyNode[],
  tag: string,
): { head: AnyNode[]; segments: Segment[] } {
  const head: AnyNode[] = [];
  const segments: Segment[] = [];
  for (const node of nodes) {
    if (isTag(node, tag)) {
      segments.push({ heading: collapseWhitespace($(node).text()), nodes: [] });
    } else {
      (segments.at(-1)?.nodes ?? head).push(node);
    }
  }
  return { head, segments };
}

function normalizeName(name: string): string {
  return normalizePunctuation(collapseWhitespace(name)).toLowerCase();
}

const TARGETING_LABEL =
  /^(?:targets?|area|effect)(?:(?:,\s*or\s+|,\s*|\s+or\s+|\s*\/\s*)(?:targets?|area|effect))*$/;
const SINGLE_LABELS = new Set([
  "source",
  "school",
  "level",
  "casting time",
  "components",
  "range",
  "duration",
  "saving throw",
  "spell resistance",
]);

export interface SpellPageDeps {
  catalog: SpellClassCatalog;
  slugAliases: ParserInput["config"]["slugAliases"];
  allowedSections: readonly string[];
  /** Descripciones cortas del índice completo (si la página del índice está disponible). */
  descriptions?: ReadonlyMap<string, string>;
}

export type SpellPageResult =
  | {
      kind: "entry";
      entry: ParsedEntry;
      review: string[];
      counters: Counters;
      notes: string[];
    }
  | { kind: "excluded"; excluded: ExcludedPage; counters: Counters };

const SCHOOL_LINE = /^([a-z]+)(?:\s*\(([^)]*)\))?(?:\s*\[([^\]]*)\])?$/;

/** Quita las marcas de cursiva Markdown (`*texto*`) de un valor de campo, dejando el texto. */
export function stripEmphasis(value: string): string {
  return value.replace(/\*([^*\n]+)\*/g, "$1");
}

export interface SchoolLine {
  school: string;
  subschool: string | undefined;
  additionalSubschools: string[];
  descriptors: string[];
  /** La línea traía «[see text...]»: el descriptor lo decide el texto del conjuro. */
  seeText: boolean;
}

/**
 * Línea School de la fuente: `conjuration (calling or creation)`, `illusion (figment, glamer)`,
 * `evocation [fire or cold]`, `transmutation [see text]`. Las alternativas se separan por «,» y
 * «or»/«and»; «see text...» no es un descriptor y se omite. Un valor fuera de los catálogos
 * cerrados del CRB lanza (R45): lo decide una persona, no se inventa un id.
 */
export function parseSchoolLine(raw: string): SchoolLine {
  const match = SCHOOL_LINE.exec(raw.toLowerCase().trim());
  if (!match) throw new Error(`línea School ilegible: «${raw}»`);
  const school = match[1]!;
  if (!(SPELL_SCHOOLS as readonly string[]).includes(school)) {
    throw new Error(`escuela desconocida «${school}»`);
  }
  const split = (list: string): string[] =>
    list
      .split(/\s*,\s*|\s+(?:or|and)\s+/)
      .map((token) => token.trim())
      .filter((token) => token !== "");
  const subschools = split(match[2] ?? "").map((token) => slugify(token));
  for (const sub of subschools) {
    if (!(SPELL_SUBSCHOOLS as readonly string[]).includes(sub)) {
      throw new Error(`subescuela desconocida «${sub}» en «${raw}»`);
    }
  }
  let seeText = false;
  const descriptors: string[] = [];
  for (const token of split(match[3] ?? "")) {
    if (token.startsWith("see text")) {
      seeText = true;
      continue;
    }
    const descriptor = slugify(token);
    if (!(SPELL_DESCRIPTORS as readonly string[]).includes(descriptor)) {
      throw new Error(`descriptor desconocido «${descriptor}» en «${raw}»`);
    }
    descriptors.push(descriptor);
  }
  return {
    school,
    subschool: subschools[0],
    additionalSubschools: subschools.slice(1),
    descriptors,
    seeText,
  };
}

/** Parsea la página `SpellDisplay.aspx?ItemName=<nombre>` de un conjuro. */
export function parseSpellPage(page: ParserPage, deps: SpellPageDeps): SpellPageResult {
  const fail = (message: string): never => {
    throw new Error(`${page.url}: ${message}`);
  };
  const itemName = new URL(page.url).searchParams.get("ItemName");
  if (itemName === null) return fail("la URL no trae ItemName");
  const $ = loadHtml(page.html);

  // La página puede traer varias entradas (mismo grupo de nombres, otros libros): se elige la del
  // nombre pedido. Los tramos antes del primer h1 y las demás entradas se ignoran.
  const nodes = $('span[id^="MainContent_DataListTypes_LabelName"]')
    .toArray()
    .flatMap((span) => $(span).contents().toArray());
  const { segments: entries } = splitByTag($, nodes, "h1");
  const wanted = normalizeName(itemName);
  const matches = entries.filter((e) => normalizeName(e.heading) === wanted);
  if (matches.length !== 1) {
    return fail(`se esperaba una única entrada «${itemName}» y hay ${matches.length}`);
  }
  const title = matches[0]!;

  // Subsecciones h2 (contenido de otros libros: «Mythic ...»): se excluyen si declaran un libro
  // distinto del CRB; cualquier otra cosa debe estar en la lista permitida (R45).
  const counters: Counters = {};
  const { head: mainNodes, segments: extras } = splitByTag($, title.nodes, "h2");
  // Un h2 sin `Source` propio que sigue a una sección ya excluida por libro (p. ej. «Core
  // Incarnations» tras «Reincarnation on Golarion») hereda su exclusión; suelto sigue fallando (R45).
  let afterExcluded = false;
  for (const extra of extras) {
    const books = sourceLabels(labelledFields($, extra.nodes));
    const otherBook = books.length > 0 && !books.some((b) => b.startsWith(CRB_SOURCE_REF_PREFIX));
    if (otherBook || (books.length === 0 && afterExcluded)) {
      bump(counters, "secciones de otro libro excluidas");
      afterExcluded = true;
      continue;
    }
    afterExcluded = false;
    assertAllowedHeadings(page.url, [extra.heading], deps.allowedSections);
  }

  const { head, segments } = splitByTag($, mainNodes, "h3");
  assertAllowedHeadings(
    page.url,
    segments.map((s) => s.heading),
    deps.allowedSections,
  );
  for (const node of mainNodes) {
    if (node.type !== "tag") continue;
    const deep = $(node)
      .find("h4,h5,h6")
      .toArray()
      .map((h) => collapseWhitespace($(h).text()));
    if (/^h[4-6]$/.test(node.name)) deep.push(collapseWhitespace($(node).text()));
    assertAllowedHeadings(page.url, deep, deps.allowedSections);
  }
  const descriptionSegments = segments.filter((s) => s.heading.toLowerCase() === "description");
  if (descriptionSegments.length !== 1) fail("se esperaba una única sección «Description»");
  const description = descriptionSegments[0]!;

  const fields: Field[] = [
    ...labelledFields($, head),
    ...segments.filter((s) => s !== description).flatMap((s) => labelledFields($, s.nodes)),
  ];
  const byLabel = new Map<string, string>();
  const targeting: Targeting[] = [];
  for (const field of fields) {
    const label = field.label.toLowerCase();
    // `raw` es literal: sin las marcas de cursiva Markdown (*nombre de conjuro*) de la conversión.
    const value = stripEmphasis(field.value);
    if (TARGETING_LABEL.test(label)) {
      targeting.push({ kind: targetingKindFromLabel(field.label), raw: value });
    } else if (SINGLE_LABELS.has(label)) {
      if (byLabel.has(label)) fail(`etiqueta repetida «${field.label}»`);
      byLabel.set(label, value);
    } else {
      fail(`etiqueta de cabecera desconocida «${field.label}»`);
    }
  }
  const need = (label: string): string => {
    const value = byLabel.get(label);
    if (value === undefined || value === "") return fail(`falta el campo «${label}»`);
    return value;
  };

  // Libro (R46): sin etiqueta CRB la página se excluye.
  const labels = sourceLabels(fields);
  if (labels.length === 0) fail("falta el campo «Source»");
  const crbLabel = labels.find((l) => l.startsWith(CRB_SOURCE_REF_PREFIX));
  if (crbLabel === undefined) {
    return {
      kind: "excluded",
      excluded: {
        url: page.url,
        book: labels.map((l) => l.replace(/\s+pg\.\s*\d+.*$/, "")).join(", "),
        reason: "la etiqueta Source no es PRPG Core Rulebook",
      },
      counters,
    };
  }

  const name = title.heading;
  const id = resolveEntryId("spells", name, deps.slugAliases);
  const review: string[] = [];
  const notes: string[] = [];

  // Escuela, subescuela y descriptores: `evocation`, `conjuration (healing)`, `necromancy [evil]`.
  let schoolLine;
  try {
    schoolLine = parseSchoolLine(need("school"));
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
  const { school, subschool, additionalSubschools, descriptors } = schoolLine;
  if (schoolLine.seeText) bump(counters, "descriptores «see text» omitidos");

  // Línea Level (R94, R97, R102).
  let levelResult;
  try {
    levelResult = parseLevelLine(need("level"), deps.catalog);
  } catch (error) {
    if (error instanceof LevelLineError) return fail(`${error.message} (token «${error.token}»)`);
    throw error;
  }
  for (const dropped of levelResult.discarded) {
    bump(counters, "clases de otro libro descartadas");
    bump(counters, `clase descartada: ${dropped}`);
  }
  if (Object.keys(levelResult.levels).length === 0) {
    review.push("levels vacío tras descartar las clases de otro libro (R102)");
    bump(counters, "conjuros con levels vacío");
  }
  if (labels.length > 1) {
    review.push(`varias etiquetas Source: ${labels.join(", ")}`);
    bump(counters, "conjuros con varias etiquetas Source");
  }

  // Campos estructurados (R96); `raw` literal. Savings/SR ausentes: raw vacío y kind other.
  const castingTime = classifyCastingTime(need("casting time"));
  const componentsRaw = need("components");
  const components = classifyComponents(componentsRaw);
  const unknownComponents = unrecognizedComponentTokens(componentsRaw);
  if (unknownComponents.length > 0) {
    review.push(`componentes no reconocidos: ${unknownComponents.join(" | ")}`);
    bump(counters, "conjuros con componentes no reconocidos");
  }
  const range = classifyRange(need("range"));
  const duration = classifyDuration(need("duration"));
  const savingThrow = classifySavingThrow(byLabel.get("saving throw") ?? "");
  const spellResistance = classifySpellResistance(byLabel.get("spell resistance") ?? "");
  if (!byLabel.has("saving throw")) bump(counters, "campo ausente: savingThrow");
  if (!byLabel.has("spell resistance")) bump(counters, "campo ausente: spellResistance");
  const others: [string, string, boolean][] = [
    ["castingTime", castingTime.raw, castingTime.unit === "other"],
    ["range", range.raw, range.kind === "other"],
    ["duration", duration.raw, duration.kind === "other"],
    ["savingThrow", savingThrow.raw, savingThrow.kind === "other" && byLabel.has("saving throw")],
    [
      "spellResistance",
      spellResistance.raw,
      spellResistance.applies === "other" && byLabel.has("spell resistance"),
    ],
    ...targeting.map((t): [string, string, boolean] => ["targeting", t.raw, t.kind === "other"]),
  ];
  for (const [field, raw, isOther] of others) {
    if (!isOther) continue;
    bump(counters, `kind other: ${field}`);
    notes.push(`kind other: ${id} ${field}: «${raw}»`);
  }

  const textEn = nodesToMarkdown($, description.nodes);
  if (textEn === "") fail("la sección «Description» está vacía");

  const shortDescription = deps.descriptions?.get(itemName);
  if (deps.descriptions && shortDescription === undefined) {
    bump(counters, "sin descripción corta en el índice");
  }

  const entry: ParsedEntry = {
    id,
    name,
    textEn,
    source: page.url,
    sourceRef: crbLabel,
    book: "CRB",
    school,
    ...(subschool === undefined ? {} : { subschool }),
    ...(additionalSubschools.length === 0 ? {} : { additionalSubschools }),
    descriptors,
    levels: levelResult.levels,
    castingTime,
    components,
    range,
    targeting,
    duration,
    savingThrow,
    spellResistance,
    ...(shortDescription === undefined ? {} : { shortDescriptionEn: shortDescription }),
  };
  return { kind: "entry", entry, review, counters, notes };
}

// --- Lotes y universo --------------------------------------------------------------------------

interface ClassifiedPages {
  index: ParserPage | undefined;
  crb: ParserPage | undefined;
  spells: ParserPage[];
}

function classifyPages(pages: readonly ParserPage[]): ClassifiedPages {
  const out: ClassifiedPages = { index: undefined, crb: undefined, spells: [] };
  for (const page of pages) {
    if (page.url === SPELL_INDEX_URL) out.index = page;
    else if (page.url === CRB_SOURCE_URL) out.crb = page;
    else if (page.url.startsWith(SPELL_PAGE_PREFIX)) out.spells.push(page);
    else throw new Error(`página no reconocida para spells: ${page.url}`);
  }
  return out;
}

function initialOf(id: string): string {
  const initial = id[0] ?? "";
  if (!/^[a-z]$/.test(initial)) throw new Error(`el id "${id}" no empieza por una letra a-z`);
  return initial;
}

/** Conjuros del filtro CRB que caen en el lote `subset` (todos si `subset` es `undefined`). */
export function crbSpellsOfBatch(
  crb: CrbSpellList,
  batches: SpellBatches,
  subset: string | undefined,
  slugAliases: ParserInput["config"]["slugAliases"],
): CrbSpellRef[] {
  const range = subset === undefined ? undefined : batches.batches.find((b) => b.id === subset);
  if (subset !== undefined && !range) {
    throw new Error(
      `lote de conjuros desconocido "${subset}" (válidos: ${batches.batches.map((b) => b.id).join(", ")})`,
    );
  }
  return crb.spells.filter((s) => {
    if (!range) return true;
    const initial = initialOf(resolveEntryId("spells", s.name, slugAliases));
    return initial >= range.from && initial <= range.to;
  });
}

function sameSet(expected: readonly string[], actual: readonly string[]): string | undefined {
  const a = new Set(actual);
  const e = new Set(expected);
  const missing = expected.filter((u) => !a.has(u));
  const extra = actual.filter((u) => !e.has(u));
  if (missing.length === 0 && extra.length === 0) return undefined;
  return (
    (missing.length > 0
      ? `faltan ${missing.length} página(s) del filtro CRB: ${missing.slice(0, 5).join(" | ")}`
      : "") +
    (extra.length > 0
      ? ` sobran ${extra.length} página(s) fuera del filtro CRB: ${extra.slice(0, 5).join(" | ")}`
      : "")
  ).trim();
}

export interface SpellsParseDeps {
  batches: SpellBatches;
  catalog: SpellClassCatalog;
}

/** Núcleo testeable de `parse` (los catálogos se inyectan). */
export function parseSpells(input: ParserInput, deps: SpellsParseDeps): ParserOutput {
  const { index, crb, spells } = classifyPages(input.pages);
  const counters: Counters = {};
  const notes: string[] = [];

  if (input.subset === "index") {
    return {
      entries: [],
      needsReview: [],
      excluded: [],
      notes: ["spells:index solo registra el índice y el filtro CRB: no genera conjuros"],
    };
  }
  if (!crb) {
    throw new Error(
      `falta la página del filtro CRB (${CRB_SOURCE_URL}): ejecuta data:import --category spells:index`,
    );
  }
  const crbList = extractCrbSpells(crb.html);
  const expected = crbSpellsOfBatch(crbList, deps.batches, input.subset, input.config.slugAliases);
  const problem = sameSet(
    expected.map((s) => s.url),
    spells.map((s) => s.url),
  );
  if (problem) {
    throw new Error(
      `las páginas del lote ${input.subset ?? "(todos)"} no coinciden con el filtro CRB del índice: ${problem}`,
    );
  }

  let descriptions: Map<string, string> | undefined;
  if (index) descriptions = extractIndexDescriptions(index.html);
  else notes.push("sin la página del índice completo: no se rellena shortDescriptionEn");

  const entries: ParsedEntry[] = [];
  const needsReview: NeedsReviewItem[] = [];
  const excluded: ExcludedPage[] = [];
  const byUrl = [...spells].sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
  for (const page of byUrl) {
    const result = parseSpellPage(page, {
      catalog: deps.catalog,
      slugAliases: input.config.slugAliases,
      allowedSections: input.config.allowedSections,
      descriptions,
    });
    for (const [key, n] of Object.entries(result.counters)) bump(counters, key, n);
    if (result.kind === "excluded") {
      excluded.push(result.excluded);
      continue;
    }
    entries.push(result.entry);
    notes.push(...result.notes);
    if (result.review.length > 0) {
      needsReview.push({ id: result.entry.id, reason: result.review.join("; ") });
    }
  }
  entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) throw new Error(`id de conjuro repetido "${entry.id}"`);
    ids.add(entry.id);
  }
  return {
    entries,
    shardOf: (entry) => `spells/${initialOf(entry.id)}.json`,
    needsReview,
    excluded,
    counters,
    notes,
  };
}

export function parse(input: ParserInput): ParserOutput {
  return parseSpells(input, { batches: loadSpellBatches(), catalog: loadSpellClassCatalog() });
}

/**
 * Descubrimiento (R93, R99) y recuentos esperados:
 * - `spells:index`: comprueba el filtro CRB contra el índice completo (todo conjuro CRB debe estar
 *   en él) y devuelve `expectedCount` = enlaces de «Spells [N]»; además exige que
 *   `spell-batches.json` reparta exactamente esos conjuros (si no, la config está desfasada).
 * - `spells:<lote>`: las semillas son las páginas del lote (las genera `spells-seeds.ts` desde el
 *   filtro CRB); el recuento debe ser el congelado en `spell-batches.json`. El parseo vuelve a
 *   comprobar las semillas contra el filtro CRB real (`parseSpells`).
 * Nunca pide URLs nuevas: la lista completa viaja en `seeds.json`.
 */
export function discoverSpells(input: DiscoverInput, deps: SpellsParseDeps): DiscoverOutput {
  const { index, crb, spells } = classifyPages(input.seedPages);
  if (input.subset === "index") {
    if (!crb || !index) {
      throw new Error("spells:index necesita el índice completo y la página del filtro CRB");
    }
    const crbList = extractCrbSpells(crb.html);
    const indexNames = extractIndexNames(index.html);
    const notInIndex = crbList.spells.filter((s) => !indexNames.has(s.name)).map((s) => s.name);
    if (notInIndex.length > 0) {
      throw new Error(
        `${notInIndex.length} conjuro(s) del filtro CRB no están en el índice completo: ${notInIndex.slice(0, 5).join(", ")}`,
      );
    }
    const byBatch: Record<string, number> = {};
    for (const batch of deps.batches.batches) {
      byBatch[batch.id] = crbSpellsOfBatch(
        crbList,
        deps.batches,
        batch.id,
        input.config.slugAliases,
      ).length;
    }
    for (const [id, count] of Object.entries(byBatch)) {
      if (deps.batches.expectedCountByBatch[id] !== count) {
        throw new Error(
          `spell-batches.json está desfasado: el lote ${id} tiene ${count} conjuros CRB y la config dice ${deps.batches.expectedCountByBatch[id]}`,
        );
      }
    }
    return { urls: [], expectations: { expectedCount: crbList.declared } };
  }
  if (input.subset === undefined) {
    throw new Error("importa los conjuros por lote: --category spells:<lote> (o spells:index)");
  }
  const expectedCount = deps.batches.expectedCountByBatch[input.subset];
  if (expectedCount === undefined) {
    throw new Error(`lote de conjuros desconocido "${input.subset}"`);
  }
  for (const page of spells) {
    const initial = initialOf(
      resolveEntryId(
        "spells",
        new URL(page.url).searchParams.get("ItemName") ?? "",
        input.config.slugAliases,
      ),
    );
    const range = deps.batches.batches.find((b) => b.id === input.subset)!;
    if (initial < range.from || initial > range.to) {
      throw new Error(`${page.url}: su inicial «${initial}» no pertenece al lote ${input.subset}`);
    }
  }
  if (spells.length !== expectedCount) {
    throw new Error(
      `el lote ${input.subset} tiene ${spells.length} semilla(s) y el índice espera ${expectedCount}; regenera las semillas con scripts/srd/parsers/spells-seeds.ts`,
    );
  }
  return { urls: [], expectations: { expectedCountByBatch: { [input.subset]: spells.length } } };
}

export function discover(input: DiscoverInput): DiscoverOutput {
  return discoverSpells(input, { batches: loadSpellBatches(), catalog: loadSpellClassCatalog() });
}
