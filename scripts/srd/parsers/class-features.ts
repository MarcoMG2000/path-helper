import type { AnyNode, Element } from "domhandler";
import { resolveEntryId, slugify } from "../lib/slug";
import {
  findContent,
  labelledFields,
  loadHtml,
  nodesToMarkdown,
  nodesToText,
  sourceLabels,
  splitSections,
  type Dom,
} from "../lib/html";
import { assertAllowedHeadings } from "../lib/sections";
import { collapseWhitespace, normalizePunctuation } from "../lib/text";
import type {
  DiscoverInput,
  DiscoverOutput,
  ExcludedPage,
  ParsedEntry,
  ParserInput,
  ParserOutput,
  ParserPage,
} from "../lib/parser-contract";
import {
  bookOfLabel,
  crbLabelOf,
  firstLevelMention,
  followedByColonText,
  isCrbLabel,
  isParagraphStart,
  removeNethysNotes,
  splitMarker,
  splitTopLevelCommas,
  stripLeadingColon,
} from "./class-common";
import { isDomainPage, parseDomainPage } from "./domains";
import type { AbilityType } from "../../../src/data/schema/class-feature";

// Parser de `class-features` (R13, R14) y núcleo de lectura de la página de clase que también usa
// el parser de `classes`. Fuente: `ClassDisplay.aspx` (capacidades de la tabla) más las páginas de
// opciones elegibles de AoN (talentos de pícaro, poderes de furia, misericordias, estilos de combate)
// y las páginas de dominio (poderes de dominio). Cada opción se incluye solo si SU etiqueta de fuente
// es el CRB.

type ParserConfig = ParserInput["config"];

/** Secciones de la página de clase que son de otros libros (se excluyen y se cuentan; R45). */
const OTHER_BOOK_SECTIONS = new Set(["alternate capstones", "favored class options"]);
/** Encabezados h1 de las páginas de listas que son de otro libro. */
const OTHER_BOOK_LIST_HEADINGS = new Set([
  "skald rage powers",
  "blood rage powers",
  "elemental rage powers",
  "totem rage powers",
]);

const norm = (s: string): string => collapseWhitespace(s).toLowerCase();

function bump(counters: Record<string, number>, key: string, by = 1): void {
  counters[key] = (counters[key] ?? 0) + by;
}

export function pathOf(url: string): string {
  return new URL(url).pathname.split("/").at(-1)!.toLowerCase();
}

// --- tipos ---------------------------------------------------------------------------------------

export interface ClassTableRow {
  level: number;
  bab: number[];
  fort: number;
  ref: number;
  will: number;
  special: string[];
  specialIds: string[];
  spellsPerDay?: (number | null)[];
  domainSpellsPerDay?: (number | null)[];
  spellsKnown?: (number | null)[];
}

export interface FeatureDraft {
  id: string;
  classId: string;
  name: string;
  abilityType: AbilityType;
  kind: "feature" | "option";
  parentId?: string;
  level: number;
  levelBasis: string;
  textEn: string;
  source: string;
  sourceRef: string;
  needsReview: boolean;
}

export interface ParsedClassPage {
  classId: string;
  name: string;
  url: string;
  sourceRef: string;
  needsReview: boolean;
  alignment: string;
  hitDie: number;
  startingWealthDice: string;
  skillRanksPerLevel: number;
  classSkills: string[];
  proficiencies: { weapons: string[]; armor: string[]; shields: string[] };
  casting?: { ability: string; tradition: string; prepared: boolean; spellListId: string };
  table: ClassTableRow[];
  /** Capacidades de la propia página (principales y subcapacidades del bardo). */
  features: FeatureDraft[];
  textEn: string;
  counters: Record<string, number>;
  notes: string[];
}

// --- tabla de clase ------------------------------------------------------------------------------

type Cell = string;

function readRows($: Dom, table: AnyNode): Cell[][] {
  return $(table)
    .find("tr")
    .get()
    .map((tr) =>
      $(tr)
        .children("th,td")
        .get()
        .map((c) => collapseWhitespace($(c).text())),
    )
    .filter((r) => r.length > 0);
}

const DASH = /^[-—–−]$/;

function parseSlot(cell: string, where: string): { base: number | null; domain: number | null } {
  const text = normalizePunctuation(cell).trim();
  if (DASH.test(text) || text === "") return { base: null, domain: null };
  let match = /^(\d+)$/.exec(text);
  if (match) return { base: Number(match[1]), domain: null };
  match = /^(\d+)\s*\+\s*(\d+)$/.exec(text);
  if (match) return { base: Number(match[1]), domain: Number(match[2]) };
  throw new Error(`${where}: celda de conjuros no reconocida "${cell}"`);
}

function spellLevelOfHeader(label: string): number | undefined {
  const match = /^(\d)(?:st|nd|rd|th)?$/.exec(label.trim());
  return match ? Number(match[1]) : undefined;
}

function levelOfCell(cell: string, where: string): number {
  const match = /^(\d{1,2})(?:st|nd|rd|th)$/.exec(cell.trim());
  if (!match) throw new Error(`${where}: nivel no reconocido "${cell}"`);
  return Number(match[1]);
}

function parseBab(cell: string, where: string): number[] {
  const text = normalizePunctuation(cell).replace(/\s+/g, "");
  if (!/^\+\d+(\/\+\d+)*$/.test(text)) throw new Error(`${where}: BAB no reconocido "${cell}"`);
  return text.split("/").map((p) => Number(p.slice(1)));
}

function parseSave(cell: string, where: string): number {
  const match = /^\+(\d+)$/.exec(normalizePunctuation(cell).trim());
  if (!match) throw new Error(`${where}: salvación no reconocida "${cell}"`);
  return Number(match[1]);
}

function parseSpecial(cell: string): string[] {
  const text = normalizePunctuation(cell).trim();
  if (DASH.test(text) || text === "") return [];
  return splitTopLevelCommas(cell);
}

interface MainTable {
  rows: ClassTableRow[];
  hasSpellColumns: boolean;
}

function parseMainTable(rows: Cell[][], where: string): MainTable {
  const headerIndex = rows.findIndex((r) => r[0] === "Level");
  const header = rows[headerIndex]!;
  const expected = ["Level", "Base Attack Bonus", "Fort Save", "Ref Save", "Will Save", "Special"];
  if (expected.some((label, i) => header[i] !== label)) {
    throw new Error(`${where}: cabecera de la tabla de clase inesperada: ${header.join(" | ")}`);
  }
  const spellColumns: { column: number; level: number }[] = [];
  for (let c = 6; c < header.length; c++) {
    const level = spellLevelOfHeader(header[c]!);
    if (level === undefined) throw new Error(`${where}: columna de conjuros "${header[c]}"`);
    spellColumns.push({ column: c, level });
  }
  const data = rows.slice(headerIndex + 1);
  if (data.length !== 20)
    throw new Error(`${where}: la tabla debe tener 20 filas (hay ${data.length})`);
  const out: ClassTableRow[] = data.map((cells, i) => {
    const at = `${where} nivel ${i + 1}`;
    if (cells.length !== header.length) {
      throw new Error(`${at}: ${cells.length} celdas (cabecera ${header.length})`);
    }
    const level = levelOfCell(cells[0]!, at);
    if (level !== i + 1) throw new Error(`${at}: la fila es del nivel ${level}`);
    const row: ClassTableRow = {
      level,
      bab: parseBab(cells[1]!, at),
      fort: parseSave(cells[2]!, at),
      ref: parseSave(cells[3]!, at),
      will: parseSave(cells[4]!, at),
      special: parseSpecial(cells[5]!),
      specialIds: [],
    };
    if (spellColumns.length > 0) {
      const base: (number | null)[] = Array<number | null>(10).fill(null);
      const domain: (number | null)[] = Array<number | null>(10).fill(null);
      let anyDomain = false;
      for (const { column, level: spellLevel } of spellColumns) {
        const slot = parseSlot(cells[column]!, at);
        base[spellLevel] = slot.base;
        if (slot.domain !== null) {
          domain[spellLevel] = slot.domain;
          anyDomain = true;
        }
      }
      row.spellsPerDay = base;
      if (anyDomain) row.domainSpellsPerDay = domain;
    }
    return row;
  });
  return { rows: out, hasSpellColumns: spellColumns.length > 0 };
}

function parseKnownTable(rows: Cell[][], where: string): Map<number, (number | null)[]> {
  const headerIndex = rows.findIndex((r) => r[0] === "Level");
  const header = rows[headerIndex]!;
  const columns: { column: number; level: number }[] = [];
  for (let c = 1; c < header.length; c++) {
    const level = spellLevelOfHeader(header[c]!);
    if (level === undefined)
      throw new Error(`${where}: columna de conjuros conocidos "${header[c]}"`);
    columns.push({ column: c, level });
  }
  const out = new Map<number, (number | null)[]>();
  for (const cells of rows.slice(headerIndex + 1)) {
    const at = `${where} (conjuros conocidos)`;
    const level = levelOfCell(cells[0]!, at);
    const slots: (number | null)[] = Array<number | null>(10).fill(null);
    for (const { column, level: spellLevel } of columns) {
      slots[spellLevel] = parseSlot(cells[column] ?? "-", at).base;
    }
    out.set(level, slots);
  }
  return out;
}

function tableMarkdown(rows: Cell[][]): string {
  const headerIndex = rows.findIndex((r) => r[0] === "Level");
  const header = rows[headerIndex]!;
  const caption = rows
    .slice(0, headerIndex)
    .flat()
    .filter((c) => c !== "")
    .join(" ");
  const esc = (c: string): string => c.replace(/\|/g, "\\|");
  const line = (cells: string[]): string => `| ${cells.map(esc).join(" | ")} |`;
  return [
    caption ? `**${caption}**\n` : "",
    line(header),
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.slice(headerIndex + 1).map(line),
  ]
    .filter((l) => l !== "")
    .join("\n");
}

// --- resolución de la columna `special` (R14) ----------------------------------------------------

/** Alias explícitos entre el nombre en la tabla y el de la capacidad (singular/plural). */
const SPECIAL_ALIASES: Readonly<Record<string, string>> = {
  "rage power": "rage powers",
  "rogue talent": "rogue talents",
};

/** Nombre de la tabla sin ordinal inicial, contador final ni paréntesis: `Smite evil 1/day` -> `smite evil`. */
export function normalizeSpecialName(raw: string): string {
  let text = norm(normalizePunctuation(raw));
  text = text.replace(/\s*\([^)]*\)\s*$/, "");
  text = text.replace(/^\d+(?:st|nd|rd|th)\s+/, "");
  text = text.replace(/\s+\+\d+(?:d\d+)?$/, "");
  text = text.replace(/\s+\d+d\d+$/, "");
  text = text.replace(/\s+\d+\/(?:day|-)$/, "");
  text = text.trim();
  return SPECIAL_ALIASES[text] ?? text;
}

/**
 * Id de la capacidad a la que apunta un nombre de la tabla. Prefiere las capacidades (`feature`)
 * sobre las opciones y lanza un error con el nombre si no resuelve (R14).
 */
export function resolveSpecialId(
  raw: string,
  features: readonly FeatureDraft[],
  where: string,
): string {
  const wanted = normalizeSpecialName(raw);
  const byName = (kind: FeatureDraft["kind"]): FeatureDraft[] =>
    features.filter((f) => f.kind === kind && norm(normalizePunctuation(f.name)) === wanted);
  const hit = byName("feature")[0] ?? byName("option")[0];
  if (!hit) {
    throw new Error(
      `${where}: "${raw}" de la columna special no resuelve a ninguna capacidad de clase (R14)`,
    );
  }
  return hit.id;
}

// --- cabecera, habilidades y competencias --------------------------------------------------------

const KNOWLEDGE_SUBJECTS = [
  "arcana",
  "dungeoneering",
  "engineering",
  "geography",
  "history",
  "local",
  "nature",
  "nobility",
  "planes",
  "religion",
] as const;

export function parseClassSkills(text: string, where: string): string[] {
  const sentence = /class skills are (.+?)\.?$/i.exec(collapseWhitespace(text));
  if (!sentence) throw new Error(`${where}: no se reconoce la frase de habilidades de clase`);
  const out: string[] = [];
  const re =
    /(?:^|,\s*|\s+and\s+)([A-Z][A-Za-z' -]*?(?:\s\([a-z]+\))?)\s\((?:Str|Dex|Con|Int|Wis|Cha)\)/g;
  for (const match of sentence[1]!.matchAll(re)) {
    const name = match[1]!.trim();
    if (/^Knowledge \(all\)$/i.test(name)) {
      for (const subject of KNOWLEDGE_SUBJECTS) out.push(`knowledge-${subject}`);
    } else {
      out.push(slugify(name));
    }
  }
  if (out.length === 0) throw new Error(`${where}: lista de habilidades de clase vacía`);
  return out;
}

function listItems(text: string): string[] {
  return text
    .split(/,\s*(?:and\s+)?|\s+and\s+/)
    .map((s) => s.replace(/^the\s+/i, "").trim())
    .filter((s) => s !== "");
}

export function parseProficiencies(
  text: string,
  where: string,
): { weapons: string[]; armor: string[]; shields: string[] } {
  const sentences = collapseWhitespace(text)
    .split(/(?<=\.)\s+(?=[A-Z])/)
    .filter((s) => /proficient/i.test(s));
  const weapons: string[] = [];
  const armor = new Set<string>();
  let shields: string[] = [];
  for (const sentence of sentences) {
    const clause = sentence.split(/\s+but\s+/)[0]!;
    if (/all simple and martial weapons/i.test(clause)) weapons.push("simple", "martial");
    else if (/all simple weapons/i.test(clause)) weapons.push("simple");
    const plus = /,\s*plus the (.+?)(?:\.|$)/i.exec(clause);
    if (plus) weapons.push(...listItems(plus[1]!).map(slugify));
    const following = /the following weapons:\s*(.+?)(?:\.|$)/i.exec(clause);
    if (following) weapons.push(...listItems(following[1]!).map(slugify));
    if (/favored weapon of their deity/i.test(clause)) weapons.push("deity-favored-weapon");
    const armorPart = clause.replace(/shields \(except tower shields\)/gi, "");
    if (/all types of armor/i.test(armorPart)) {
      for (const a of ["light", "medium", "heavy"]) armor.add(a);
    } else if (/\barmor\b/i.test(armorPart) && !/natural attacks/i.test(armorPart)) {
      for (const match of armorPart.matchAll(/\b(light|medium|heavy)\b/gi)) {
        armor.add(match[1]!.toLowerCase());
      }
    }
    if (/shields \(except tower shields\)/i.test(clause)) shields = ["all-except-tower"];
    else if (/not with shields/i.test(sentence)) shields = [];
  }
  if (weapons.length === 0) throw new Error(`${where}: no se reconocen las competencias con armas`);
  const order = ["light", "medium", "heavy"];
  return {
    weapons: [...new Set(weapons)],
    armor: order.filter((a) => armor.has(a)),
    shields,
  };
}

function parseCasting(
  spellsText: string,
  classId: string,
  where: string,
): { ability: string; tradition: string; prepared: boolean; spellListId: string } {
  const tradition = /\b(arcane|divine) spells\b/i.exec(spellsText);
  const ability = /(Intelligence|Wisdom|Charisma) score equal to at least 10/i.exec(spellsText);
  if (!tradition || !ability) {
    throw new Error(`${where}: no se reconoce la tradición o la característica de lanzamiento`);
  }
  const prepared = !/without preparing/i.test(spellsText) && /\bprepar/i.test(spellsText);
  const abilities: Record<string, string> = {
    intelligence: "int",
    wisdom: "wis",
    charisma: "cha",
  };
  return {
    ability: abilities[ability[1]!.toLowerCase()]!,
    tradition: tradition[1]!.toLowerCase(),
    prepared,
    spellListId: classId,
  };
}

// --- extracción de capacidades de la sección "Class Features" -------------------------------------

interface RawFeature {
  name: string;
  abilityType: AbilityType;
  isSub: boolean;
  textEn: string;
}

function isClassTable(rows: Cell[][]): "main" | "known" | undefined {
  const header = rows.find((r) => r[0] === "Level");
  if (!header) return undefined;
  if (header[1] === "Base Attack Bonus") return "main";
  if (spellLevelOfHeader(header[1] ?? "") !== undefined) return "known";
  return undefined;
}

function extractRawFeatures(
  $: Dom,
  nodes: readonly AnyNode[],
  where: string,
  counters: Record<string, number>,
): RawFeature[] {
  type Start = { index: number; sub: boolean; label: string };
  const starts: Start[] = [];
  nodes.forEach((node, index) => {
    if (node.type !== "tag") return;
    if (node.name !== "b" && node.name !== "i") return;
    if (!isParagraphStart(nodes, index) || !followedByColonText(nodes, index)) return;
    const label = collapseWhitespace($(node).text());
    if (node.name === "i") {
      // Subcapacidades del bardo: `<i>Countersong (Su)</i>:`. Las notas de AoN no llevan marcador.
      if (!/\((?:Ex|Su|Sp)\)$/.test(label)) return;
      starts.push({ index, sub: true, label });
    } else {
      starts.push({ index, sub: false, label });
    }
  });

  const isBlank = (n: AnyNode): boolean =>
    n.type === "text" ? n.data.trim() === "" : n.type === "tag" && n.name === "br";
  const classTableNodes = new Set(
    nodes.filter(
      (n): n is Element =>
        n.type === "tag" && n.name === "table" && isClassTable(readRows($, n)) !== undefined,
    ),
  );

  const features: RawFeature[] = [];
  const carried: AnyNode[] = [];
  starts.forEach((start, k) => {
    const nextIndex = starts[k + 1]?.index ?? nodes.length;
    let end = nextIndex;
    // Una tabla ajena inmediatamente antes de la siguiente etiqueta pertenece a esa capacidad
    // (AoN coloca la tabla de enemigos/terrenos favoritos antes del rótulo).
    const pending: AnyNode[] = [];
    let j = nextIndex - 1;
    while (j > start.index && isBlank(nodes[j]!)) j--;
    while (j > start.index) {
      const n = nodes[j]!;
      if (n.type === "tag" && n.name === "table" && !classTableNodes.has(n as Element)) {
        pending.unshift(n);
        end = j;
        j--;
        while (j > start.index && isBlank(nodes[j]!)) j--;
      } else break;
    }
    const body = [...nodes.slice(start.index + 1, end), ...carried];
    carried.length = 0;
    carried.push(...pending);
    const cleaned = removeNethysNotes(stripLeadingColon(nodesToMarkdown($, body)));
    bump(counters, "notas editoriales de Archives of Nethys retiradas", cleaned.removed);
    if (cleaned.markdown === "")
      throw new Error(`${where}: la capacidad "${start.label}" no tiene texto`);
    const { name, abilityType } = splitMarker(start.label);
    features.push({ name, abilityType, isSub: start.sub, textEn: cleaned.markdown });
  });
  // Tablas pendientes de la última capacidad: pertenecen a ella.
  if (carried.length > 0 && features.length > 0) {
    const last = features.at(-1)!;
    last.textEn = `${last.textEn}\n\n${nodesToMarkdown($, carried)}`.trim();
  }
  return features;
}

// --- página de clase ----------------------------------------------------------------------------

export function isClassPage(url: string): boolean {
  return pathOf(url) === "classdisplay.aspx";
}

function externalLabels($: Dom, nodes: readonly AnyNode[]): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    if (node.type !== "tag") continue;
    const own = $(node).is("a.external-link") ? [node] : $(node).find("a.external-link").get();
    for (const a of own) out.push(collapseWhitespace($(a).text()));
  }
  return out;
}

export function parseClassPage(
  page: ParserPage,
  config: ParserConfig,
): ParsedClassPage | { excluded: ExcludedPage } {
  const $ = loadHtml(page.html);
  const sections = splitSections($, findContent($));
  const title = sections.find((s) => s.level === 1);
  if (!title) throw new Error(`página de clase sin título: ${page.url}`);
  const name = title.heading;
  const classId = resolveEntryId("classes", name, config.slugAliases);
  const where = `${page.url} (${name})`;

  const headerFields = labelledFields($, title.nodes);
  const labels = sourceLabels(headerFields);
  const crb = crbLabelOf(labels);
  if (!crb) {
    return {
      excluded: {
        url: page.url,
        book: labels.length > 0 ? bookOfLabel(labels[0]!) : "desconocido",
        reason: "página de clase de otro libro (R46)",
      },
    };
  }

  // R45: encabezados fuera de la lista permitida detienen el parseo; los de otros libros conocidos
  // (capstones alternativos, opciones de clase predilecta) se excluyen tras comprobar su fuente.
  const counters: Record<string, number> = {};
  const notes: string[] = [];
  let skipping = false;
  let skipHeading = "";
  const skipLabels: Record<string, string[]> = {};
  for (const s of sections.filter((x) => x.level > 1)) {
    if (s.level === 2) {
      skipping = OTHER_BOOK_SECTIONS.has(norm(s.heading));
      skipHeading = s.heading;
      if (skipping) skipLabels[skipHeading] = [];
    }
    if (skipping) {
      skipLabels[skipHeading]!.push(...externalLabels($, s.nodes));
      continue;
    }
    assertAllowedHeadings(page.url, [s.heading], config.allowedSections);
  }
  for (const [heading, found] of Object.entries(skipLabels)) {
    if (found.some(isCrbLabel)) {
      throw new Error(`${where}: la sección "${heading}" declara el CRB y no se puede excluir`);
    }
    const books = [...new Set(found.map(bookOfLabel))].sort();
    bump(counters, `secciones de otro libro excluidas: ${heading}`);
    notes.push(`${name}: sección "${heading}" excluida (${books.join(", ") || "sin fuente"})`);
  }

  const get = (label: string): string => {
    const f = headerFields.find((x) => x.label.toLowerCase() === label.toLowerCase());
    if (!f) throw new Error(`${where}: falta el campo "${label}"`);
    return f.value.replace(/^\s*:\s*/, "").trim();
  };
  const alignment = get("Alignment").replace(/\.$/, "").trim();
  const hit = /^d(\d+)\.?$/.exec(get("Hit Die"));
  if (!hit) throw new Error(`${where}: dado de golpe no reconocido "${get("Hit Die")}"`);
  const hitDie = Number(hit[1]);
  const wealth = /^(\d+d\d+)\s*x\s*10\s*gp/i.exec(get("Starting Wealth"));
  if (!wealth)
    throw new Error(`${where}: riqueza inicial no reconocida "${get("Starting Wealth")}"`);

  const skillsSection = sections.find((s) => s.level === 2 && norm(s.heading) === "class skills");
  if (!skillsSection) throw new Error(`${where}: falta la sección Class Skills`);
  const skillFields = labelledFields($, skillsSection.nodes);
  const ranksField = skillFields.find((f) => /skill points/i.test(f.label));
  const ranks = /^:?\s*(\d+)\s*\+\s*Int/i.exec(ranksField?.value ?? "");
  if (!ranks) throw new Error(`${where}: rangos por nivel no reconocidos`);
  const firstBold = skillsSection.nodes.findIndex((n) => n.type === "tag" && n.name === "b");
  const skillText = nodesToText(
    $,
    firstBold < 0 ? skillsSection.nodes : skillsSection.nodes.slice(0, firstBold),
  );
  const classSkills = parseClassSkills(skillText, where);

  const featuresSection = sections.find(
    (s) => s.level === 2 && norm(s.heading) === "class features",
  );
  if (!featuresSection) throw new Error(`${where}: falta la sección Class Features`);

  // Tablas de la clase.
  let main: MainTable | undefined;
  let known: Map<number, (number | null)[]> | undefined;
  const tableTexts: string[] = [];
  const tableNodes = featuresSection.nodes.flatMap((n) =>
    n.type !== "tag"
      ? []
      : n.name === "table"
        ? [n]
        : n.name === "div"
          ? $(n).find("table").get()
          : [],
  );
  for (const node of tableNodes) {
    const rows = readRows($, node);
    const kind = isClassTable(rows);
    if (kind === "main") {
      if (main) throw new Error(`${where}: más de una tabla de progresión`);
      main = parseMainTable(rows, where);
      tableTexts.push(tableMarkdown(rows));
    } else if (kind === "known") {
      known = parseKnownTable(rows, where);
      tableTexts.push(tableMarkdown(rows));
    }
  }
  if (!main) throw new Error(`${where}: no se encontró la tabla de progresión`);
  if (known) {
    for (const row of main.rows) {
      const slots = known.get(row.level);
      if (!slots) throw new Error(`${where}: faltan conjuros conocidos del nivel ${row.level}`);
      row.spellsKnown = slots;
    }
  }

  // Capacidades.
  const raw = extractRawFeatures($, featuresSection.nodes, where, counters);
  const drafts: FeatureDraft[] = [];
  const seen = new Set<string>();
  let lastMain: FeatureDraft | undefined;
  for (const r of raw) {
    const slug = resolveEntryId("class-features", r.name, config.slugAliases);
    const parent = r.isSub ? lastMain : undefined;
    if (r.isSub && !parent)
      throw new Error(`${where}: subcapacidad "${r.name}" sin capacidad previa`);
    const id = r.isSub ? `${classId}.performance.${slug}` : `${classId}.${slug}`;
    if (seen.has(id)) throw new Error(`${where}: capacidad duplicada "${id}"`);
    seen.add(id);
    const draft: FeatureDraft = {
      id,
      classId,
      name: r.name,
      abilityType: r.abilityType,
      kind: r.isSub ? "option" : "feature",
      level: 1,
      levelBasis: "default",
      textEn: r.textEn,
      source: page.url,
      sourceRef: crb,
      needsReview: labels.length > 1,
    };
    if (parent) draft.parentId = parent.id;
    if (!r.isSub) lastMain = draft;
    drafts.push(draft);
  }

  // Resolución de la columna special y nivel de cada capacidad.
  const firstLevel = new Map<string, number>();
  for (const row of main.rows) {
    row.specialIds = row.special.map((s) =>
      resolveSpecialId(s, drafts, `${where} nivel ${row.level}`),
    );
    for (const id of row.specialIds) if (!firstLevel.has(id)) firstLevel.set(id, row.level);
  }
  for (const draft of drafts) {
    const fromTable = firstLevel.get(draft.id);
    if (fromTable !== undefined) {
      draft.level = fromTable;
      draft.levelBasis = "tabla";
    } else {
      const mentioned = firstLevelMention(draft.textEn);
      draft.level = mentioned ?? 1;
      draft.levelBasis = mentioned !== undefined ? "texto" : "por defecto (1)";
    }
  }
  const outsideTable = drafts.filter((d) => d.levelBasis !== "tabla");
  if (outsideTable.length > 0) {
    notes.push(
      `${name}: capacidades fuera de la columna special, con nivel derivado del texto: ` +
        outsideTable.map((d) => `${d.name} -> ${d.level} (${d.levelBasis})`).join("; "),
    );
  }

  // Competencias y lanzamiento.
  const profFeature = drafts.find((d) => d.id === `${classId}.weapon-and-armor-proficiency`);
  if (!profFeature) throw new Error(`${where}: falta "Weapon and Armor Proficiency"`);
  const proficiencies = parseProficiencies(profFeature.textEn, where);
  let casting: ParsedClassPage["casting"];
  if (main.hasSpellColumns) {
    const spells = drafts.find((d) => d.id === `${classId}.spells`);
    if (!spells) throw new Error(`${where}: clase lanzadora sin la capacidad "Spells"`);
    casting = parseCasting(spells.textEn, classId, where);
  }

  // textEn de la clase: introducción, habilidades, tabla(s) y "Ex-<Clase>".
  const introNodes = (() => {
    const firstBreak = title.nodes.findIndex((n) => n.type === "tag" && n.name === "br");
    return firstBreak < 0 ? title.nodes : title.nodes.slice(firstBreak + 1);
  })();
  const parts: string[] = [nodesToMarkdown($, introNodes)];
  parts.push(`**Class Skills**\n\n${nodesToMarkdown($, skillsSection.nodes)}`);
  parts.push(`**Class Features**\n\n${tableTexts.join("\n\n")}`);
  for (const s of sections.filter((x) => x.level === 2 && /^ex-/i.test(x.heading))) {
    parts.push(`**${s.heading}**\n\n${nodesToMarkdown($, s.nodes)}`);
  }
  const textEn = parts.filter((p) => p.trim() !== "").join("\n\n");

  return {
    classId,
    name,
    url: page.url,
    sourceRef: crb,
    needsReview: labels.length > 1,
    alignment,
    hitDie,
    startingWealthDice: wealth[1]!,
    skillRanksPerLevel: Number(ranks[1]),
    classSkills,
    proficiencies,
    ...(casting ? { casting } : {}),
    table: main.rows,
    features: drafts,
    textEn,
    counters,
    notes,
  };
}

// --- páginas de opciones (talentos, poderes de furia, misericordias, estilos) --------------------

interface OptionPageSpec {
  classId: string;
  group: string;
  parentId: string;
  /** Si es true, el nivel sale del encabezado `Nth-Level ...` de la sección. */
  levelFromHeading?: boolean;
}

function listSpec(url: string, h1: string): OptionPageSpec | undefined {
  const path = pathOf(url);
  if (path === "roguetalents.aspx") {
    return norm(h1).startsWith("advanced")
      ? { classId: "rogue", group: "advanced-talent", parentId: "rogue.advanced-talents" }
      : { classId: "rogue", group: "talent", parentId: "rogue.rogue-talents" };
  }
  if (path === "barbarianragepowers.aspx") {
    return { classId: "barbarian", group: "rage-power", parentId: "barbarian.rage-powers" };
  }
  if (path === "paladinmercies.aspx") {
    return {
      classId: "paladin",
      group: "mercy",
      parentId: "paladin.mercy",
      levelFromHeading: true,
    };
  }
  if (path === "rangercombatstyles.aspx") {
    return { classId: "ranger", group: "combat-style", parentId: "ranger.combat-style-feat" };
  }
  return undefined;
}

export function isOptionListPage(url: string): boolean {
  return listSpec(url, "") !== undefined;
}

interface ListEntry {
  name: string;
  abilityType: AbilityType;
  labels: string[];
  body: AnyNode[];
  /** h1 y h2 vigentes en el documento cuando aparece la entrada. */
  h1: string;
  h2: string;
}

const ENTRY_SPAN = 'span[id*="_LabelName_"]';

function parseListEntry($: Dom, span: Element, url: string): Omit<ListEntry, "h1" | "h2"> {
  const kids = $(span).contents().get();
  let i = 0;
  while (
    i < kids.length &&
    kids[i]!.type === "text" &&
    (kids[i] as { data: string }).data.trim() === ""
  )
    i++;
  const head = kids[i];
  if (!head || head.type !== "tag") throw new Error(`${url}: entrada de lista sin nombre`);

  // Formato A: `<i>Nombre (Ex)</i> (<a>Fuente pg. N</a>[, <a>...</a>]): texto<hr>`.
  if (head.name === "i" || head.name === "b") {
    const { name, abilityType } = splitMarker($(head).text());
    const labels: string[] = [];
    let j = i + 1;
    let rest: AnyNode[] | undefined;
    for (; j < kids.length; j++) {
      const node = kids[j]!;
      if (node.type === "tag" && $(node).is("a.external-link")) {
        labels.push(collapseWhitespace($(node).text()));
      } else if (node.type === "text" && node.data.includes(")")) {
        node.data = node.data.slice(node.data.indexOf(")") + 1).replace(/^\s*:\s*/, "");
        rest = kids.slice(j);
        break;
      }
    }
    if (!rest || labels.length === 0) {
      throw new Error(`${url}: la entrada "${name}" no declara fuente con el formato esperado`);
    }
    const body = rest.filter((n) => !(n.type === "tag" && n.name === "hr"));
    return { name, abilityType, labels, body };
  }

  // Formato B (estilos de combate): `<h2>Nombre</h2><b>Source</b> <a>...</a><br>texto`.
  if (head.name === "h2") {
    const { name, abilityType } = splitMarker($(head).text());
    const breakAt = kids.findIndex((n, idx) => idx > i && n.type === "tag" && n.name === "br");
    if (breakAt < 0) throw new Error(`${url}: la entrada "${name}" no tiene cabecera de fuente`);
    const labels = externalLabels($, kids.slice(i + 1, breakAt));
    if (labels.length === 0) throw new Error(`${url}: la entrada "${name}" no declara fuente`);
    const body = kids.slice(breakAt + 1).filter((n) => !(n.type === "tag" && n.name === "hr"));
    return { name, abilityType, labels, body };
  }
  throw new Error(`${url}: formato de entrada de lista desconocido (<${head.name}>)`);
}

function descriptionSourceOf($: Dom, heading: Element): string[] {
  const out: string[] = [];
  let node = heading.next;
  while (node && !(node.type === "tag" && /^h[1-6]$/.test(node.name))) {
    if (node.type === "tag" && node.name === "b" && /description source/i.test($(node).text())) {
      let n = node.next;
      while (n && !(n.type === "tag" && n.name === "br")) {
        if (n.type === "tag") out.push(collapseWhitespace($(n).text()));
        n = n.next;
      }
    }
    node = node.next;
  }
  return out;
}

function parseOptionList(
  page: ParserPage,
  config: ParserConfig,
  featuresByParent: ReadonlyMap<string, FeatureDraft>,
  counters: Record<string, number>,
): FeatureDraft[] {
  const $ = loadHtml(page.html);
  const where = page.url;

  // R45: encabezados de sección (fuera de las entradas) permitidos o de otro libro conocido.
  const headings = $("h1.title, h2.title")
    .filter((_, el) => $(el).closest(ENTRY_SPAN).length === 0)
    .get();
  for (const h of headings) {
    const text = collapseWhitespace($(h).text());
    if (OTHER_BOOK_LIST_HEADINGS.has(norm(text))) {
      const sources = descriptionSourceOf($, h as Element);
      if (sources.some(isCrbLabel) || sources.some((s) => s.startsWith("PRPG"))) {
        throw new Error(`${where}: "${text}" declara el CRB y no se puede excluir`);
      }
      bump(counters, `secciones de otro libro excluidas: ${text}`);
      continue;
    }
    assertAllowedHeadings(where, [text], config.allowedSections);
  }

  // Entradas en orden de documento, con el h1/h2 vigente.
  let h1 = "";
  let h2 = "";
  const entries: ListEntry[] = [];
  $("h1.title, h2.title, " + ENTRY_SPAN).each((_, el) => {
    const element = el as Element;
    const inEntry = $(element).closest(ENTRY_SPAN).length > 0 && !$(element).is(ENTRY_SPAN);
    if (inEntry) return; // h2 con el nombre de un estilo de combate
    if ($(element).is("h1.title")) {
      h1 = collapseWhitespace($(element).text());
      h2 = "";
    } else if ($(element).is("h2.title")) {
      h2 = collapseWhitespace($(element).text());
    } else {
      entries.push({ ...parseListEntry($, element, where), h1, h2 });
    }
  });
  if (entries.length === 0) throw new Error(`${where}: la página de opciones no contiene entradas`);

  const out: FeatureDraft[] = [];
  for (const entry of entries) {
    const spec = listSpec(page.url, entry.h1);
    if (!spec) throw new Error(`${where}: página de opciones sin especificación`);
    const crb = crbLabelOf(entry.labels);
    if (!crb) {
      bump(counters, "opciones de otro libro descartadas");
      bump(counters, `opciones descartadas: ${bookOfLabel(entry.labels[0]!)}`);
      continue;
    }
    const parent = featuresByParent.get(spec.parentId);
    if (!parent) throw new Error(`${where}: no existe la capacidad padre ${spec.parentId}`);
    let level = parent.level;
    let basis = "nivel de la capacidad padre";
    if (spec.levelFromHeading) {
      const m = /^(\d+)(?:st|nd|rd|th)-level/i.exec(entry.h2);
      if (!m) throw new Error(`${where}: "${entry.name}" sin encabezado de nivel (${entry.h2})`);
      level = Number(m[1]);
      basis = "encabezado de la sección";
    }
    const cleaned = removeNethysNotes(nodesToMarkdown($, entry.body));
    if (cleaned.markdown === "")
      throw new Error(`${where}: la opción "${entry.name}" no tiene texto`);
    const slug = resolveEntryId("class-features", entry.name, config.slugAliases);
    out.push({
      id: `${spec.classId}.${spec.group}.${slug}`,
      classId: spec.classId,
      name: entry.name,
      abilityType: entry.abilityType,
      kind: "option",
      parentId: spec.parentId,
      level,
      levelBasis: basis,
      textEn: cleaned.markdown,
      source: page.url,
      sourceRef: crb,
      needsReview: entry.labels.length > 1,
    });
  }
  return out;
}

// --- orquestación --------------------------------------------------------------------------------

interface ParseAllResult {
  drafts: FeatureDraft[];
  excluded: ExcludedPage[];
  counters: Record<string, number>;
  notes: string[];
}

export function parseAll(pages: readonly ParserPage[], config: ParserConfig): ParseAllResult {
  const counters: Record<string, number> = {};
  const notes: string[] = [];
  const excluded: ExcludedPage[] = [];
  const drafts: FeatureDraft[] = [];

  const classPages = pages.filter((p) => isClassPage(p.url));
  for (const page of classPages) {
    const parsed = parseClassPage(page, config);
    if ("excluded" in parsed) {
      excluded.push(parsed.excluded);
      continue;
    }
    for (const [k, n] of Object.entries(parsed.counters)) bump(counters, k, n);
    notes.push(...parsed.notes);
    drafts.push(...parsed.features);
  }
  const byId = new Map(drafts.map((d) => [d.id, d] as const));

  const rest = pages.filter((p) => !isClassPage(p.url));
  for (const page of rest) {
    const path = pathOf(page.url);
    if (isDomainPage(page.url)) {
      const parsed = parseDomainPage(page, domainConfig(config));
      if ("excluded" in parsed) {
        excluded.push(parsed.excluded);
        continue;
      }
      const parent = byId.get("cleric.domains");
      if (!parent) throw new Error(`${page.url}: no existe la capacidad cleric.domains`);
      for (const [k, n] of Object.entries(parsed.counters)) bump(counters, k, n);
      for (const power of parsed.grantedPowers) {
        const slug = resolveEntryId("class-features", power.name, config.slugAliases);
        drafts.push({
          id: `cleric.domain.${parsed.id}.${slug}`,
          classId: "cleric",
          name: power.name,
          abilityType: power.abilityType,
          kind: "option",
          parentId: "cleric.domains",
          level: power.level,
          levelBasis: "texto del poder (1 por defecto)",
          textEn: power.textEn,
          source: parsed.url,
          sourceRef: parsed.sourceRef,
          needsReview: parsed.needsReview,
        });
      }
    } else if (isOptionListPage(page.url)) {
      drafts.push(...parseOptionList(page, config, byId, counters));
    } else if (path === "clericdomains.aspx") {
      continue; // índice: solo comprueba la cobertura de las semillas (discover de domains)
    } else {
      throw new Error(`no hay parser de class-features para ${page.url}`);
    }
  }

  const seen = new Map<string, string>();
  for (const d of drafts) {
    if (seen.has(d.id))
      throw new Error(`id de capacidad duplicado "${d.id}" (${seen.get(d.id)} y ${d.source})`);
    seen.set(d.id, d.source);
  }
  return { drafts, excluded, counters, notes };
}

/** Las páginas de dominio no tienen lista de encabezados propia: usan la de `domains`. */
function domainConfig(config: ParserConfig): ParserConfig {
  return { allowedSections: [], slugAliases: config.slugAliases };
}

export function toEntry(d: FeatureDraft): ParsedEntry {
  const entry: ParsedEntry = {
    id: d.id,
    name: d.name,
    textEn: d.textEn,
    source: d.source,
    sourceRef: d.sourceRef,
    book: "CRB",
    classId: d.classId,
    level: d.level,
    abilityType: d.abilityType,
    kind: d.kind,
  };
  if (d.parentId !== undefined) entry["parentId"] = d.parentId;
  return entry;
}

export function discover(input: DiscoverInput): DiscoverOutput {
  const result = parseAll(input.seedPages, input.config);
  return { urls: [], expectations: { expectedCount: result.drafts.length } };
}

export function parse(input: ParserInput): ParserOutput {
  const result = parseAll(input.pages, input.config);
  const needsReview = result.drafts
    .filter((d) => d.needsReview)
    .map((d) => ({ id: d.id, reason: "la página declara varias etiquetas Source" }));
  const counters = { ...result.counters };
  for (const d of result.drafts) bump(counters, `capacidades de ${d.classId} (${d.kind})`);
  return {
    entries: result.drafts.map(toEntry),
    shardOf: (entry) => `class-features/${String(entry["classId"])}.json`,
    needsReview,
    excluded: result.excluded,
    counters,
    notes: result.notes,
  };
}
