import { slugify } from "../../../src/data/schema/common";
import type { Dom } from "../lib/html";
import { loadHtml } from "../lib/html";
import type { ParserPage } from "../lib/parser-contract";
import { collapseWhitespace } from "../lib/text";

// Utilidades puras del Lote E (equipo, R24-R25): dinero, pesos, estadísticas de armas/armaduras y
// universo CRB a partir de la página de fuente de AoN y de los listados por categoría.

export const CRB_SOURCE_URL =
  "https://aonprd.com/SourceDisplay.aspx?FixedSource=PRPG Core Rulebook";
const ORIGIN = "https://aonprd.com/";

export type EquipmentKind = "weapons" | "armor" | "shields" | "gear";

export const PAGE_KIND = {
  weapons: "EquipmentWeaponsDisplay.aspx",
  armor: "EquipmentArmorDisplay.aspx",
  shields: "EquipmentArmorDisplay.aspx",
  gear: "EquipmentMiscDisplay.aspx",
} as const satisfies Record<EquipmentKind, string>;

export const ARMOR_LISTINGS = ["Light", "Medium", "Heavy", "Shield", "Extra"] as const;
export type ArmorListing = (typeof ARMOR_LISTINGS)[number];

export const MISC_LISTINGS = [
  "AdventuringGear",
  "AlchemicalRemedies",
  "AlchemicalTools",
  "AlchemicalWeapons",
  "AnimalGear",
  "BlackMarket",
  "ChannelFoci",
  "Clothing",
  "Concoction",
  "Dragoncraft",
  "DungeonGuides",
  "Entertainment",
  "FoodDrink",
  "Herbs",
  "Kit",
  "LodgingServices",
  "MountsPets",
  "PFChronicle",
  "Tincture",
  "Tools",
  "Torture",
  "TransportAir",
  "TransportLand",
  "TransportSea",
] as const;

export const armorListingUrl = (c: ArmorListing): string =>
  `${ORIGIN}EquipmentArmor.aspx?Category=${c}`;
export const miscListingUrl = (c: string): string => `${ORIGIN}EquipmentMisc.aspx?Category=${c}`;

export function itemPageUrl(kind: EquipmentKind, itemName: string): string {
  return `${ORIGIN}${PAGE_KIND[kind]}?ItemName=${encodeURIComponent(itemName)}`;
}

/** `ItemName` (decodificado) de un enlace/URL `Equipment*Display.aspx?ItemName=...`. */
export function itemNameOfHref(href: string): string | undefined {
  const match = /Equipment(?:Weapons|Armor|Misc)Display\.aspx\?ItemName=(.+)$/i.exec(href.trim());
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]!.replace(/\+/g, " "));
  } catch {
    return match[1];
  }
}

// --- dinero y pesos -----------------------------------------------------------------------------

const CP_PER_UNIT: Readonly<Record<string, number>> = { cp: 1, sp: 10, gp: 100, pp: 1000 };

/** Quita la marca de nota al pie que AoN pega a los listados (`3 lbs.1` -> `3 lbs.`). */
export function stripFootnote(value: string): string {
  return collapseWhitespace(value).replace(/^(.*?(?:lbs?\.|\bcp|\bsp|\bgp|\bpp))\d+$/, "$1");
}

/**
 * Coste literal -> piezas de cobre. Solo cantidades fijas `N cp|sp|gp|pp` (con `+` inicial en
 * complementos y un `per ...` final como "3 sp per day"). Cualquier otra cosa -> `null`.
 */
export function parseCostCp(raw: string): number | null {
  const m = /^\+?\s*(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d+))?\s*(cp|sp|gp|pp)(?:\s+per\s+.+)?$/i.exec(
    collapseWhitespace(raw),
  );
  if (!m) return null;
  const whole = Number(m[1]!.replace(/,/g, ""));
  const unit = CP_PER_UNIT[m[3]!.toLowerCase()]!;
  if (m[2] === undefined) return whole * unit;
  const frac = Number(`0.${m[2]}`) * unit;
  const total = whole * unit + frac;
  return Number.isInteger(Math.round(total * 1e6) / 1e6) ? Math.round(total) : null;
}

/** Peso literal en libras -> número (`1-1/2 lbs.` = 1.5, `1/2 lb.` = 0.5, `2,000 lbs.`, `+10 lbs.`). */
export function parseWeightLb(raw: string): number | null {
  const text = collapseWhitespace(raw);
  const m = /^\+?\s*(?:(\d{1,3}(?:,\d{3})+|\d+)(?:-|\s))?(?:(\d+)\/(\d+))?\s*lbs?\.?$/i.exec(text);
  if (m) {
    const whole = m[1] === undefined ? 0 : Number(m[1].replace(/,/g, ""));
    const frac = m[2] === undefined ? 0 : Number(m[2]) / Number(m[3]);
    if (m[1] === undefined && m[2] === undefined) return null;
    return whole + frac;
  }
  const plain = /^\+?\s*(\d{1,3}(?:,\d{3})+|\d+)\s*lbs?\.?$/i.exec(text);
  if (plain) return Number(plain[1]!.replace(/,/g, ""));
  return null;
}

// --- armas ---------------------------------------------------------------------------------------

export class EquipmentParseError extends Error {}

const DICE = /(?:\d+d\d+(?:\/\d+d\d+)?|\d+)/; // `1d6`, `1d8/1d8` (arma doble) o daño fijo `1`

export interface WeaponStats {
  category: "simple" | "martial" | "exotic" | "ammunition" | "siege";
  handedness: "unarmed" | "light" | "oneHanded" | "twoHanded" | "ranged" | "ammunition" | "siege";
  damage: { small: string; medium: string } | null;
  critical: {
    range: 18 | 19 | 20;
    multiplier: 2 | 3 | 4;
    secondaryMultiplier?: 2 | 3 | 4;
  } | null;
  rangeIncrementFt: number | null;
  minRangeFt: number | null;
  damageTypes: ("B" | "P" | "S")[];
  special: string[];
  weaponGroups: string[];
}

const dash = (v: string | undefined): boolean => v === undefined || /^[—–-]?$/.test(v.trim());

const HANDEDNESS: Readonly<Record<string, WeaponStats["handedness"]>> = {
  unarmed: "unarmed",
  light: "light",
  "one-handed": "oneHanded",
  "two-handed": "twoHanded",
  ranged: "ranged",
  ammunition: "ammunition",
};
const PROFICIENCY: Readonly<Record<string, WeaponStats["category"]>> = {
  simple: "simple",
  martial: "martial",
  exotic: "exotic",
  ammunition: "ammunition",
  "siege engine": "siege",
};

/** Estructura los campos de una página de arma. Falla (cerrado) ante cualquier forma desconocida. */
export function parseWeaponStats(stats: Readonly<Record<string, string>>): WeaponStats {
  const need = (label: string): string => {
    const v = stats[label];
    if (v === undefined) throw new EquipmentParseError(`falta el campo "${label}"`);
    return v;
  };
  const cat = need("Category").trim();
  const handedness = /^(?:direct-fire|indirect-fire|close assault)\b/i.test(cat)
    ? "siege"
    : HANDEDNESS[cat.toLowerCase()];
  if (!handedness) throw new EquipmentParseError(`Category "${cat}" desconocida`);
  const prof = PROFICIENCY[need("Proficiency").trim().toLowerCase()];
  if (!prof) throw new EquipmentParseError(`Proficiency "${stats["Proficiency"]}" desconocida`);

  let damage: WeaponStats["damage"] = null;
  const damageRaw = stats["Damage"];
  if (
    !dash(damageRaw) &&
    !/^[—–-] \(small\), [—–-] \(medium\)$/.test(collapseWhitespace(damageRaw!))
  ) {
    const m = new RegExp(`^(${DICE.source}) \\(small\\), (${DICE.source}) \\(medium\\)$`).exec(
      collapseWhitespace(damageRaw!),
    );
    if (m) damage = { small: m[1]!, medium: m[2]! };
    else if (!new RegExp(`^${DICE.source}$`).test(collapseWhitespace(damageRaw!))) {
      throw new EquipmentParseError(`Damage "${damageRaw}" desconocido`);
    }
  }

  let critical: WeaponStats["critical"] = null;
  const critRaw = stats["Critical"];
  if (!dash(critRaw)) {
    const m = /^(?:(\d+)\s*[-–]\s*20\s*\/\s*)?[x×]\s*(\d)(?:\s*\/\s*[x×]\s*(\d))?$/i.exec(
      collapseWhitespace(critRaw!),
    );
    if (!m) throw new EquipmentParseError(`Critical "${critRaw}" desconocido`);
    const range = m[1] === undefined ? 20 : Number(m[1]);
    const multiplier = Number(m[2]);
    const second = m[3] === undefined ? undefined : Number(m[3]);
    if (
      ![18, 19, 20].includes(range) ||
      ![2, 3, 4].includes(multiplier) ||
      (second !== undefined && ![2, 3, 4].includes(second))
    ) {
      throw new EquipmentParseError(`Critical "${critRaw}" fuera de rango`);
    }
    critical = {
      range: range as 18 | 19 | 20,
      multiplier: multiplier as 2 | 3 | 4,
      ...(second === undefined ? {} : { secondaryMultiplier: second as 2 | 3 | 4 }),
    };
  }

  let rangeIncrementFt: number | null = null;
  let minRangeFt: number | null = null;
  const rangeRaw = stats["Range"];
  if (!dash(rangeRaw)) {
    const m = /^(\d+)\s*ft\.?(?:\s*\((\d+)\s*ft\.?\s*min\.?\))?$/i.exec(
      collapseWhitespace(rangeRaw!),
    );
    if (!m) throw new EquipmentParseError(`Range "${rangeRaw}" desconocido`);
    rangeIncrementFt = Number(m[1]);
    if (m[2] !== undefined) minRangeFt = Number(m[2]);
  }

  const damageTypes: ("B" | "P" | "S")[] = [];
  const typeRaw = stats["Type"];
  if (!dash(typeRaw)) {
    const parts = collapseWhitespace(typeRaw!).split(/\s*(?:,|\bor\b|\band\b|\/)\s*/);
    for (const p of parts) {
      if (p !== "B" && p !== "P" && p !== "S") {
        throw new EquipmentParseError(`Type "${typeRaw}" desconocido`);
      }
      if (!damageTypes.includes(p)) damageTypes.push(p);
    }
  }

  const special = dash(stats["Special"])
    ? []
    : collapseWhitespace(stats["Special"]!)
        .split(/\s*,\s*/)
        .filter((s) => s !== "");
  const weaponGroups = dash(stats["Weapon Groups"])
    ? []
    : collapseWhitespace(stats["Weapon Groups"]!)
        .split(/\s*;\s*/)
        .filter((s) => s !== "");
  return {
    category: prof,
    handedness,
    damage,
    critical,
    rangeIncrementFt,
    minRangeFt,
    damageTypes,
    special,
    weaponGroups,
  };
}

// --- armaduras y escudos -----------------------------------------------------------------------------

export interface DefenseStats {
  bonus: number;
  maxDex: number | null;
  armorCheckPenalty: number;
  arcaneSpellFailurePct: number;
  speed30: number | null;
  speed20: number | null;
}

const signed = (value: string): number => Number(value.replace(/[−–]/g, "-").replace(/^\+/, ""));

export function parseDefenseStats(stats: Readonly<Record<string, string>>): DefenseStats {
  const need = (label: string): string => {
    const v = stats[label];
    if (v === undefined) throw new EquipmentParseError(`falta el campo "${label}"`);
    return collapseWhitespace(v);
  };
  const bonusRaw = need("Armor Bonus");
  if (!/^\+\d+$/.test(bonusRaw)) throw new EquipmentParseError(`Armor Bonus "${bonusRaw}"`);
  const dexRaw = need("Max Dex Bonus");
  if (!dash(dexRaw) && !/^\+\d+$/.test(dexRaw)) {
    throw new EquipmentParseError(`Max Dex Bonus "${dexRaw}"`);
  }
  const acpRaw = need("Armor Check Penalty");
  if (!/^(?:[-−–]\d+|0)$/.test(acpRaw)) throw new EquipmentParseError(`ACP "${acpRaw}"`);
  const asfRaw = need("Arcane Spell Failure Chance");
  if (!/^\d+%$/.test(asfRaw)) throw new EquipmentParseError(`ASF "${asfRaw}"`);
  const speedRaw = need("Speed");
  const sp = /^(?:(\d+) ft\.|—)\/(?:(\d+) ft\.|—)$/.exec(speedRaw);
  if (!sp) throw new EquipmentParseError(`Speed "${speedRaw}"`);
  return {
    bonus: signed(bonusRaw),
    maxDex: dash(dexRaw) ? null : signed(dexRaw),
    armorCheckPenalty: signed(acpRaw),
    arcaneSpellFailurePct: Number(asfRaw.slice(0, -1)),
    speed30: sp[1] === undefined ? null : Number(sp[1]),
    speed20: sp[2] === undefined ? null : Number(sp[2]),
  };
}

// --- universo CRB (página de fuente + listados) ---------------------------------------------------------

export interface SourceSection {
  /** Recuento declarado en el encabezado «Título [N]». */
  declaredCount: number;
  /** `ItemName` de cada enlace, en orden y SIN eliminar repetidos. */
  names: string[];
}

export function crbSection(page: ParserPage, title: string): SourceSection | undefined {
  const $ = loadHtml(page.html);
  const heading = $("h2")
    .filter((_i, h) => {
      const text = collapseWhitespace($(h).text());
      return text.startsWith(`${title} [`) && /\[\d+\]$/.test(text);
    })
    .first();
  if (heading.length === 0) return undefined;
  const declaredCount = Number(/\[(\d+)\]$/.exec(collapseWhitespace(heading.text()))![1]);
  const names: string[] = [];
  for (const node of heading.nextUntil("h2").get()) {
    if (node.type === "tag" && node.name === "a") {
      const name = itemNameOfHref($(node).attr("href") ?? "");
      if (name !== undefined) names.push(name);
    }
  }
  return { declaredCount, names };
}

export interface ListingRow {
  name: string;
  cost: string;
  weight: string;
}

/** Filas de un listado `EquipmentArmor.aspx` / `EquipmentMisc.aspx`; columnas por su cabecera. */
export function listingRows($: Dom): ListingRow[] {
  const rows: ListingRow[] = [];
  $("table[id^='MainContent_GridView']").each((_i, table) => {
    const header = $(table)
      .find("tr")
      .first()
      .children("th,td")
      .map((_j, c) => collapseWhitespace($(c).text()))
      .get();
    const costIdx = header.indexOf("Cost");
    const weightIdx = header.indexOf("Weight");
    $(table)
      .find("tr")
      .slice(1)
      .each((_j, tr) => {
        const cells = $(tr).children("td");
        const href = cells.first().find("a").attr("href");
        const name = href === undefined ? undefined : itemNameOfHref(href);
        if (name === undefined) return;
        rows.push({
          name,
          cost: costIdx < 0 ? "" : collapseWhitespace(cells.eq(costIdx).text()),
          weight: weightIdx < 0 ? "" : collapseWhitespace(cells.eq(weightIdx).text()),
        });
      });
  });
  return rows;
}

export function listingByUrl(
  pages: readonly ParserPage[],
  url: string,
): ReadonlyMap<string, ListingRow> | undefined {
  const page = pages.find((p) => p.url === url);
  if (!page) return undefined;
  const map = new Map<string, ListingRow>();
  for (const row of listingRows(loadHtml(page.html))) map.set(row.name, row);
  return map;
}

export interface UniverseItem {
  name: string;
  url: string;
  /** Categoría de armadura (`Light`...) o de bienes (`AdventuringGear`...) según el listado. */
  listing: string;
  row: ListingRow;
}

export interface Universe {
  items: UniverseItem[];
  /** Recuento declarado por la sección y número de enlaces (con repetidos). */
  declaredCount: number;
  linkCount: number;
  duplicates: string[];
}

const dedupe = (names: readonly string[]): { unique: string[]; duplicates: string[] } => {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const n of names) (seen.has(n) ? dup : seen).add(n);
  return { unique: [...seen], duplicates: [...dup] };
};

/**
 * Universo CRB de una categoría: enlaces de la sección de la página de fuente (el recuento declarado
 * debe coincidir con el número de enlaces) clasificados con los listados por categoría. Cada nombre
 * debe figurar en exactamente un listado.
 */
export function crbUniverse(kind: EquipmentKind, pages: readonly ParserPage[]): Universe {
  const source = pages.find((p) => p.url === CRB_SOURCE_URL);
  if (!source) throw new EquipmentParseError(`falta la página ${CRB_SOURCE_URL}`);
  const title =
    kind === "weapons"
      ? "Equipment (Weapons)"
      : kind === "gear"
        ? "Equipment (Misc.)"
        : "Equipment (Armor)";
  const secs = crbSection(source, title);
  if (!secs) throw new EquipmentParseError(`${CRB_SOURCE_URL}: no tiene la sección "${title} [N]"`);
  if (secs.declaredCount !== secs.names.length) {
    throw new EquipmentParseError(
      `«${title} [${secs.declaredCount}]» declara ${secs.declaredCount} pero lista ${secs.names.length} enlaces`,
    );
  }
  const { unique, duplicates } = dedupe(secs.names);
  const base = { declaredCount: secs.declaredCount, linkCount: secs.names.length, duplicates };

  const classify = (listings: readonly { key: string; url: string }[], names: string[]) => {
    const maps = listings.map((l) => {
      const rows = listingByUrl(pages, l.url);
      if (!rows) throw new EquipmentParseError(`falta el listado ${l.url}`);
      return { key: l.key, rows };
    });
    return names.map((name) => {
      const hits = maps.filter((m) => m.rows.has(name));
      if (hits.length !== 1) {
        throw new EquipmentParseError(
          `"${name}" figura en ${hits.length} listados (${hits.map((h) => h.key).join(", ") || "ninguno"}); se esperaba exactamente 1`,
        );
      }
      return { name, listing: hits[0]!.key, row: hits[0]!.rows.get(name)! };
    });
  };

  if (kind === "weapons") {
    const empty: ListingRow = { name: "", cost: "", weight: "" };
    return {
      ...base,
      items: unique.map((name) => ({
        name,
        url: itemPageUrl(kind, name),
        listing: "Weapons",
        row: { ...empty, name },
      })),
    };
  }
  if (kind === "gear") {
    const armor = classify(
      ARMOR_LISTINGS.map((key) => ({ key, url: armorListingUrl(key) })),
      secsOfArmor(source),
    ).filter((c) => c.listing === "Extra");
    const misc = classify(
      MISC_LISTINGS.map((key) => ({ key, url: miscListingUrl(key) })),
      unique,
    );
    return {
      ...base,
      declaredCount: base.declaredCount + armor.length,
      linkCount: base.linkCount + armor.length,
      items: [
        ...misc.map((c) => ({ ...c, url: itemPageUrl("gear", c.name) })),
        ...armor.map((c) => ({ ...c, url: itemPageUrl("armor", c.name) })),
      ],
    };
  }
  const wanted = kind === "shields" ? ["Shield"] : ["Light", "Medium", "Heavy"];
  const all = classify(
    ARMOR_LISTINGS.map((key) => ({ key, url: armorListingUrl(key) })),
    unique,
  );
  return {
    ...base,
    items: all
      .filter((c) => wanted.includes(c.listing))
      .map((c) => ({ ...c, url: itemPageUrl(kind, c.name) })),
  };
}

function secsOfArmor(source: ParserPage): string[] {
  const s = crbSection(source, "Equipment (Armor)");
  if (!s) throw new EquipmentParseError("falta la sección «Equipment (Armor)»");
  return dedupe(s.names).unique;
}

/** `AdventuringGear` -> `adventuring-gear`. */
export const kebabOfListing = (key: string): string =>
  slugify(key.replace(/([a-z])([A-Z])/g, "$1 $2"));
