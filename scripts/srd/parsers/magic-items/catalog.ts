import { loadHtml } from "../../lib/html";
import type { ParserPage } from "../../lib/parser-contract";
import { collapseWhitespace } from "../../lib/text";

// Universo CRB de objetos mágicos (R66, R67, R87): la página de fuente de AoN agrupa todo lo del
// CRB por tabla con recuento («Magic Items (Rings) [43]»); los índices por categoría de armaduras
// y armas son la segunda lectura independiente de `kind` (el índice general no trae el libro).

export const ORIGIN = "https://aonprd.com/";
export const CRB_SOURCE_URL =
  "https://aonprd.com/SourceDisplay.aspx?FixedSource=PRPG Core Rulebook";
/** Capítulo 15 del CRB como página de reglas (secciones `general`). */
export const RULES_PAGE_URL = "https://aonprd.com/Rules.aspx?ID=365";

export const FAMILIES = [
  "armor",
  "weapons",
  "rings",
  "rods",
  "staves",
  "wondrous",
  "cursed",
  "artifacts",
] as const;
export type Family = (typeof FAMILIES)[number];

/** Tabla de la página de fuente -> familia (y página de entrada de la familia). */
export const FAMILY_BY_HEADING: Readonly<Record<string, Family>> = {
  "Magic Items (Armor)": "armor",
  "Magic Items (Weapons)": "weapons",
  "Magic Items (Rings)": "rings",
  "Magic Items (Rods)": "rods",
  "Magic Items (Staves)": "staves",
  "Magic Items (Wondrous Items)": "wondrous",
  "Magic Items (Cursed Items)": "cursed",
  "Magic Items (Artifacts)": "artifacts",
};

const DISPLAY_PAGE: Readonly<Record<Family, string>> = {
  armor: "MagicArmorDisplay.aspx",
  weapons: "MagicWeaponsDisplay.aspx",
  rings: "MagicRingsDisplay.aspx",
  rods: "MagicRodsDisplay.aspx",
  staves: "MagicStavesDisplay.aspx",
  wondrous: "MagicWondrousDisplay.aspx",
  cursed: "MagicCursedDisplay.aspx",
  artifacts: "MagicArtifactsDisplay.aspx",
};

/** Índices por categoría de AoN (segunda lectura de `kind`). */
export const ARMOR_INDEXES = {
  armorQuality: `${ORIGIN}MagicArmor.aspx?Category=ArmorQuality`,
  shieldQuality: `${ORIGIN}MagicArmor.aspx?Category=ShieldQuality`,
  specificArmor: `${ORIGIN}MagicArmor.aspx?Category=SpecificArmor`,
  specificShield: `${ORIGIN}MagicArmor.aspx?Category=SpecificShield`,
} as const;
export const WEAPON_INDEXES = {
  meleeQuality: `${ORIGIN}MagicWeapons.aspx?Category=MeleeWeaponQuality`,
  rangedQuality: `${ORIGIN}MagicWeapons.aspx?Category=RangedWeaponQuality`,
  specificWeapon: `${ORIGIN}MagicWeapons.aspx?Category=SpecificWeapon`,
} as const;

/** Páginas de índice que viajan con la procedencia (semillas fijas). */
export const INDEX_SEED_URLS: readonly string[] = [
  CRB_SOURCE_URL,
  RULES_PAGE_URL,
  ...Object.values(ARMOR_INDEXES),
  ...Object.values(WEAPON_INDEXES),
];

export interface SourceRow {
  family: Family;
  /** Nombre de la fila en la página de fuente (`Ring of Protection (+1)`). */
  rowName: string;
  /** Valor de `ItemName`/`FinalName` sin codificar. */
  key: string;
  url: string;
}

export interface SourceFamilyIndex {
  family: Family;
  declaredCount: number;
  rows: SourceRow[];
}

/** URL canónica de una página de entrada: el valor del parámetro codificado (espacios como `%20`). */
export function displayUrl(family: Family, param: "ItemName" | "FinalName", key: string): string {
  return `${ORIGIN}${DISPLAY_PAGE[family]}?${param}=${encodeURIComponent(key)}`;
}

const HREF = /^(Magic[A-Za-z]+Display\.aspx)\?(ItemName|FinalName)=(.+)$/;

function rowOfHref(family: Family, href: string, rowName: string): SourceRow {
  const match = HREF.exec(href.trim());
  if (!match || match[1] !== DISPLAY_PAGE[family]) {
    throw new Error(`enlace inesperado en la tabla ${family} de la página de fuente: ${href}`);
  }
  const key = match[3]!;
  return { family, rowName, key, url: displayUrl(family, match[2] as "ItemName", key) };
}

/**
 * Tablas «Magic Items (X) [N]» de la página de fuente CRB. El recuento declarado debe coincidir con
 * el número de enlaces (falla cerrado). Devuelve una entrada por tabla presente, en orden de familia.
 */
export function crbMagicIndex(page: ParserPage): SourceFamilyIndex[] {
  const $ = loadHtml(page.html);
  const found = new Map<Family, SourceFamilyIndex>();
  $("h2").each((_i, h2) => {
    const text = collapseWhitespace($(h2).text());
    const match = /^(Magic Items \([^)]+\)) \[(\d+)\]$/.exec(text);
    if (!match) return;
    const family = FAMILY_BY_HEADING[match[1]!];
    if (family === undefined) {
      throw new Error(`${CRB_SOURCE_URL}: tabla de objetos mágicos desconocida "${match[1]}"`);
    }
    const rows: SourceRow[] = [];
    for (const node of $(h2).nextUntil("h2, br").get()) {
      if (node.type !== "tag" || node.name !== "a") continue;
      const href = $(node).attr("href") ?? "";
      rows.push(rowOfHref(family, href, collapseWhitespace($(node).text())));
    }
    const declaredCount = Number(match[2]);
    if (declaredCount !== rows.length) {
      throw new Error(
        `${CRB_SOURCE_URL}: «${text}» declara ${declaredCount} pero lista ${rows.length} enlaces`,
      );
    }
    found.set(family, { family, declaredCount, rows });
  });
  return FAMILIES.filter((f) => found.has(f)).map((f) => found.get(f)!);
}

/** Nombres (`ItemName`) de los enlaces de un índice por categoría de AoN. */
export function categoryIndexNames(page: ParserPage): Set<string> {
  const $ = loadHtml(page.html);
  const names = new Set<string>();
  $("table[id^=MainContent_GridView] a").each((_i, a) => {
    const match = /(?:ItemName|FinalName)=(.+)$/.exec($(a).attr("href") ?? "");
    if (match) {
      try {
        names.add(decodeURIComponent(match[1]!));
      } catch {
        names.add(match[1]!);
      }
    }
  });
  return names;
}
