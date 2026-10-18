import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveEntryId } from "../../../../src/data/integrity/ids";
import { slugify } from "../../../../src/data/schema/common";
import {
  MAGIC_ITEM_KINDS,
  MagicSectionsConfigSchema,
  type MagicItemKind,
  type MagicSectionsConfig,
} from "../../../../src/data/schema/magic-item";
import type {
  CategoryParser,
  DiscoverInput,
  DiscoverOutput,
  ExcludedPage,
  NeedsReviewItem,
  ParsedEntry,
  ParserPage,
} from "../../lib/parser-contract";
import {
  ARMOR_INDEXES,
  CRB_SOURCE_URL,
  FAMILIES,
  INDEX_SEED_URLS,
  ORIGIN,
  RULES_PAGE_URL,
  WEAPON_INDEXES,
  categoryIndexNames,
  crbMagicIndex,
  type Family,
  type SourceRow,
} from "./catalog";
import {
  descriptionPlain,
  descriptionRegion,
  extractEffects,
  extractExtraDamage,
  findEffectGaps,
} from "./effects";
import { isOtherBookSection, itemMarkdown, readItems, type RawItem } from "./header";
import { armorLegalFor, weaponLegalFor, type WeaponRange } from "./legal-for";
import { enhancementPrices, readRulesSections } from "./rules";
import { crbSpellNames, equipmentNames, resolveSpecific, type EquipmentNames } from "./specific";
import { slugify as slug } from "../../../../src/data/schema/common";
import { casterLevels, parsePriceVariants, parseCoins, parseWeightLb } from "./variants";

export { findEffectGaps } from "./effects";

// Parser de objetos mágicos del capítulo 15 (Lote M, R63-R90). Puro y determinista.
//
// Universo: las tablas «Magic Items (X) [N]» de la página de fuente CRB de AoN (una fila por variante
// de precio) + la página de reglas del capítulo (secciones `general`). Una entrada = un título de
// página (las páginas de variantes de un mismo título son idénticas, comprobado en `catalogOf`).

const CONFIG_URL = new URL("../../config/magic-sections.json", import.meta.url);

export function loadMagicSections(): MagicSectionsConfig {
  return MagicSectionsConfigSchema.parse(
    JSON.parse(readFileSync(fileURLToPath(CONFIG_URL), "utf8")),
  );
}

interface Occurrence {
  row: SourceRow;
  item: RawItem;
  markdown: string;
  $: ReturnType<typeof readItems>["$"];
}

export interface Group {
  family: Family;
  title: string;
  occurrences: Occurrence[];
  kinds: MagicItemKind[];
  /** Rango de las habilidades de arma según los índices de AoN. */
  weaponRange?: WeaponRange;
}

export interface Catalog {
  groups: Group[];
  excluded: ExcludedPage[];
  knownGaps: string[];
  general: ReturnType<typeof readRulesSections>;
  /** Filas de la página de fuente por familia (recuentos declarados). */
  rowsByFamily: Map<Family, SourceRow[]>;
  counters: Record<string, number>;
}

function pagesMap(pages: readonly ParserPage[]): Map<string, ParserPage> {
  return new Map(pages.map((p) => [p.url, p]));
}

function need(pages: Map<string, ParserPage>, url: string, what: string): ParserPage {
  const page = pages.get(url);
  if (!page) throw new Error(`falta en la procedencia ${what}: ${url}`);
  return page;
}

const ARMOR_BY_SLOT: Readonly<Record<string, MagicItemKind[]>> = {
  "armor quality": ["armor-ability"],
  "shield quality": ["shield-ability"],
  "armor/shield quality": ["armor-ability", "shield-ability"],
  armor: ["specific-armor"],
  shield: ["specific-shield"],
};

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}

/** Lee todas las páginas de la fuente y las agrupa por título; clasifica el `kind` con doble lectura. */
export function catalogOf(
  pageList: readonly ParserPage[],
  allowedSections: readonly string[],
  sections: MagicSectionsConfig,
): Catalog {
  const pages = pagesMap(pageList);
  const source = need(pages, CRB_SOURCE_URL, "la página de fuente CRB");
  const families = crbMagicIndex(source);
  if (families.length !== FAMILIES.length) {
    throw new Error(
      `${CRB_SOURCE_URL}: faltan tablas de objetos mágicos (hay ${families.map((f) => f.family).join(", ")})`,
    );
  }
  const armorIdx = Object.fromEntries(
    Object.entries(ARMOR_INDEXES).map(([k, url]) => [
      k,
      categoryIndexNames(need(pages, url, "el índice de armaduras")),
    ]),
  ) as Record<keyof typeof ARMOR_INDEXES, Set<string>>;
  const weaponIdx = Object.fromEntries(
    Object.entries(WEAPON_INDEXES).map(([k, url]) => [
      k,
      categoryIndexNames(need(pages, url, "el índice de armas")),
    ]),
  ) as Record<keyof typeof WEAPON_INDEXES, Set<string>>;

  const excluded: ExcludedPage[] = [];
  const knownGaps: string[] = [];
  const counters: Record<string, number> = {
    "filas de la página de fuente": 0,
    "páginas con contenido CRB": 0,
    "páginas de otro libro excluidas": 0,
    "secciones de otro libro ignoradas": 0,
    "huecos de la fuente declarados": 0,
  };
  const rowsByFamily = new Map<Family, SourceRow[]>();
  const byKey = new Map<string, Group>();
  const order: Group[] = [];
  const cache = new Map<string, ReturnType<typeof readItems>>();

  for (const familyIndex of families) {
    rowsByFamily.set(familyIndex.family, familyIndex.rows);
    for (const row of familyIndex.rows) {
      counters["filas de la página de fuente"]!++;
      const page = need(pages, row.url, `la página de «${row.rowName}»`);
      let read = cache.get(row.url);
      if (!read) {
        read = readItems(page, allowedSections);
        cache.set(row.url, read);
      }
      if (read.items.length === 0) {
        const gap = sections.knownGaps.find(
          (g) => g.family === row.family && g.rowName === row.rowName,
        );
        if (!gap) {
          throw new Error(
            `${row.url}: la fila «${row.rowName}» no tiene contenido y no figura en knownGaps de magic-sections.json`,
          );
        }
        counters["huecos de la fuente declarados"]!++;
        knownGaps.push(`${row.family}: ${row.rowName}`);
        excluded.push({
          url: row.url,
          book: "(sin contenido)",
          reason: `hueco de la fuente: ${gap.reason}`,
        });
        continue;
      }
      let crbCount = 0;
      for (const item of read.items) {
        if (item.crbLabel === undefined) {
          counters["secciones de otro libro ignoradas"]!++;
          excluded.push({
            url: row.url,
            book: item.labels.join(", "),
            reason: `«${item.title}»: sin etiqueta PRPG Core Rulebook (R87)`,
          });
          continue;
        }
        crbCount++;
        const occurrence: Occurrence = {
          row,
          item,
          markdown: itemMarkdown(read.$, item),
          $: read.$,
        };
        const key = `${row.family}|${item.title}`;
        let group = byKey.get(key);
        if (!group) {
          group = { family: row.family, title: item.title, occurrences: [], kinds: [] };
          byKey.set(key, group);
          order.push(group);
        }
        group.occurrences.push(occurrence);
      }
      if (crbCount === 0) {
        const gap = sections.knownGaps.find(
          (g) => g.family === row.family && g.rowName === row.rowName,
        );
        if (!gap) {
          throw new Error(
            `${row.url}: la fila CRB «${row.rowName}» no tiene ninguna sección con etiqueta PRPG Core Rulebook y no figura en knownGaps de magic-sections.json`,
          );
        }
        counters["páginas de otro libro excluidas"]!++;
        counters["huecos de la fuente declarados"]!++;
        knownGaps.push(`${row.family}: ${row.rowName}`);
      } else {
        counters["páginas con contenido CRB"]!++;
      }
    }
  }

  // Las páginas de variantes de un mismo título deben ser idénticas.
  for (const group of order) {
    const first = group.occurrences[0]!;
    const signature = (o: Occurrence): string =>
      JSON.stringify([
        o.item.labels,
        o.item.sourceLine,
        o.item.aura,
        o.item.cl,
        o.item.slot,
        o.item.price,
        o.item.weight,
        o.markdown,
      ]);
    for (const other of group.occurrences.slice(1)) {
      if (signature(other) !== signature(first)) {
        throw new Error(
          `«${group.title}»: las páginas ${first.row.url} y ${other.row.url} tienen contenido distinto`,
        );
      }
    }
  }

  // Clasificación de `kind` (slot de la página + índices por categoría de AoN).
  for (const group of order) {
    const item = group.occurrences[0]!.item;
    const rowKeys = group.occurrences.map((o) => o.row.key);
    const slot = item.slot.toLowerCase();
    switch (group.family) {
      case "armor": {
        const fromSlot = ARMOR_BY_SLOT[slot];
        if (!fromSlot)
          throw new Error(`«${group.title}»: ranura de armadura/escudo desconocida "${item.slot}"`);
        for (const key of rowKeys) {
          const fromIndex: MagicItemKind[] = [];
          if (armorIdx.armorQuality.has(key)) fromIndex.push("armor-ability");
          if (armorIdx.shieldQuality.has(key)) fromIndex.push("shield-ability");
          if (armorIdx.specificArmor.has(key)) fromIndex.push("specific-armor");
          if (armorIdx.specificShield.has(key)) fromIndex.push("specific-shield");
          if (!sameSet(fromSlot, fromIndex)) {
            throw new Error(
              `«${group.title}» (${key}): la ranura «${item.slot}» da ${fromSlot.join("+")} pero los índices de AoN dan ${fromIndex.join("+") || "ninguno"}`,
            );
          }
        }
        group.kinds = [...fromSlot];
        break;
      }
      case "weapons": {
        const isAbility = slot === "weapon quality";
        for (const key of rowKeys) {
          const specific = weaponIdx.specificWeapon.has(key);
          if (specific === isAbility) {
            throw new Error(
              `«${group.title}» (${key}): la ranura «${item.slot}» y el índice SpecificWeapon de AoN no coinciden`,
            );
          }
        }
        if (isAbility) {
          const melee = rowKeys.every((k) => weaponIdx.meleeQuality.has(k));
          const ranged = rowKeys.every((k) => weaponIdx.rangedQuality.has(k));
          if (!melee && !ranged) {
            throw new Error(
              `«${group.title}»: la habilidad de arma no figura en los índices de calidades`,
            );
          }
          group.weaponRange = melee && ranged ? "any" : melee ? "melee" : "ranged";
          group.kinds = ["weapon-ability"];
        } else {
          group.kinds = ["specific-weapon"];
        }
        break;
      }
      case "rings":
        group.kinds = ["ring"];
        break;
      case "rods":
        group.kinds = ["rod"];
        break;
      case "staves":
        group.kinds = ["staff"];
        break;
      case "wondrous":
        group.kinds = ["wondrous"];
        break;
      case "cursed":
        group.kinds = ["cursed"];
        break;
      case "artifacts":
        group.kinds = ["artifact"];
        break;
    }
  }

  // Secciones de reglas.
  const rulesPage = need(pages, RULES_PAGE_URL, "la página de reglas del capítulo 15");
  const allRules = readRulesSections(rulesPage);
  const general = allRules.filter((s) => s.crbLabel !== undefined);
  for (const s of allRules.filter((x) => x.crbLabel === undefined)) {
    excluded.push({
      url: RULES_PAGE_URL,
      book: s.labels.join(", "),
      reason: `sección «${s.title}» sin etiqueta CRB (R87)`,
    });
  }

  return { groups: order, excluded, knownGaps, general, rowsByFamily, counters };
}

export function countByKind(catalog: Catalog): Record<string, number> {
  const out: Record<string, number> = {};
  for (const group of catalog.groups) {
    for (const kind of group.kinds) out[kind] = (out[kind] ?? 0) + 1;
  }
  out["general"] = catalog.general.length;
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** Recuentos por `kind` y semillas: todas las filas de la fuente + índices (R66, R67). */
export function discover(input: DiscoverInput): DiscoverOutput {
  const hasSource = input.seedPages.some((p) => p.url === CRB_SOURCE_URL);
  if (!hasSource) return { urls: [] };
  const catalog = catalogOf(input.seedPages, input.config.allowedSections, loadMagicSections());
  const urls = [...catalog.rowsByFamily.values()].flatMap((rows) => rows.map((r) => r.url));
  return { urls, expectations: { expectedCountByKind: countByKind(catalog) } };
}

// --- construcción de entradas ---------------------------------------------------------------------

const KIND_SUFFIX: Readonly<Partial<Record<MagicItemKind, string>>> = {
  "weapon-ability": "weapon",
  "armor-ability": "armor",
  "shield-ability": "shield",
};

function suggestedId(name: string, kind: MagicItemKind): string {
  return `${slugify(name)}-${KIND_SUFFIX[kind] ?? kind}`;
}

type Aliases = Readonly<Record<string, Readonly<Record<string, string>>>>;

function assignIds(
  pairs: readonly { name: string; kind: MagicItemKind }[],
  aliases: Aliases,
): Map<string, string> {
  const ids = new Map<string, string>();
  const bySlug = new Map<string, { name: string; kind: MagicItemKind }[]>();
  for (const p of pairs) {
    const id = resolveEntryId("magic-items", p.name, aliases, p.kind);
    ids.set(`${p.kind}|${p.name}`, id);
    const list = bySlug.get(id) ?? [];
    list.push(p);
    bySlug.set(id, list);
  }
  const collisions = [...bySlug].filter(([, list]) => list.length > 1);
  if (collisions.length > 0) {
    const lines = collisions.flatMap(([id, list]) =>
      list.map(
        (p) =>
          `    "${p.kind}.${slugify(p.name)}": "${suggestedId(p.name, p.kind)}"  (id ${id} repetido)`,
      ),
    );
    throw new Error(
      `colisión de ids en magic-items; declara estos alias en slug-aliases.json ("magic-items"):\n${lines.join("\n")}`,
    );
  }
  return ids;
}

const KIND_SECTION_ORDER = MAGIC_ITEM_KINDS;

const FUNCTIONS_AS = /\bfunctions as an? ([a-z' -]+?) weapon\b/gi;

/** Habilidades de arma que otra «funciona como» (nombre en minúsculas -> id de `weapon-ability`). */
export function functionsAsAbilities(
  description: string,
  byName: ReadonlyMap<string, string>,
): { ids: string[]; unresolved: string[] } {
  const ids: string[] = [];
  const unresolved: string[] = [];
  for (const m of description.matchAll(FUNCTIONS_AS)) {
    const name = m[1]!.toLowerCase();
    const id = byName.get(name);
    if (id === undefined) unresolved.push(name);
    else if (!ids.includes(id)) ids.push(id);
  }
  return { ids, unresolved };
}

function crossBookReasons(textEn: string): string[] {
  const reasons: string[] = [];
  const region = descriptionRegion(textEn).replace(/\*/g, "");
  const books = new Set<string>();
  for (const m of region.matchAll(/\(([^()]*?)\s+pg\.\s*\d+\)/g)) {
    const label = m[1]!.trim();
    if (!label.startsWith("PRPG Core Rulebook")) books.add(label);
  }
  if (books.size > 0) {
    reasons.push(`el texto cita otros libros (${[...books].join(", ")})`);
  }
  return reasons;
}

const ROMAN: Readonly<Record<string, number>> = {
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
  ix: 9,
};

/** Minúsculas, apóstrofo recto y numeral romano final en cifras («Summon monster VI» -> «summon monster 6»). */
export function normalizeSpellName(name: string): string {
  const lower = name.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
  return lower.replace(/ (i|ii|iii|iv|v|vi|vii|viii|ix)$/, (_m, r: string) => ` ${ROMAN[r]}`);
}

/** Nombre normalizado -> id. «Suggestion, Mass» también se reconoce como «mass suggestion». */
export function spellIdIndex(names: readonly string[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const name of names) {
    index.set(normalizeSpellName(name), slug(name));
    const m = /^(.*), (lesser|greater|mass|communal|improved)$/i.exec(name);
    if (m) index.set(normalizeSpellName(`${m[2]} ${m[1]}`), slug(name));
  }
  return index;
}

/** Conjuros que cita un bastón: texto en cursiva de la descripción que es un conjuro del CRB (R85). */
function staffSpellRefs(
  textEn: string,
  title: string,
  ctx: BuildContext,
): { name: string; spellId: string | null }[] {
  const refs: { name: string; spellId: string | null }[] = [];
  const unmatched = new Set<string>();
  const region = descriptionRegion(textEn);
  for (const m of region.matchAll(/(?<![*\w])\*([^*\n]+)\*(?![*\w])/g)) {
    const name = m[1]!.trim();
    const lower = normalizeSpellName(name);
    if (lower === title.toLowerCase() || refs.some((r) => r.name.toLowerCase() === lower)) continue;
    const id = ctx.spellIds.get(lower);
    if (id !== undefined) refs.push({ name, spellId: id });
    else unmatched.add(name);
  }
  if (unmatched.size > 0) {
    ctx.notes.push(
      `bastón ${title}: cursivas que no son conjuros del CRB (no van a spellRefs): ${[...unmatched].join(", ")}`,
    );
  }
  return refs;
}

interface BuildContext {
  aliases: Aliases;
  ids: Map<string, string>;
  names: EquipmentNames;
  /** Conjuros del CRB: nombre en minúsculas -> id (slug del nombre). */
  spellIds: ReadonlyMap<string, string>;
  abilityByKind: Record<"weapon-ability" | "armor-ability" | "shield-ability", Map<string, string>>;
  counters: Record<string, number>;
  notes: string[];
}

function buildItemEntry(
  group: Group,
  kind: MagicItemKind,
  ctx: BuildContext,
): { entry: ParsedEntry; reasons: string[] } {
  const first = group.occurrences[0]!;
  const item = first.item;
  const id = ctx.ids.get(`${kind}|${group.title}`)!;
  const reasons: string[] = [];
  const textEn = first.markdown;
  const priceVariants = parsePriceVariants(item.price, first.row.url);
  const cl = casterLevels(item.cl);
  if (!cl.structured) {
    reasons.push(`nivel de lanzador sin estructurar: «${item.cl}»`);
    ctx.counters["niveles de lanzador sin estructurar"] =
      (ctx.counters["niveles de lanzador sin estructurar"] ?? 0) + 1;
  }
  const isSpecific =
    kind === "specific-weapon" || kind === "specific-armor" || kind === "specific-shield";
  const specific = isSpecific
    ? resolveSpecific(
        kind,
        textEn,
        ctx.names,
        {
          byName:
            ctx.abilityByKind[
              kind === "specific-weapon"
                ? "weapon-ability"
                : kind === "specific-armor"
                  ? "armor-ability"
                  : "shield-ability"
            ],
        },
        /^no aura/i.test(item.aura),
      )
    : undefined;
  const extracted = extractEffects(
    kind,
    textEn,
    priceVariants.map((v) => ({ variantId: v.variantId, label: v.label })),
    { skipItemEnhancement: specific?.enhancement !== undefined },
  );
  const isWeaponKind = kind === "weapon-ability" || kind === "specific-weapon";
  const extra = isWeaponKind ? extractExtraDamage(textEn) : [];
  const variants = priceVariants.map((v) => ({
    variantId: v.variantId,
    label: v.label,
    casterLevel: cl.forLabel(v.label, priceVariants.length === 1),
    priceRaw: v.priceRaw,
    priceCp: v.priceCp,
    ...(v.bonusEquivalent === undefined ? {} : { bonusEquivalent: v.bonusEquivalent }),
    effects: extracted.perVariant.get(v.variantId) ?? [],
    extraDamage: extra,
  }));

  const weight = parseWeightLb(item.weight);
  if (weight === undefined) {
    ctx.counters["pesos no numéricos (weightLb null)"] =
      (ctx.counters["pesos no numéricos (weightLb null)"] ?? 0) + 1;
    ctx.notes.push(`peso no numérico: ${group.title} «${item.weight}»`);
  }
  const constructionCost = item.construction?.cost ?? "";
  const constructionCp = parseCoins(constructionCost) ?? null;
  const entry: ParsedEntry = {
    id,
    name: group.title,
    textEn,
    source: first.row.url,
    sourceRef: item.crbLabel!,
    book: "CRB",
    kind,
    slot: item.slot,
    aura: item.aura,
    weightLb: weight ?? null,
    construction: {
      requirements: item.construction?.requirements ?? "",
      costRaw: constructionCost,
      costCp: constructionCp,
    },
    ...(item.labels.length > 1 ? { sourceRefAll: item.sourceLine } : {}),
    reprintedIn: item.labels.filter((l) => l !== item.crbLabel),
    variants,
  };

  const description = descriptionPlain(textEn);
  if (kind === "weapon-ability") {
    const result = weaponLegalFor(description, group.weaponRange!);
    entry["legalFor"] = result.legalFor;
    if (result.reviewReason) reasons.push(result.reviewReason);
    // «A flaming burst weapon functions as a flaming weapon...»: incluye el efecto de esa habilidad.
    const functionsAs = functionsAsAbilities(description, ctx.abilityByKind["weapon-ability"]);
    if (functionsAs.unresolved.length > 0) {
      reasons.push(`functionsAs sin resolver: ${functionsAs.unresolved.join(", ")}`);
    }
    if (functionsAs.ids.length > 0) entry["functionsAs"] = functionsAs.ids;
  } else if (kind === "armor-ability" || kind === "shield-ability") {
    const result = armorLegalFor(description);
    entry["legalFor"] = result.legalFor;
    if (result.reviewReason) reasons.push(result.reviewReason);
  } else if (specific) {
    entry["baseItemId"] = specific.baseItemId;
    if (specific.baseItemRaw !== undefined) entry["baseItemRaw"] = specific.baseItemRaw;
    if (specific.enhancement) entry["enhancement"] = specific.enhancement;
    entry["abilityIds"] = specific.abilityIds;
    entry["baseEvidence"] = specific.baseEvidence;
    reasons.push(...specific.reviewReasons);
  }
  if (kind === "staff") {
    const refs = staffSpellRefs(textEn, group.title, ctx);
    entry["spellRefs"] = refs;
  }
  reasons.push(...crossBookReasons(textEn));
  // Las secciones propias de otro libro (Resonance, de Ultimate Equipment) no entran en textEn.
  const omitted = item.sections.filter((s) => isOtherBookSection(s.heading));
  if (omitted.length > 0) {
    ctx.counters["secciones de otro libro omitidas del texto (Resonance)"] =
      (ctx.counters["secciones de otro libro omitidas del texto (Resonance)"] ?? 0) +
      omitted.length;
  }
  return { entry, reasons };
}

function buildGeneralEntry(
  section: ReturnType<typeof readRulesSections>[number],
  id: string,
): ParsedEntry {
  const prices = enhancementPrices(section.title, section.tables);
  return {
    id,
    name: section.title,
    textEn: section.textEn,
    source: RULES_PAGE_URL,
    sourceRef: section.crbLabel!,
    book: "CRB",
    kind: "general",
    slot: "",
    aura: "",
    weightLb: null,
    construction: { requirements: "", costRaw: "", costCp: null },
    reprintedIn: section.labels.filter((l) => l !== section.crbLabel),
    variants: [
      {
        variantId: "default",
        label: "default",
        casterLevel: null,
        priceRaw: "",
        priceCp: null,
        effects: [],
        extraDamage: [],
      },
    ],
    ...(prices ? { enhancementPrices: prices } : {}),
  };
}

/** Subconjuntos de `--category magic-items:<subconjunto>`: un `kind` o un grupo de ellos. */
const SUBSET_KINDS: Readonly<Record<string, readonly MagicItemKind[]>> = {
  armor: ["armor-ability", "shield-ability", "specific-armor", "specific-shield"],
  weapon: ["weapon-ability", "specific-weapon"],
  weapons: ["weapon-ability", "specific-weapon"],
  rings: ["ring"],
  rods: ["rod"],
  staves: ["staff"],
  cursed: ["cursed"],
  artifacts: ["artifact"],
};

export function kindsOfSubset(subset: string | undefined): readonly MagicItemKind[] {
  if (subset === undefined) return MAGIC_ITEM_KINDS;
  if ((MAGIC_ITEM_KINDS as readonly string[]).includes(subset)) return [subset as MagicItemKind];
  const group = SUBSET_KINDS[subset];
  if (!group) {
    throw new Error(
      `subconjunto desconocido "${subset}" (válidos: ${[...MAGIC_ITEM_KINDS, ...Object.keys(SUBSET_KINDS)].join(", ")})`,
    );
  }
  return group;
}

export const parse: CategoryParser = (input) => {
  const sections = loadMagicSections();
  const wantedKinds = new Set<MagicItemKind>(kindsOfSubset(input.subset));
  const catalog = catalogOf(input.pages, input.config.allowedSections, sections);
  const source = input.pages.find((p) => p.url === CRB_SOURCE_URL)!;
  const names = equipmentNames(source);
  const spellIds = spellIdIndex(crbSpellNames(source));
  const aliases = input.config.slugAliases;

  const pairs: { name: string; kind: MagicItemKind }[] = [];
  for (const group of catalog.groups)
    for (const kind of group.kinds) pairs.push({ name: group.title, kind });
  for (const s of catalog.general) pairs.push({ name: s.title, kind: "general" });
  const ids = assignIds(pairs, aliases);

  const abilityByKind = {
    "weapon-ability": new Map<string, string>(),
    "armor-ability": new Map<string, string>(),
    "shield-ability": new Map<string, string>(),
  };
  for (const group of catalog.groups) {
    for (const kind of group.kinds) {
      if (kind === "weapon-ability" || kind === "armor-ability" || kind === "shield-ability") {
        abilityByKind[kind].set(group.title.toLowerCase(), ids.get(`${kind}|${group.title}`)!);
      }
    }
  }

  const counters: Record<string, number> = { ...catalog.counters };
  const notes: string[] = [];
  const ctx: BuildContext = { aliases, ids, names, spellIds, abilityByKind, counters, notes };
  const entries: ParsedEntry[] = [];
  const needsReview: NeedsReviewItem[] = [];

  for (const group of catalog.groups) {
    for (const kind of group.kinds) {
      if (!wantedKinds.has(kind)) continue;
      const { entry, reasons } = buildItemEntry(group, kind, ctx);
      entries.push(entry);
      if (reasons.length > 0) needsReview.push({ id: entry.id, reason: reasons.join("; ") });
    }
  }
  if (wantedKinds.has("general")) {
    for (const section of catalog.general) {
      entries.push(buildGeneralEntry(section, ids.get(`general|${section.title}`)!));
    }
  }

  // Contadores e informe (R86, R88, R90).
  for (const kind of KIND_SECTION_ORDER) {
    const n = entries.filter((e) => e["kind"] === kind).length;
    if (n > 0) counters[`entradas ${kind}`] = n;
  }
  counters["entradas con reprintedIn"] = entries.filter(
    (e) => Array.isArray(e["reprintedIn"]) && e["reprintedIn"].length > 0,
  ).length;
  const gaps = findEffectGaps(entries);
  counters["entradas con bonificador tipado sin efecto (R88)"] = gaps.length;
  if (gaps.length > 0) notes.push(`huecos de efectos (R88): ${gaps.join(", ")}`);
  counters["efectos estructurados"] = entries.reduce(
    (sum, e) =>
      sum + (e["variants"] as { effects: unknown[] }[]).reduce((s, v) => s + v.effects.length, 0),
    0,
  );
  for (const gap of catalog.knownGaps) notes.push(`hueco de la fuente (sin entrada): ${gap}`);

  const importedKinds = [...new Set(entries.map((e) => e["kind"] as string))].sort();
  return {
    entries,
    shardOf: (entry) => `magic-items/${entry["kind"] as string}.json`,
    needsReview,
    excluded: catalog.excluded,
    counters,
    notes,
    provenancePatch: { importedKinds },
  };
};

export { INDEX_SEED_URLS, ORIGIN };
