import type { AnyNode } from "domhandler";
import { resolveEntryId } from "../lib/slug";
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
import { collapseWhitespace } from "../lib/text";
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
  splitMarker,
  stripLeadingColon,
} from "./class-common";
import type { AbilityType } from "../../../src/data/schema/class-feature";

// Parser de `domains` (R23): una página `DomainDisplay.aspx?ItemName=<Dominio>` por dominio. Las
// páginas de AoN mezclan, bajo el mismo span, los subdominios (h2 `<X> Subdomain`, otros libros) y
// alguna variante (`Pharasma-Friendly Death Domain`, fuente "Paizo Blog"). Se excluyen si su fuente
// no es el CRB (y se cuentan en el informe); un encabezado o etiqueta desconocidos detienen el parseo
// (R45). La lista de deidades es una compilación de AoN de varios libros, no texto del dominio.

export interface DomainPower {
  name: string;
  abilityType: AbilityType;
  level: number;
  textEn: string;
}

export interface DomainSpell {
  level: number;
  spellId: string;
  name: string;
  note?: string;
}

export interface ParsedDomainPage {
  id: string;
  name: string;
  url: string;
  sourceRef: string;
  needsReview: boolean;
  textEn: string;
  grantedPowers: DomainPower[];
  spells: DomainSpell[];
  counters: Record<string, number>;
}

const SUBDOMAIN_HEADING = /\sSubdomain$/i;

export function isDomainPage(url: string): boolean {
  return /\/DomainDisplay\.aspx\?/i.test(url);
}

function bump(counters: Record<string, number>, key: string, by = 1): void {
  counters[key] = (counters[key] ?? 0) + by;
}

function externalLabels($: Dom, nodes: readonly AnyNode[]): string[] {
  const labels: string[] = [];
  for (const node of nodes) {
    if (node.type !== "tag") continue;
    const own = $(node).is("a.external-link") ? [node] : $(node).find("a.external-link").get();
    for (const a of own) labels.push(collapseWhitespace($(a).text()));
  }
  return labels;
}

interface Label {
  index: number;
  text: string;
  tag: "b" | "i";
}

/** Etiquetas `<b>X</b>:` / `<i>Poder (Sp)</i>:` que abren un párrafo de la sección principal. */
function findLabels($: Dom, nodes: readonly AnyNode[]): Label[] {
  const found: Label[] = [];
  nodes.forEach((node, index) => {
    if (node.type !== "tag" || (node.name !== "b" && node.name !== "i")) return;
    const start = isParagraphStart(nodes, index);
    const colon = followedByColonText(nodes, index);
    const text = collapseWhitespace($(node).text());
    if (node.name === "b" && (start || colon)) found.push({ index, text, tag: "b" });
    if (node.name === "i" && start && colon) found.push({ index, text, tag: "i" });
  });
  return found;
}

/** Parsea una página de dominio. Lanza `SectionError` ante encabezados desconocidos (R45). */
export function parseDomainPage(
  page: ParserPage,
  config: ParserInput["config"],
): ParsedDomainPage | { excluded: ExcludedPage } {
  const $ = loadHtml(page.html);
  const sections = splitSections($, findContent($));
  const title = sections.find((s) => s.level === 1);
  if (!title) throw new Error(`página sin título de dominio: ${page.url}`);
  const name = title.heading;

  const labels = sourceLabels(labelledFields($, title.nodes));
  const crb = crbLabelOf(labels);
  if (!crb) {
    return {
      excluded: {
        url: page.url,
        book: labels.length > 0 ? bookOfLabel(labels[0]!) : "desconocido",
        reason: "página de dominio de otro libro (R46)",
      },
    };
  }

  // R45: toda sección h2 (subdominios, variantes por deidad...) debe declarar una fuente que no sea
  // el CRB para poder excluirse; si declara el CRB se perdería contenido y si no declara fuente
  // alguna, su encabezado debe estar en la lista permitida (si no, el parseo falla).
  const counters: Record<string, number> = {};
  for (const sub of sections.filter((s) => s.level > 1)) {
    const subLabels = externalLabels($, sub.nodes);
    if (subLabels.length === 0) {
      assertAllowedHeadings(page.url, [sub.heading], config.allowedSections);
      continue;
    }
    if (subLabels.some(isCrbLabel)) {
      throw new Error(
        `${page.url}: la sección "${sub.heading}" declara el CRB y no se puede excluir`,
      );
    }
    bump(
      counters,
      SUBDOMAIN_HEADING.test(sub.heading)
        ? "secciones de subdominio excluidas (otro libro)"
        : "secciones de variante por deidad excluidas (otro libro)",
    );
  }

  const nodes = title.nodes;
  const found = findLabels($, nodes);
  const segment = (label: Label): AnyNode[] => {
    const next = found.find((l) => l.index > label.index);
    return nodes.slice(label.index + 1, next ? next.index : nodes.length);
  };

  const grantedLabel = found.find((l) => l.tag === "b" && /^granted powers$/i.test(l.text));
  const spellsLabel = found.find((l) => l.tag === "b" && /^domain spells$/i.test(l.text));
  if (!grantedLabel || !spellsLabel) {
    throw new Error(`${page.url}: faltan "Granted Powers" o "Domain Spells" en ${name}`);
  }

  // Etiquetas en negrita: solo Source, Deities, Granted Powers y Domain Spells (o variantes ajenas).
  let inPowers = false;
  const grantedPowers: DomainPower[] = [];
  for (const label of found) {
    if (label.tag === "b") {
      inPowers = label === grantedLabel;
      const key = label.text.toLowerCase();
      if (key === "deities") {
        bump(counters, "listas de deidades omitidas (compilación de AoN de varios libros)");
      } else if (!["source", "granted powers", "domain spells"].includes(key)) {
        const via = /^\(Source:\s*([^,)]+)/.exec(nodesToText($, segment(label)));
        if (via && !isCrbLabel(via[1]!.trim())) {
          bump(counters, "variantes de otra fuente excluidas");
        } else {
          throw new Error(
            `${page.url}: etiqueta desconocida "${label.text}" en el dominio ${name}`,
          );
        }
      }
    } else if (inPowers) {
      const { name: powerName, abilityType } = splitMarker(label.text);
      const textEn = stripLeadingColon(nodesToMarkdown($, segment(label)));
      grantedPowers.push({
        name: powerName,
        abilityType,
        level: firstLevelMention(textEn) ?? 1,
        textEn,
      });
    }
  }
  if (grantedPowers.length === 0) {
    throw new Error(`${page.url}: el dominio ${name} no declara poderes concedidos`);
  }

  const spells = parseDomainSpells($, segment(spellsLabel), page.url, name);

  // textEn: poderes + conjuros (sin la fuente, la lista de deidades ni las variantes ajenas).
  const afterSpells = found.find((l) => l.index > spellsLabel.index);
  const textEn = nodesToMarkdown(
    $,
    nodes.slice(grantedLabel.index, afterSpells ? afterSpells.index : nodes.length),
  );

  return {
    id: resolveEntryId("domains", name, config.slugAliases),
    name,
    url: page.url,
    sourceRef: crb,
    needsReview: labels.length > 1,
    textEn,
    grantedPowers,
    spells,
    counters,
  };
}

function parseDomainSpells(
  $: Dom,
  nodes: readonly AnyNode[],
  url: string,
  domain: string,
): DomainSpell[] {
  // Aplana a una cadena marcando los conjuros en cursiva con [[...]].
  let text = "";
  for (const node of nodes) {
    if (node.type === "text") text += node.data;
    else if (node.type === "tag" && node.name === "i") {
      text += `[[${collapseWhitespace($(node).text())}]]`;
    } else if (node.type === "tag" && node.name === "br") break;
    else if (node.type === "tag") text += $(node).text();
  }
  const out: DomainSpell[] = [];
  const re = /(\d)(?:st|nd|rd|th)\s*[—–-]\s*\[\[([^\]]+)\]\]\s*(?:\(([^)]*)\))?/g;
  for (const match of text.matchAll(re)) {
    const spell: DomainSpell = {
      level: Number(match[1]),
      spellId: resolveEntryId("spells", match[2]!, {}),
      name: match[2]!,
    };
    if (match[3] !== undefined && match[3].trim() !== "") spell.note = collapseWhitespace(match[3]);
    out.push(spell);
  }
  if (out.length !== 9 || out.some((s, i) => s.level !== i + 1)) {
    throw new Error(
      `${url}: los conjuros de dominio de ${domain} deben ser 9 (niveles 1-9); se leyeron ${out.length}`,
    );
  }
  return out;
}

// --- contrato de la CLI -----------------------------------------------------------------------

export function discover(input: DiscoverInput): DiscoverOutput {
  const domainPages = input.seedPages.filter((p) => isDomainPage(p.url));
  const known = new Set(domainPages.map((p) => p.url.toLowerCase()));
  // El índice de dominios debe quedar cubierto por las semillas (si no, falta un dominio).
  const missing: string[] = [];
  for (const page of input.seedPages) {
    if (!/\/ClericDomains\.aspx/i.test(page.url)) continue;
    const $ = loadHtml(page.html);
    $("a[href*='DomainDisplay.aspx?ItemName=']").each((_, a) => {
      const url = new URL($(a).attr("href") ?? "", page.url).href;
      if (!known.has(url.toLowerCase())) missing.push(url);
    });
  }
  if (missing.length > 0) {
    throw new Error(
      `ClericDomains.aspx enlaza dominios que no están en las semillas: ${[...new Set(missing)].join(", ")}`,
    );
  }
  let expectedCount = 0;
  for (const page of domainPages) {
    const $ = loadHtml(page.html);
    const title = splitSections($, findContent($)).find((s) => s.level === 1);
    if (title && crbLabelOf(sourceLabels(labelledFields($, title.nodes)))) expectedCount++;
  }
  return { urls: [], expectations: { expectedCount } };
}

export function parse(input: ParserInput): ParserOutput {
  const entries: ParsedEntry[] = [];
  const excluded: ExcludedPage[] = [];
  const needsReview: { id: string; reason: string }[] = [];
  const counters: Record<string, number> = {};
  const notes: string[] = [];
  for (const page of input.pages) {
    if (!isDomainPage(page.url)) continue; // el índice ClericDomains.aspx solo sirve a discover
    const parsed = parseDomainPage(page, input.config);
    if ("excluded" in parsed) {
      excluded.push(parsed.excluded);
      continue;
    }
    for (const [key, n] of Object.entries(parsed.counters)) bump(counters, key, n);
    entries.push({
      id: parsed.id,
      name: parsed.name,
      textEn: parsed.textEn,
      source: parsed.url,
      sourceRef: parsed.sourceRef,
      book: "CRB",
      grantedPowers: parsed.grantedPowers.map((p) => ({ ...p })),
      spells: parsed.spells.map((s) => ({ ...s })),
    });
    if (parsed.needsReview) {
      needsReview.push({ id: parsed.id, reason: "la página declara varias etiquetas Source" });
    }
    const qualified = parsed.spells.filter((s) => s.note !== undefined);
    if (qualified.length > 0) {
      notes.push(
        `${parsed.name}: conjuros con cualificador: ` +
          qualified.map((s) => `${s.level}º ${s.name} (${s.note})`).join("; "),
      );
    }
  }
  return { entries, needsReview, excluded, counters, notes };
}
