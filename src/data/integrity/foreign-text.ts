import { CATEGORY_IDS, type EntryCategory } from "../schema/common";
import { getCategory } from "../categories";
import { idOf, isRecord } from "./helpers";
import type { IntegrityIssue, IntegrityRule } from "./types";

// R27 (texto): ningún `textEn` de ninguna categoría puede traer contenido de otros libros.
// Archives of Nethys muestra a menudo la versión reimpresa de una entrada del CRB con reglas de
// Ultimate Combat, el Advanced Class Guide, etc. (Rapid Reload con armas de fuego, Extra Channel
// con el warpriest, listas de compañeros animales de otros libros...). `book-filter` solo mira el
// campo `book`; esta regla mira el TEXTO. Es una red de seguridad por palabras guía: la
// comparación completa con el PRD oficial se hace a mano al importar (ver los overrides).

export interface ForeignPattern {
  /** Identificador estable: se usa en la regla (`foreign-text.<id>`) y en la lista de excepciones. */
  id: string;
  description: string;
  regex: RegExp;
}

/** Palabras guía de contenido que no pertenece al Core Rulebook. Sin `g`: se clonan al usarlas. */
export const FOREIGN_PATTERNS: readonly ForeignPattern[] = [
  {
    id: "other-book",
    description: "título de un libro que no es el Core Rulebook",
    regex:
      /\b(?:Advanced (?:Player(?:'|’)?s|Class|Race) Guide|Ultimate (?:Magic|Combat|Equipment|Campaign|Wilderness|Intrigue|Psionics)|Occult Adventures|Mythic Adventures|Monster Codex|Horror Adventures|Pathfinder (?:Unchained|Chronicles|Society|Player Companion)|Inner Sea [A-Z][a-z]+|Bestiary [2-6]|Monster Summoner(?:'|’)?s Handbook|Book of the Damned)\b/i,
  },
  {
    id: "other-book-abbreviation",
    description: "sigla de un libro que no es el Core Rulebook",
    regex: /\b(?:APG|ACG|ARG|UM|UC|UE|ISWG|ISRG)\b/,
  },
  {
    id: "other-class",
    description: "clase que no es del Core Rulebook",
    regex:
      /\b(?:antipaladins?|warpriests?|gunslingers?|arcanists?|bloodragers?|skalds?|swashbucklers?|magus|inquisitors?|cavaliers?|kineticists?|mesmerists?|occultists?|spiritualists?|vigilantes?|ninjas?|samurai|witch(?:es)?|summoners?)\b/i,
  },
  {
    id: "other-rule",
    description:
      "regla o concepto de otro libro (arquetipo, subdominio, rasgo racial alternativo...)",
    regex:
      /\b(?:hybrid class(?:es)?|archetypes?|subdomains?|mythic (?:tiers?|paths?|power|rank|feats?|spells?|surge|items?|monsters?)|alternate racial traits?|favored class (?:bonus|option)s?|teamwork feats?|rage prophets?)\b/i,
  },
  {
    id: "firearms",
    description: "armas de fuego (Ultimate Combat)",
    regex: /\b(?:firearms?|muskets?|pistols?|blunderbuss(?:es)?|gunpowder)\b/i,
  },
  {
    id: "other-book-content",
    description: "contenido concreto de otro libro ya detectado en la revisión (regresión)",
    regex:
      /\b(?:Crossbow Mastery|druidic herbalism|Hobbe Hound|Marsupial Devil|Armorfish|Wolfdog|Eohippus|Capybara|Thylacine|Reef Snake)\b/i,
  },
  {
    id: "aon-editorial",
    description: "nota editorial o enlace colgante de Archives of Nethys",
    regex:
      /Nethys|aonprd\.com|\*\*here\*\*|\bclick here\b|\bcan be found here\b|\bfull list of [^.]{0,80}\bhere\b|Editor(?:'|’)s Note/i,
  },
  {
    id: "setting",
    description: "ambientación de Golarion que no es del Core Rulebook",
    regex:
      /\b(?:Katapesh|Mwangi|Taldor|Taldan|Taldane|Chelaxians?|Cheliax|Absalom|Varisia|Garund|Avistan|Casmaron|Tian Xia|Numeria|Sargava|Golarion)\b/,
  },
];

/**
 * Mención legítima de una palabra guía en una entrada concreta. `match` (opcional, en minúsculas)
 * limita la excepción a esa coincidencia; sin él vale para todas las de `pattern` en la entrada.
 * La excepción debe seguir siendo necesaria (si deja de coincidir, la regla lo informa) y llevar un
 * motivo. Hoy está vacía: ninguna coincidencia legítima en los datos reales.
 */
export interface ForeignTextException {
  category: EntryCategory;
  id: string;
  pattern: string;
  match?: string;
  reason: string;
}

export const FOREIGN_TEXT_ALLOWLIST: readonly ForeignTextException[] = [];

export interface ForeignMatch {
  pattern: string;
  match: string;
  field: string;
  excerpt: string;
}

/** Recorre el objeto y devuelve cada cadena guardada bajo una clave `textEn` (con su ruta). */
function collectTexts(value: unknown, path: string, out: { field: string; text: string }[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectTexts(item, `${path}.${index}`, out));
  } else if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      const here = path === "" ? key : `${path}.${key}`;
      if (key === "textEn" && typeof child === "string") out.push({ field: here, text: child });
      else collectTexts(child, here, out);
    }
  }
}

/** Coincidencias de las palabras guía en todos los `textEn` de una entrada (`textEn`, variantes, rasgos...). */
export function scanForeignText(
  entry: unknown,
  patterns: readonly ForeignPattern[] = FOREIGN_PATTERNS,
): ForeignMatch[] {
  const texts: { field: string; text: string }[] = [];
  collectTexts(entry, "", texts);
  const found: ForeignMatch[] = [];
  for (const { field, text } of texts) {
    for (const pattern of patterns) {
      const flags = pattern.regex.flags.includes("g")
        ? pattern.regex.flags
        : `${pattern.regex.flags}g`;
      const regex = new RegExp(pattern.regex.source, flags);
      for (let m = regex.exec(text); m !== null; m = regex.exec(text)) {
        if (m[0] === "") {
          regex.lastIndex++;
          continue;
        }
        const excerpt = text
          .slice(Math.max(0, m.index - 40), m.index + m[0].length + 40)
          .replace(/\s+/g, " ")
          .trim();
        found.push({ pattern: pattern.id, match: m[0], field, excerpt });
      }
    }
  }
  return found;
}

/** Construye la regla con otros patrones o excepciones (los tests la usan con datos sintéticos). */
export function createForeignTextRule(
  patterns: readonly ForeignPattern[] = FOREIGN_PATTERNS,
  allowlist: readonly ForeignTextException[] = FOREIGN_TEXT_ALLOWLIST,
): IntegrityRule {
  return (data) => {
    const issues: IntegrityIssue[] = [];
    const patternIds = new Set(patterns.map((p) => p.id));
    const used = new Set<ForeignTextException>();

    for (const exception of allowlist) {
      if (exception.reason.trim() === "" || !patternIds.has(exception.pattern)) {
        issues.push({
          category: exception.category,
          id: exception.id,
          rule: "foreign-text.allowlist",
          message: `excepción inválida (${exception.pattern}): necesita un motivo y un patrón existente`,
        });
      }
    }

    for (const category of CATEGORY_IDS) {
      if (getCategory(category).shape === "record") continue;
      const entries = data.entries[category as EntryCategory];
      if (!entries) continue;
      entries.forEach((raw, index) => {
        if (!isRecord(raw)) return;
        const id = idOf(raw, index);
        const byPattern = new Map<string, ForeignMatch[]>();
        for (const found of scanForeignText(raw, patterns)) {
          const exception = allowlist.find(
            (e) =>
              e.category === category &&
              e.id === id &&
              e.pattern === found.pattern &&
              (e.match === undefined || e.match === found.match.toLowerCase()),
          );
          if (exception) {
            used.add(exception);
            continue;
          }
          byPattern.set(found.pattern, [...(byPattern.get(found.pattern) ?? []), found]);
        }
        for (const [patternId, list] of byPattern) {
          const description = patterns.find((p) => p.id === patternId)?.description ?? patternId;
          const shown = [...new Set(list.map((f) => `«${f.match}»`))].join(", ");
          issues.push({
            category,
            id,
            rule: `foreign-text.${patternId}`,
            message:
              `${description}: ${shown} en ${list[0]!.field} («…${list[0]!.excerpt}…»). ` +
              "Corrígelo con un override (reason + evidence del PRD) o, si la mención es legítima, " +
              "añádela a FOREIGN_TEXT_ALLOWLIST con su motivo",
          });
        }
      });
    }

    for (const exception of allowlist) {
      if (used.has(exception) || !data.entries[exception.category]) continue;
      issues.push({
        category: exception.category,
        id: exception.id,
        rule: "foreign-text.allowlist-stale",
        message: `la excepción de «${exception.pattern}»${exception.match === undefined ? "" : ` (${exception.match})`} ya no hace falta: elimínala`,
      });
    }
    return issues;
  };
}

export const foreignTextRule: IntegrityRule = createForeignTextRule();
