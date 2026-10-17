import type { AnyNode } from "domhandler";
import { resolveEntryId } from "../../../src/data/integrity/ids";
import { CRB_SOURCE_REF_PREFIX, type Ability } from "../../../src/data/schema/common";
import { RACE_SIZES } from "../../../src/data/schema/race";
import {
  findContent,
  labelledFields,
  loadHtml,
  nodesToMarkdown,
  nodesToText,
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
} from "../lib/parser-contract";
import { assertAllowedHeadings, SectionError } from "../lib/sections";
import {
  aonUrl,
  crbLabel,
  CRB_SOURCE_URL,
  crbSourceSection,
  isElement,
  nodesAfterSource,
  sectionSourceLabels,
} from "./race-skill-common";

// Parser de razas de Archives of Nethys (Lote B, R15, R45, R46). Puro y determinista.
// Una página (`RacesDisplay.aspx?ItemName=Dwarf`) trae, en un solo `span`, cuatro bloques `h1`:
// la descripción (con las etiquetas `Source` de todos los libros que la reimprimen), «<Raza> Racial
// Traits» (los rasgos estándar, lo que se importa), «Subraces», «<Raza> Alternate Racial Trait(s)» y
// «<Raza> Favored Class Options» (otros libros: se excluyen, y se comprueba que no declaran el CRB).

const RACE_PAGE = /RacesDisplay\.aspx\?ItemName=(.+)$/i;
const ABILITY_BY_NAME: Readonly<Record<string, Ability>> = {
  strength: "str",
  dexterity: "dex",
  constitution: "con",
  intelligence: "int",
  wisdom: "wis",
  charisma: "cha",
};

/** Universo de razas: los enlaces de «Races [N]» (el recuento declarado debe coincidir). */
export function discover(input: DiscoverInput): DiscoverOutput {
  const page = input.seedPages.find((p) => p.url === CRB_SOURCE_URL);
  if (!page) return { urls: [] };
  const section = crbSourceSection(page, "Races");
  if (!section) throw new Error(`${CRB_SOURCE_URL}: no tiene la sección "Races [N]"`);
  const hrefs = [...new Set(section.links.map((l) => l.href))];
  if (section.declaredCount !== hrefs.length) {
    throw new Error(
      `${CRB_SOURCE_URL}: «Races [${section.declaredCount}]» declara ${section.declaredCount} razas pero lista ${hrefs.length}`,
    );
  }
  return { urls: hrefs.map(aonUrl), expectations: { expectedCount: section.declaredCount } };
}

function itemNameOf(url: string): string {
  const match = RACE_PAGE.exec(url);
  if (!match) throw new Error(`${url}: no es una página de raza (RacesDisplay.aspx?ItemName=...)`);
  return decodeURIComponent(match[1]!.replace(/\+/g, " "));
}

interface Group {
  heading: string;
  sections: Section[];
}

/** Agrupa las secciones por `h1` (los `h2`/`h3` cuelgan del `h1` anterior). */
function groupsOf(sections: readonly Section[], url: string): Group[] {
  const groups: Group[] = [];
  for (const section of sections) {
    if (section.level === 1) groups.push({ heading: section.heading, sections: [section] });
    else if (groups.length > 0) groups[groups.length - 1]!.sections.push(section);
    else throw new SectionError(url, section.heading || "(contenido previo al primer encabezado)");
  }
  return groups;
}

function parseAbilityModifiers(
  label: string,
  url: string,
): { fixed: Partial<Record<Ability, number>>; choice?: { amount: number } } {
  const choice = /^\+(\d+) to One Ability Score$/i.exec(label);
  if (choice) return { fixed: {}, choice: { amount: Number(choice[1]) } };
  const fixed: Partial<Record<Ability, number>> = {};
  for (const part of label.split(/\s*,\s*/)) {
    const m = /^([+\-–−])(\d+)\s+([A-Za-z]+)$/.exec(part);
    const ability = m ? ABILITY_BY_NAME[m[3]!.toLowerCase()] : undefined;
    if (!m || ability === undefined || fixed[ability] !== undefined) {
      throw new Error(`${url}: modificadores de característica no reconocidos: "${label}"`);
    }
    fixed[ability] = (m[1] === "+" ? 1 : -1) * Number(m[2]);
  }
  return { fixed };
}

function splitList(text: string): string[] {
  return text
    .split(/\s*,\s*(?:and\s+)?|\s+and\s+/)
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

const ETHNIC = /^their ethnic language$/i;

function parseLanguages(
  text: string,
  url: string,
): { automatic: string[]; bonus: string[]; bonusAny: boolean; ethnic: boolean } {
  const start = /begin play speaking (.+?)\.(?:\s|$)/.exec(text);
  if (!start) throw new Error(`${url}: no se reconocen los idiomas iniciales: "${text}"`);
  const items = splitList(start[1]!);
  const ethnic = items.some((i) => ETHNIC.test(i));
  const automatic = items.filter((i) => !ETHNIC.test(i));
  const list = /can choose from the following languages: (.+?)\.(?:\s|$)/.exec(text);
  const any = /can choose any languages they want/.test(text);
  if ((list === null) === !any) {
    throw new Error(`${url}: no se reconocen los idiomas adicionales: "${text}"`);
  }
  return { automatic, bonus: list ? splitList(list[1]!) : [], bonusAny: any, ethnic };
}

interface Trait {
  name: string;
  textEn: string;
}

function traitsOf($: Dom, nodes: readonly AnyNode[], url: string): Trait[] {
  const firstBold = nodes.findIndex((n) => isElement(n) && n.name === "b");
  const before = firstBold < 0 ? nodes : nodes.slice(0, firstBold);
  if (nodesToText($, before) !== "") {
    throw new Error(`${url}: texto antes del primer rasgo racial: "${nodesToText($, before)}"`);
  }
  return labelledFields($, nodes).map((f) => {
    const textEn = f.value.replace(/^:\s*/, "").trim();
    if (f.label === "" || textEn === "") {
      throw new Error(`${url}: rasgo racial sin nombre o sin texto: "${f.label}"`);
    }
    return { name: f.label, textEn };
  });
}

export const parse: CategoryParser = (input) => {
  const entries: ParsedEntry[] = [];
  const needsReview: NeedsReviewItem[] = [];
  const excluded: ExcludedPage[] = [];
  const notes: string[] = [];
  const counters: Record<string, number> = {
    "razas CRB": 0,
    "razas con varias etiquetas Source": 0,
    "subrazas de otros libros excluidas": 0,
    "rasgos raciales alternativos de otros libros excluidos": 0,
    "grupos de clase predilecta excluidos": 0,
    "razas con idioma étnico (no listado en automatic)": 0,
  };

  const racePages = input.pages.filter((p) => RACE_PAGE.test(p.url));
  for (const page of racePages) {
    const name = itemNameOf(page.url);
    const $ = loadHtml(page.html);
    const sections = splitSections($, findContent($));
    const [description, ...rest] = groupsOf(sections, page.url);
    if (!description) throw new SectionError(page.url, "(página sin contenido)");

    const labels = sectionSourceLabels($, description.sections[0]!);
    const crb = crbLabel(labels);
    if (crb === undefined) {
      excluded.push({
        url: page.url,
        book: labels.join(", ") || "(sin Source)",
        reason: "la página no declara PRPG Core Rulebook",
      });
      continue;
    }
    if (description.sections.length > 1) {
      throw new SectionError(page.url, description.sections[1]!.heading);
    }

    let traitNodes: AnyNode[] | undefined;
    for (const group of rest) {
      const own = group.heading.toLowerCase().startsWith(`${name.toLowerCase()} `)
        ? group.heading.slice(name.length + 1)
        : group.heading;
      assertAllowedHeadings(page.url, [own], input.config.allowedSections);
      if (own.toLowerCase() === "racial traits") {
        if (group.sections.length > 1) throw new SectionError(page.url, group.sections[1]!.heading);
        if (traitNodes) throw new SectionError(page.url, `${group.heading} (repetida)`);
        traitNodes = group.sections[0]!.nodes;
        continue;
      }
      // Contenido de otros libros: se excluye, pero ninguna parte puede declarar el CRB.
      const all = group.sections.flatMap((s) => s.nodes);
      if (nodesToText($, all).includes(CRB_SOURCE_REF_PREFIX)) {
        throw new SectionError(page.url, `${group.heading} (declara el CRB)`);
      }
      const subs = group.sections.slice(1);
      if (own.toLowerCase() === "subraces") {
        counters["subrazas de otros libros excluidas"]! += subs.length;
      } else if (own.toLowerCase().startsWith("alternate racial trait")) {
        counters["rasgos raciales alternativos de otros libros excluidos"]! += subs.length;
      } else {
        counters["grupos de clase predilecta excluidos"]!++;
      }
    }
    if (!traitNodes) throw new SectionError(page.url, `${name} Racial Traits (ausente)`);

    const traits = traitsOf($, traitNodes, page.url);
    const { fixed, choice } = parseAbilityModifiers(traits[0]!.name, page.url);

    const sizes = traits.filter((t) => (RACE_SIZES as readonly string[]).includes(t.name));
    if (sizes.length !== 1) {
      throw new Error(`${page.url}: se esperaba un único rasgo de tamaño, hay ${sizes.length}`);
    }
    const speeds = traits
      .map((t) => /base speed of (\d+) feet/.exec(t.textEn))
      .filter((m): m is RegExpExecArray => m !== null);
    if (speeds.length !== 1) {
      throw new Error(`${page.url}: se esperaba una única velocidad base, hay ${speeds.length}`);
    }
    const languageTraits = traits.filter((t) => t.name === "Languages");
    if (languageTraits.length !== 1) {
      throw new Error(`${page.url}: se esperaba un único rasgo Languages`);
    }
    const langs = parseLanguages(languageTraits[0]!.textEn, page.url);
    if (langs.ethnic) {
      counters["razas con idioma étnico (no listado en automatic)"]!++;
      notes.push(
        `${name}: su idioma étnico no es un nombre de idioma y no figura en languages.automatic (el texto completo está en el rasgo Languages)`,
      );
    }

    const intro = nodesToMarkdown($, nodesAfterSource(description.sections[0]!));
    const traitMd = traits.map((t) => `**${t.name}**: ${t.textEn}`).join("\n\n");
    const id = resolveEntryId("races", name, input.config.slugAliases);

    const entry: ParsedEntry = {
      id,
      name,
      textEn: `${intro}\n\n**Racial Traits**\n\n${traitMd}`,
      source: page.url,
      sourceRef: crb,
      book: "CRB",
      abilityModifiers: fixed,
      size: sizes[0]!.name,
      baseSpeedFt: Number(speeds[0]![1]),
      languages: { automatic: langs.automatic, bonus: langs.bonus, bonusAny: langs.bonusAny },
      traits,
    };
    if (choice) entry["abilityChoice"] = choice;
    counters["razas CRB"]!++;
    if (labels.length > 1) {
      counters["razas con varias etiquetas Source"]!++;
      needsReview.push({ id, reason: `varias etiquetas Source: ${labels.join(", ")}` });
    }
    entries.push(entry);
  }

  return { entries, needsReview, excluded, counters, notes };
};
