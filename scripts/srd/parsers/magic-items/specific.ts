import { slugify } from "../../../../src/data/schema/common";
import { loadHtml } from "../../lib/html";
import type { ParserPage } from "../../lib/parser-contract";
import { collapseWhitespace } from "../../lib/text";
import { descriptionRegion } from "./effects";

// Objetos específicos (armas, armaduras y escudos únicos): objeto base, mejora y habilidades
// especiales (R70). Todo sale de una frase literal de `textEn` (`baseEvidence`); lo que el patrón
// no resuelve queda sin inventar (`baseItemId: null` + `baseItemRaw`, o sin `enhancement`) y la
// entrada se marca `needsReview`.

export interface EquipmentNames {
  weapons: string[];
  armor: string[];
}

function tableNames(page: ParserPage, heading: RegExp): string[] {
  const $ = loadHtml(page.html);
  const h2 = $("h2")
    .filter((_i, h) => heading.test(collapseWhitespace($(h).text())))
    .first();
  const names: string[] = [];
  for (const node of h2.nextUntil("h2, br").get()) {
    if (node.type === "tag" && node.name === "a") {
      const name = collapseWhitespace($(node).text());
      if (!names.includes(name)) names.push(name);
    }
  }
  return names;
}

/** Nombres de armas y armaduras/escudos del CRB (tablas «Equipment» de la página de fuente). */
export function equipmentNames(sourcePage: ParserPage): EquipmentNames {
  return {
    weapons: tableNames(sourcePage, /^Equipment \(Weapons\) \[\d+\]$/),
    armor: tableNames(sourcePage, /^Equipment \(Armor\) \[\d+\]$/),
  };
}

/** Materiales que preceden al objeto base en la frase («+1 mithral full plate»). */
const MATERIALS = [
  "adamantine",
  "mithral",
  "cold iron",
  "alchemical silver",
  "silver",
  "darkwood",
  "dragonhide",
  "masterwork",
];

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

interface BaseCandidate {
  /** Texto con el que aparece en la frase (minúsculas). */
  surface: string;
  id: string;
}

function weaponCandidates(names: readonly string[]): BaseCandidate[] {
  const out: BaseCandidate[] = [];
  for (const name of names) {
    const id = slugify(name);
    const bare = name.replace(/\s*\(\d+\)\s*$/, "").toLowerCase();
    out.push({ surface: bare, id });
    if (bare !== name.toLowerCase() && bare.endsWith("s")) {
      out.push({ surface: bare.slice(0, -1), id });
    }
  }
  return out;
}

function armorCandidates(names: readonly string[], shield: boolean): BaseCandidate[] {
  const out: BaseCandidate[] = [];
  for (const name of names) {
    const lower = name.toLowerCase();
    if (shield) {
      if (lower === "buckler") out.push({ surface: "buckler", id: "buckler" });
      else out.push({ surface: `${lower} shield`, id: slugify(`${name} shield`) });
    } else {
      out.push({ surface: lower, id: slugify(name) });
      out.push({ surface: `${lower} armor`, id: slugify(name) });
    }
  }
  return out;
}

export interface AbilityIndex {
  /** Nombre de la habilidad (minúsculas) -> id de la entrada del `kind` que corresponde al objeto. */
  byName: ReadonlyMap<string, string>;
}

export interface SpecificResult {
  baseItemId: string | null;
  baseItemRaw?: string;
  enhancement?: { on: "weapon" | "armor" | "shield"; bonus: number };
  abilityIds: string[];
  baseEvidence: string;
  reviewReasons: string[];
}

const ON_BY_KIND = {
  "specific-weapon": "weapon",
  "specific-armor": "armor",
  "specific-shield": "shield",
} as const;

/**
 * Deriva objeto base, mejora y habilidades de la primera frase `+N [habilidades] [material] base`
 * (o `base ... has a +N enhancement bonus`). `textEn` es el Markdown completo; la evidencia se
 * devuelve tal como aparece en él (con las marcas de cursiva si las hay).
 */
export function resolveSpecific(
  kind: keyof typeof ON_BY_KIND,
  textEn: string,
  names: EquipmentNames,
  abilities: AbilityIndex,
  isNonmagical: boolean,
): SpecificResult {
  const on = ON_BY_KIND[kind];
  const region = descriptionRegion(textEn);
  // Texto plano con mapa de posiciones para devolver la evidencia literal.
  let plain = "";
  const map: number[] = [];
  for (let i = 0; i < region.length; i++) {
    if (region[i] === "*") continue;
    plain += region[i];
    map.push(i);
  }
  const evidenceOf = (from: number, to: number): string =>
    region.slice(map[from]!, map[to - 1]! + 1);

  const candidates =
    kind === "specific-weapon"
      ? weaponCandidates(names.weapons)
      : armorCandidates(names.armor, kind === "specific-shield");
  const surfaces = candidates
    .map((c) => c.surface)
    .sort((a, b) => b.length - a.length)
    .map(esc)
    .join("|");
  const idOf = (surface: string): string =>
    candidates.find((c) => c.surface === surface.toLowerCase())!.id;

  const reviewReasons: string[] = [];
  const abilityNames = [...abilities.byName.keys()].sort((a, b) => b.length - a.length);
  const result: SpecificResult = {
    baseItemId: null,
    abilityIds: [],
    baseEvidence: "",
    reviewReasons,
  };

  const modifiers = `(?<mods>(?:[a-z'’-]+\\s+){0,5}?)`;
  const plus = new RegExp(`\\+(?<n>\\d)(?:/\\+\\d)?\\s+${modifiers}(?<base>${surfaces})\\b`, "i");
  const m = plus.exec(plain);
  if (m && m.groups) {
    const mods = collapseWhitespace(m.groups["mods"] ?? "").toLowerCase();
    let rest = mods;
    const found: string[] = [];
    for (const name of abilityNames) {
      const re = new RegExp(`(^|\\s)${esc(name)}(?=\\s|$)`);
      if (re.test(rest)) {
        found.push(abilities.byName.get(name)!);
        rest = collapseWhitespace(rest.replace(re, " "));
      }
    }
    for (const material of MATERIALS) {
      const re = new RegExp(`(^|\\s)${esc(material)}(?=\\s|$)`);
      rest = collapseWhitespace(rest.replace(re, " "));
    }
    if (rest !== "")
      reviewReasons.push(`modificadores sin reconocer antes del objeto base: "${rest}"`);
    // Varias menciones «+N ... base» con valores o bases distintos: ni mejora ni habilidades se declaran (no se elige una).
    const all = [...plain.matchAll(new RegExp(plus.source, "gi"))];
    const bonuses = [...new Set(all.map((x) => x.groups!["n"]))];
    const bases = [...new Set(all.map((x) => x.groups!["base"]!.toLowerCase()))];
    if (bonuses.length > 1 || bases.length > 1) {
      reviewReasons.push(
        `varias menciones de mejora/base en el texto (+${bonuses.join(", +")}; ${bases.join(", ")}): no se declara la mejora`,
      );
    }
    const ambiguous = bonuses.length > 1 || bases.length > 1;
    result.baseItemId = idOf(m.groups["base"]!);
    if (!ambiguous) result.enhancement = { on, bonus: Number(m.groups["n"]) };
    result.abilityIds = ambiguous ? [] : found;
    result.baseEvidence = evidenceOf(m.index, m.index + m[0].length);
    return result;
  }

  // «This heavy wooden shield has a +3 enhancement bonus.»
  const has = new RegExp(
    `(?<base>${surfaces})\\s+has\\s+an?\\s+\\+(?<n>\\d)\\s+enhancement bonus`,
    "i",
  ).exec(plain);
  if (has && has.groups) {
    result.baseItemId = idOf(has.groups["base"]!);
    result.enhancement = { on, bonus: Number(has.groups["n"]) };
    result.baseEvidence = evidenceOf(has.index, has.index + has[0].length);
    return result;
  }

  // Sin «+N»: «This nonmagical masterwork light wooden shield», «This suit of full plate», «This
  // extremely light chainmail», «This javelin becomes...». La mejora no se inventa.
  const plainBase = new RegExp(
    `(?:nonmagical|suit of|this(?: extremely light)?)\\s+(?:masterwork\\s+)?(?<base>${surfaces})\\b`,
    "i",
  ).exec(plain);
  if (plainBase && plainBase.groups) {
    result.baseItemId = idOf(plainBase.groups["base"]!);
    result.baseEvidence = evidenceOf(plainBase.index, plainBase.index + plainBase[0].length);
    if (!isNonmagical) reviewReasons.push("el texto no declara la mejora (+N) del objeto");
    return result;
  }

  // Sin patrón: nada se inventa. La primera frase de la descripción queda como evidencia literal.
  const body = region.replace(/^\*\*[^*]+\*\*\n\n/, "");
  const firstSentence = (body.split(/(?<=\.)\s/)[0] ?? body).slice(0, 200);
  result.baseItemId = null;
  result.baseEvidence = firstSentence;
  result.baseItemRaw = firstSentence.replace(/\*/g, "");
  reviewReasons.push("objeto base y mejora no deducibles con el patrón «+N [habilidades] base»");
  return result;
}

/** Nombres de los conjuros del CRB (tabla «Spells [N]» de la página de fuente), para `spellRefs` (R85). */
export function crbSpellNames(sourcePage: ParserPage): string[] {
  return tableNames(sourcePage, /^Spells \[\d+\]$/);
}
