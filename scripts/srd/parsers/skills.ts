import { resolveEntryId } from "../../../src/data/integrity/ids";
import { slugify, type Ability } from "../../../src/data/schema/common";
import { loadHtml, nodesToMarkdown, splitSections, type Dom, type Section } from "../lib/html";
import type {
  CategoryParser,
  DiscoverInput,
  DiscoverOutput,
  ExcludedPage,
  ParsedEntry,
} from "../lib/parser-contract";
import { assertAllowedHeadings, SectionError } from "../lib/sections";
import { collapseWhitespace } from "../lib/text";
import {
  aonUrl,
  crbLabel,
  CRB_SOURCE_URL,
  crbSourceSection,
  nodesAfterSource,
  sectionSourceLabels,
} from "./race-skill-common";

// Parser de habilidades de Archives of Nethys (Lote B, R16, R45, R46). Puro y determinista.
// Una página (`Skills.aspx?ItemName=Stealth`) trae un `span` con la habilidad del CRB (`h1` con la
// característica y los indicadores entre paréntesis, línea `Source`, texto) y debajo secciones `h2`
// de otros libros (Pathfinder Unchained, Occult Adventures...) con su propia etiqueta `Source`. Las
// `h2` que declaran el CRB (p. ej. «Directing Crowds», CRB pg. 436) se incluyen si figuran en la lista
// permitida. `Knowledge` se expande en una entrada por materia; `Craft`, `Perform` y `Profession` no.

const SKILL_PAGE = /Skills\.aspx\?ItemName=(.+)$/i;

/** Materias de `Knowledge` que lista el CRB (se comprueban contra la lista de la página). */
export const KNOWLEDGE_SUBJECTS = [
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

const ABBREVIATIONS: Readonly<Record<string, Ability>> = {
  str: "str",
  dex: "dex",
  con: "con",
  int: "int",
  wis: "wis",
  cha: "cha",
};

/** Páginas de habilidad de la sección «Skill Uses [N]»: una por habilidad («Core (Stealth)»). */
export function discover(input: DiscoverInput): DiscoverOutput {
  const page = input.seedPages.find((p) => p.url === CRB_SOURCE_URL);
  if (!page) return { urls: [] };
  const section = crbSourceSection(page, "Skill Uses");
  if (!section) throw new Error(`${CRB_SOURCE_URL}: no tiene la sección "Skill Uses [N]"`);
  if (section.declaredCount !== section.links.length) {
    throw new Error(
      `${CRB_SOURCE_URL}: «Skill Uses [${section.declaredCount}]» declara ${section.declaredCount} usos pero lista ${section.links.length}`,
    );
  }
  const hrefs = [...new Set(section.links.map((l) => l.href))];
  if (!hrefs.some((h) => /ItemName=Knowledge$/i.test(h))) {
    throw new Error(`${CRB_SOURCE_URL}: «Skill Uses» no incluye la habilidad Knowledge`);
  }
  // Una página por habilidad; Knowledge se expande en las materias que lista el CRB.
  const expectedCount = hrefs.length - 1 + KNOWLEDGE_SUBJECTS.length;
  return { urls: hrefs.map(aonUrl), expectations: { expectedCount } };
}

function itemNameOf(url: string): string {
  const match = SKILL_PAGE.exec(url);
  if (!match) throw new Error(`${url}: no es una página de habilidad (Skills.aspx?ItemName=...)`);
  return decodeURIComponent(match[1]!.replace(/\+/g, " "));
}

interface Header {
  name: string;
  keyAbility: Ability;
  trainedOnly: boolean;
  armorCheckPenalty: boolean;
}

/** `Stealth (Dex; Armor Check Penalty)` -> nombre, característica clave e indicadores. */
function parseHeader(title: string, url: string): Header {
  const m = /^(.+?) \(([^)]*)\)$/.exec(collapseWhitespace(title));
  if (!m) throw new SectionError(url, `${title} (cabecera de habilidad no reconocida)`);
  const [ability, ...flags] = m[2]!.split(/\s*;\s*/);
  const keyAbility = ABBREVIATIONS[(ability ?? "").toLowerCase()];
  if (keyAbility === undefined) throw new SectionError(url, `${title} (característica clave)`);
  let trainedOnly = false;
  let armorCheckPenalty = false;
  for (const flag of flags) {
    if (flag === "Trained Only") trainedOnly = true;
    else if (flag === "Armor Check Penalty") armorCheckPenalty = true;
    else throw new SectionError(url, `${title} (indicador "${flag}")`);
  }
  return { name: m[1]!, keyAbility, trainedOnly, armorCheckPenalty };
}

/** Nombres de la lista de navegación de todas las páginas de habilidad (26 enlaces). */
function navigationNames($: Dom): string[] {
  return $("#MainContent_FullSkillList a")
    .get()
    .map((a) => collapseWhitespace($(a).text()));
}

export const parse: CategoryParser = (input) => {
  const entries: ParsedEntry[] = [];
  const excluded: ExcludedPage[] = [];
  const counters: Record<string, number> = {
    "páginas de habilidad": 0,
    "habilidades CRB": 0,
    "entradas de Knowledge": 0,
    "secciones de otros libros ignoradas": 0,
    "secciones del CRB incluidas en el texto": 0,
  };

  const skillPages = input.pages.filter((p) => SKILL_PAGE.test(p.url));
  const pageNames = new Set<string>();
  for (const page of skillPages) {
    const itemName = itemNameOf(page.url);
    pageNames.add(itemName);
    const $ = loadHtml(page.html);
    const spans = $('span[id^="MainContent_DataListTalentsAll_LabelName"]').get();
    if (spans.length !== 1) {
      throw new Error(`${page.url}: se esperaba un único bloque de habilidad, hay ${spans.length}`);
    }
    const sections = splitSections($, spans);
    const main = sections[0];
    if (!main || main.level !== 1) {
      throw new SectionError(page.url, main?.heading || "(la página no empieza por un h1)");
    }
    const header = parseHeader(main.heading, page.url);
    if (header.name.toLowerCase() !== itemName.toLowerCase()) {
      throw new SectionError(page.url, `${main.heading} (no coincide con ItemName "${itemName}")`);
    }
    const labels = sectionSourceLabels($, main);
    const crb = crbLabel(labels);
    if (crb === undefined) {
      excluded.push({
        url: page.url,
        book: labels.join(", ") || "(sin Source)",
        reason: "la página no declara PRPG Core Rulebook",
      });
      continue;
    }
    counters["páginas de habilidad"]!++;

    const parts = [nodesToMarkdown($, nodesAfterSource(main))];
    // Cada h2 abre un grupo; los encabezados más profundos cuelgan del h2 anterior.
    const groups: Section[][] = [];
    for (const section of sections.slice(1)) {
      if (section.level === 2) groups.push([section]);
      else if (section.level > 2 && groups.length > 0) groups[groups.length - 1]!.push(section);
      else throw new SectionError(page.url, section.heading);
    }
    for (const group of groups) {
      const head = group[0]!;
      const own = sectionSourceLabels($, head);
      if (own.length === 0) throw new SectionError(page.url, `${head.heading} (sin Source)`);
      if (crbLabel(own) === undefined) {
        counters["secciones de otros libros ignoradas"]!++;
        continue;
      }
      assertAllowedHeadings(
        page.url,
        group.map((s) => s.heading),
        input.config.allowedSections,
      );
      counters["secciones del CRB incluidas en el texto"]!++;
      parts.push(`**${head.heading}**

${nodesToMarkdown($, nodesAfterSource(head))}`);
      for (const child of group.slice(1)) {
        parts.push(`**${child.heading}**

${nodesToMarkdown($, child.nodes)}`);
      }
    }
    const textEn = parts.filter((p) => p !== "").join("\n\n");

    const common = {
      source: page.url,
      sourceRef: crb,
      book: "CRB",
      keyAbility: header.keyAbility,
      trainedOnly: header.trainedOnly,
      armorCheckPenalty: header.armorCheckPenalty,
    };

    if (header.name === "Knowledge") {
      const subjects = $(spans[0]!)
        .find("ul li")
        .get()
        .map((li) =>
          collapseWhitespace($(li).text())
            .replace(/\s*\(.*$/, "")
            .toLowerCase(),
        );
      if (subjects.join("|") !== KNOWLEDGE_SUBJECTS.join("|")) {
        throw new SectionError(
          page.url,
          `lista de materias de Knowledge distinta de la esperada: ${subjects.join(", ")}`,
        );
      }
      for (const subject of subjects) {
        const name = `Knowledge (${subject})`;
        entries.push({
          id: resolveEntryId("skills", name, input.config.slugAliases),
          name,
          textEn,
          ...common,
          knowledgeSubject: slugify(subject),
        });
        counters["entradas de Knowledge"]!++;
        counters["habilidades CRB"]!++;
      }
      continue;
    }
    entries.push({
      id: resolveEntryId("skills", header.name, input.config.slugAliases),
      name: header.name,
      textEn,
      ...common,
    });
    counters["habilidades CRB"]!++;
  }

  // Segunda lectura del universo: cada página debe aparecer en la navegación de AoN y en «Skill Uses» de la fuente CRB (y al revés).
  const sourcePage = input.pages.find((p) => p.url === CRB_SOURCE_URL);
  const problems: string[] = [];
  for (const page of skillPages.slice(0, 1)) {
    const nav = new Set(navigationNames(loadHtml(page.html)));
    for (const n of pageNames)
      if (!nav.has(n)) problems.push(`página sin enlace de navegación: ${n}`);
    for (const n of nav) if (!pageNames.has(n)) problems.push(`navegación sin página: ${n}`);
  }
  if (sourcePage) {
    const uses = crbSourceSection(sourcePage, "Skill Uses");
    const listed = new Set(
      (uses?.links ?? [])
        .map((l) => /^Core \((.+)\)$/.exec(l.text)?.[1])
        .filter((n): n is string => n !== undefined),
    );
    for (const n of pageNames)
      if (!listed.has(n)) problems.push(`no figura como Core (...) en la fuente CRB: ${n}`);
    for (const n of listed)
      if (!pageNames.has(n)) problems.push(`Core (${n}) de la fuente CRB sin página`);
  }
  if (problems.length > 0) {
    throw new Error(`el universo de habilidades no es coherente:\n${problems.join("\n")}`);
  }

  return {
    entries,
    needsReview: [],
    excluded,
    counters,
  };
};
