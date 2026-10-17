import { CASTER_CLASS_IDS, type CasterClassId } from "../../../src/data/schema/spell-list";
import { loadHtml } from "../lib/html";
import type { ParsedEntry, ParserInput, ParserOutput, ParserPage } from "../lib/parser-contract";
import { resolveEntryId } from "../lib/slug";
import { collapseWhitespace } from "../lib/text";
import { AON_ORIGIN, CRB_SOURCE_URL, extractCrbSpells } from "./spells";

// Parser de las listas de conjuros por clase (R21, R22, R93). Una página de lista de clase de
// Archives of Nethys (`Spells.aspx?Class=<Clase>`) agrupa los conjuros por nivel con un encabezado
// `<h2 class="title">1st-Level</h2>` y un enlace `SpellDisplay.aspx?ItemName=<nombre>` por
// conjuro. La lista incluye conjuros de TODOS los libros: aquí se descartan (y se cuentan) los que
// no están en el filtro CRB de la página de fuente (`CRB_SOURCE_URL`, el mismo universo que usa
// el parser de `spells`, R93). La coherencia con `spells[].levels` la comprueba la regla de
// integridad `spell-lists` (R22) sobre los datos finales; este parser no la ajusta.

/** Página de lista de cada clase con lista (R21). */
export const CLASS_LIST_URLS: Readonly<Record<CasterClassId, string>> = {
  bard: `${AON_ORIGIN}/Spells.aspx?Class=Bard`,
  cleric: `${AON_ORIGIN}/Spells.aspx?Class=Cleric`,
  druid: `${AON_ORIGIN}/Spells.aspx?Class=Druid`,
  paladin: `${AON_ORIGIN}/Spells.aspx?Class=Paladin`,
  ranger: `${AON_ORIGIN}/Spells.aspx?Class=Ranger`,
};

const LEVEL_HEADINGS: Readonly<Record<string, number>> = {
  "0-Level": 0,
  "1st-Level": 1,
  "2nd-Level": 2,
  "3rd-Level": 3,
  "4th-Level": 4,
  "5th-Level": 5,
  "6th-Level": 6,
  "7th-Level": 7,
  "8th-Level": 8,
  "9th-Level": 9,
};

const SPELL_HREF = /^SpellDisplay\.aspx\?ItemName=(.+)$/;

export interface ClassListLink {
  /** Nombre tal como lo enlaza la fuente (`ItemName`). */
  name: string;
  level: number;
}

/** Enlaces de conjuro de una página de lista de clase, con el nivel del último encabezado. */
export function extractClassListLinks(html: string, url: string): ClassListLink[] {
  const $ = loadHtml(html);
  const container = $('span[id^="MainContent_DataListTypes_LabelName"]');
  if (container.length === 0) {
    throw new Error(`${url}: no se encontró el contenedor de la lista de conjuros`);
  }
  const links: ClassListLink[] = [];
  let level: number | undefined;
  const walk = container.find("h2, a").toArray();
  for (const node of walk) {
    if (node.type !== "tag") continue;
    if (node.name === "h2") {
      const heading = collapseWhitespace($(node).text());
      const parsed = LEVEL_HEADINGS[heading];
      if (parsed === undefined)
        throw new Error(`${url}: encabezado de nivel desconocido «${heading}»`);
      level = parsed;
      continue;
    }
    const href = $(node).attr("href") ?? "";
    const match = SPELL_HREF.exec(href);
    if (!match) continue; // enlaces que no son de conjuros (la leyenda no los trae)
    // El marcado de la fuente (`<b><a>nombre</b><sup>R</sup><b></a></b>`) hace que el analizador
    // HTML duplique el enlace alrededor de la marca `<sup>`: el duplicado no tiene texto propio.
    const label = $(node).clone();
    label.find("sup").remove();
    if (collapseWhitespace(label.text()) === "") continue;
    if (level === undefined)
      throw new Error(`${url}: el conjuro «${match[1]}» aparece antes de un encabezado de nivel`);
    links.push({ name: match[1]!, level });
  }
  if (links.length === 0) throw new Error(`${url}: la lista no trae ningún conjuro`);
  return links;
}

type Counters = Record<string, number>;

function bump(counters: Counters, key: string, by = 1): void {
  counters[key] = (counters[key] ?? 0) + by;
}

function classifyPages(pages: readonly ParserPage[]): {
  crb: ParserPage | undefined;
  lists: Map<CasterClassId, ParserPage>;
} {
  let crb: ParserPage | undefined;
  const lists = new Map<CasterClassId, ParserPage>();
  for (const page of pages) {
    if (page.url === CRB_SOURCE_URL) {
      crb = page;
      continue;
    }
    const classId = CASTER_CLASS_IDS.find((id) => CLASS_LIST_URLS[id] === page.url);
    if (classId === undefined)
      throw new Error(`página no reconocida para spell-lists: ${page.url}`);
    lists.set(classId, page);
  }
  return { crb, lists };
}

export function parse(input: ParserInput): ParserOutput {
  const { crb, lists } = classifyPages(input.pages);
  if (!crb) {
    throw new Error(
      `falta la página del filtro CRB (${CRB_SOURCE_URL}) en las semillas de spell-lists`,
    );
  }
  const missing = CASTER_CLASS_IDS.filter((id) => !lists.has(id));
  if (missing.length > 0) {
    throw new Error(`faltan las listas de clase: ${missing.join(", ")}`);
  }
  const crbNames = new Set(extractCrbSpells(crb.html).spells.map((s) => s.name));

  const counters: Counters = {};
  const notes: string[] = [];
  const record: Record<string, Record<string, string[]>> = {};
  for (const classId of CASTER_CLASS_IDS) {
    const page = lists.get(classId)!;
    const links = extractClassListLinks(page.html, page.url);
    const byName = new Map<string, number>();
    const byLevel = new Map<number, string[]>();
    const discarded: string[] = [];
    for (const link of links) {
      if (byName.has(link.name)) {
        throw new Error(
          `${page.url}: el conjuro «${link.name}» aparece dos veces (niveles ${byName.get(link.name)} y ${link.level})`,
        );
      }
      byName.set(link.name, link.level);
      if (!crbNames.has(link.name)) {
        discarded.push(link.name);
        continue;
      }
      const id = resolveEntryId("spells", link.name, input.config.slugAliases);
      byLevel.set(link.level, [...(byLevel.get(link.level) ?? []), id]);
    }
    const kept = links.length - discarded.length;
    bump(counters, "conjuros de otro libro descartados", discarded.length);
    bump(counters, `descartados (${classId})`, discarded.length);
    bump(counters, `conjuros CRB (${classId})`, kept);
    notes.push(
      `${classId}: ${links.length} conjuros en la lista de la fuente, ${kept} del CRB, ${discarded.length} de otros libros descartados`,
    );
    if (discarded.length > 0)
      notes.push(`${classId}: descartados de otros libros: ${discarded.join("; ")}`);
    const levels: Record<string, string[]> = {};
    for (const level of [...byLevel.keys()].sort((a, b) => a - b)) {
      const ids = byLevel.get(level)!;
      if (new Set(ids).size !== ids.length) {
        throw new Error(`${page.url}: ids repetidos tras normalizar en el nivel ${level}`);
      }
      levels[String(level)] = [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    }
    record[classId] = levels;
  }
  const entries: ParsedEntry[] = [];
  return { entries, record, needsReview: [], excluded: [], counters, notes };
}
