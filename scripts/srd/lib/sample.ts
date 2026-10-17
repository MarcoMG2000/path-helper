import { CATEGORY_IDS, slugify, type Category } from "../../../src/data/schema/common";
import { createPrng } from "./prng";
import { jaccard } from "./text";

// Informe de muestreo para revisión humana (R53-R57, R89, R90, R103). Funciones puras: el PRNG es
// determinista y la selección parte de entradas ordenadas por id, así que la misma semilla y los
// mismos datos producen el mismo informe (R54).

export const CROSSCHECK_THRESHOLD = 0.9;

type Rec = Record<string, unknown>;

export interface SampleSource {
  entries: Partial<Record<Category, readonly Rec[]>>;
  summaries: Partial<
    Record<Category, Readonly<Record<string, { summaryEs: string; status: string }>>>
  >;
  /** Glosario fusionado `clave -> entrada`. */
  glossary: Readonly<Record<string, { es: string; verified: boolean }>>;
  overridesApplied: Partial<Record<Category, readonly { id: string; field: string }[]>>;
  /** `findEffectGaps` del Lote M: ids de `magic-items` con bonificador tipado sin efecto (R88). */
  effectGaps?: (entries: readonly Rec[]) => readonly string[];
}

export interface SampleOptions {
  seed: number;
  perCategory: number;
}

export interface Crosscheck {
  url?: string;
  similarity?: number;
  suspicious?: boolean;
}

export interface SampleItem {
  category: Category;
  id: string;
  reasons: string[];
  entry: Rec;
  nameEs: string | null;
  nameEsVerified: boolean;
  summary?: { summaryEs: string; status: string };
  crosscheck?: Crosscheck;
}

export interface SampleCounters {
  entriesByCategory: Record<string, number>;
  summariesDraft: number;
  glossaryUnverified: number;
  overridesApplied: number;
  magicItems?: {
    byKind: Record<string, number>;
    reprinted: number;
    effectGaps: string[];
  };
  spells?: {
    byLevelKey: Record<string, number>;
    bySchool: Record<string, number>;
    withOtherFields: number;
    onlySorcererWizard: number;
  };
}

export interface SampleSet {
  seed: number;
  perCategory: number;
  items: SampleItem[];
  counters: SampleCounters;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function byId(entries: readonly Rec[]): Rec[] {
  return [...entries].sort((a, b) => (str(a["id"]) ?? "").localeCompare(str(b["id"]) ?? ""));
}

function isSorWizOnly(entry: Rec): boolean {
  const levels = entry["levels"];
  if (typeof levels !== "object" || levels === null) return false;
  const keys = Object.keys(levels);
  return keys.length > 0 && keys.every((k) => k === "sorcerer" || k === "wizard");
}

function hasOtherFields(entry: Rec): boolean {
  const kindOf = (field: string, key = "kind"): unknown => {
    const v = entry[field];
    return typeof v === "object" && v !== null ? (v as Rec)[key] : undefined;
  };
  const targeting = Array.isArray(entry["targeting"]) ? (entry["targeting"] as Rec[]) : [];
  return (
    kindOf("castingTime", "unit") === "other" ||
    kindOf("range") === "other" ||
    kindOf("duration") === "other" ||
    kindOf("savingThrow") === "other" ||
    kindOf("spellResistance", "applies") === "other" ||
    targeting.some((t) => t["kind"] === "other")
  );
}

export function buildSample(source: SampleSource, options: SampleOptions): SampleSet {
  const prng = createPrng(options.seed);
  const selected = new Map<string, SampleItem>();

  const add = (category: Category, entry: Rec, reason: string): void => {
    const id = str(entry["id"]);
    if (id === undefined) return;
    const key = `${category}:${id}`;
    const existing = selected.get(key);
    if (existing) {
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
      return;
    }
    const glossary = source.glossary[`${category}:${id}`];
    const summary = source.summaries[category]?.[id];
    selected.set(key, {
      category,
      id,
      reasons: [reason],
      entry,
      nameEs: glossary?.es ?? null,
      nameEsVerified: glossary?.verified ?? false,
      ...(summary ? { summary } : {}),
    });
  };

  for (const category of CATEGORY_IDS) {
    const entries = byId(source.entries[category] ?? []);
    if (entries.length === 0) continue;

    // Estrato 1: todas las clases.
    if (category === "classes") for (const e of entries) add(category, e, "clase");

    // Estrato 2: overrides aplicados o needsReview.
    const overridden = new Set((source.overridesApplied[category] ?? []).map((o) => o.id));
    for (const e of entries) {
      if (e["needsReview"] === true) add(category, e, "needsReview");
      if (overridden.has(str(e["id"]) ?? "")) add(category, e, "override");
    }

    // Estratos fijos de conjuros (R103) y objetos mágicos (R89).
    if (category === "spells") {
      const schools = [
        ...new Set(entries.map((e) => str(e["school"])).filter((s) => s !== undefined)),
      ].sort();
      for (const school of schools) {
        const pool = entries.filter((e) => e["school"] === school);
        add(category, pool[prng.int(pool.length)]!, `escuela: ${school}`);
      }
      const only = entries.filter(isSorWizOnly);
      if (only.length > 0) add(category, only[prng.int(only.length)]!, "solo sorcerer/wizard");
    }
    if (category === "magic-items") {
      const kinds = [
        ...new Set(entries.map((e) => str(e["kind"])).filter((s) => s !== undefined)),
      ].sort();
      for (const kind of kinds) {
        const pool = entries.filter((e) => e["kind"] === kind);
        add(category, pool[prng.int(pool.length)]!, `kind: ${kind}`);
      }
    }

    // Estrato 3: k aleatorias del resto (las clases ya están todas).
    if (category !== "classes") {
      const rest = entries.filter((e) => !selected.has(`${category}:${str(e["id"])}`));
      for (const e of prng.shuffle(rest).slice(0, options.perCategory))
        add(category, e, "aleatoria");
    }
  }

  const order = new Map<string, number>(CATEGORY_IDS.map((c, i) => [c, i]));
  const items = [...selected.values()].sort(
    (a, b) =>
      (order.get(a.category) ?? 0) - (order.get(b.category) ?? 0) || a.id.localeCompare(b.id),
  );

  const counters: SampleCounters = {
    entriesByCategory: Object.fromEntries(
      CATEGORY_IDS.filter((c) => (source.entries[c]?.length ?? 0) > 0).map((c) => [
        c,
        source.entries[c]!.length,
      ]),
    ),
    summariesDraft: Object.values(source.summaries).reduce(
      (n, file) => n + Object.values(file ?? {}).filter((s) => s.status === "draft").length,
      0,
    ),
    glossaryUnverified: Object.values(source.glossary).filter((g) => !g.verified).length,
    overridesApplied: Object.values(source.overridesApplied).reduce(
      (n, o) => n + (o?.length ?? 0),
      0,
    ),
  };

  const magic = source.entries["magic-items"];
  if (magic && magic.length > 0) {
    const byKind: Record<string, number> = {};
    for (const e of magic) {
      const kind = str(e["kind"]) ?? "unknown";
      byKind[kind] = (byKind[kind] ?? 0) + 1;
    }
    counters.magicItems = {
      byKind: Object.fromEntries(Object.entries(byKind).sort(([a], [b]) => a.localeCompare(b))),
      reprinted: magic.filter((e) => Array.isArray(e["reprintedIn"]) && e["reprintedIn"].length > 0)
        .length,
      effectGaps: [...(source.effectGaps?.(magic) ?? [])].sort(),
    };
  }

  const spells = source.entries["spells"];
  if (spells && spells.length > 0) {
    const byLevelKey: Record<string, number> = {};
    const bySchool: Record<string, number> = {};
    for (const e of spells) {
      const levels = e["levels"];
      if (typeof levels === "object" && levels !== null) {
        for (const key of Object.keys(levels)) byLevelKey[key] = (byLevelKey[key] ?? 0) + 1;
      }
      const school = str(e["school"]) ?? "unknown";
      bySchool[school] = (bySchool[school] ?? 0) + 1;
    }
    const sortKeys = (o: Record<string, number>): Record<string, number> =>
      Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
    counters.spells = {
      byLevelKey: sortKeys(byLevelKey),
      bySchool: sortKeys(bySchool),
      withOtherFields: spells.filter(hasOtherFields).length,
      onlySorcererWizard: spells.filter(isSorWizOnly).length,
    };
  }

  return { seed: options.seed, perCategory: options.perCategory, items, counters };
}

export interface CrosscheckDeps {
  /** Descarga el texto de una URL (inyectado: `fetch` falso en tests). */
  fetchText: (url: string) => Promise<string>;
  /** Plantillas por categoría con `{id}`, `{slug}` y `{name}` (de `seeds.json`). */
  templates: Readonly<Record<string, string>>;
}

export function crosscheckUrl(template: string, item: SampleItem): string {
  const name = str(item.entry["name"]) ?? item.id;
  return template
    .replace(/\{id\}/g, encodeURIComponent(item.id))
    .replace(/\{slug\}/g, slugify(name))
    .replace(/\{name\}/g, encodeURIComponent(name));
}

/** R56: similitud de texto normalizado con la fuente de contraste; < 0,9 = sospechosa. */
export async function applyCrosscheck(set: SampleSet, deps: CrosscheckDeps): Promise<SampleSet> {
  const items: SampleItem[] = [];
  for (const item of set.items) {
    const template = deps.templates[item.category];
    if (!template) {
      items.push({ ...item, crosscheck: {} });
      continue;
    }
    const url = crosscheckUrl(template, item);
    try {
      const text = await deps.fetchText(url);
      const similarity = jaccard(str(item.entry["textEn"]) ?? "", text);
      items.push({
        ...item,
        crosscheck: { url, similarity, suspicious: similarity < CROSSCHECK_THRESHOLD },
      });
    } catch {
      items.push({ ...item, crosscheck: { url } });
    }
  }
  return { ...set, items };
}

function counts(record: Record<string, number>): string {
  const pairs = Object.entries(record).map(([k, v]) => `${k}: ${v}`);
  return pairs.length > 0 ? pairs.join(", ") : "(ninguno)";
}

export function renderSample(set: SampleSet): string {
  const c = set.counters;
  const lines: string[] = [
    `# Muestra SRD (semilla ${set.seed}, ${set.perCategory} por categoría)`,
    "",
    "## Resumen",
    "",
    "| Categoría | Entradas |",
    "| --- | --- |",
    ...Object.entries(c.entriesByCategory).map(([k, v]) => `| ${k} | ${v} |`),
    "",
    `- Resúmenes ES en estado draft: ${c.summariesDraft}`,
    `- Claves de glosario con verified: false: ${c.glossaryUnverified}`,
    `- Overrides aplicados: ${c.overridesApplied}`,
  ];
  if (c.magicItems) {
    lines.push(
      "",
      "### Objetos mágicos",
      "",
      `- Por kind: ${counts(c.magicItems.byKind)}`,
      `- Con reprintedIn no vacío: ${c.magicItems.reprinted}`,
      `- Con bonificador tipado sin efecto estructurado (R88): ${c.magicItems.effectGaps.length}` +
        (c.magicItems.effectGaps.length > 0 ? ` (${c.magicItems.effectGaps.join(", ")})` : ""),
    );
  }
  if (c.spells) {
    lines.push(
      "",
      "### Conjuros",
      "",
      `- Por clave de nivel: ${counts(c.spells.byLevelKey)}`,
      `- Por escuela: ${counts(c.spells.bySchool)}`,
      `- Con campos estructurados kind "other" (R96): ${c.spells.withOtherFields}`,
      `- Solo sorcerer/wizard: ${c.spells.onlySorcererWizard}`,
    );
  }
  lines.push("", `## Entradas (${set.items.length})`);
  for (const item of set.items) {
    const { textEn, ...structured } = item.entry;
    const name = str(item.entry["name"]) ?? item.id;
    const es = item.nameEs
      ? `${item.nameEs} (${item.nameEsVerified ? "verificado" : "sin verificar"})`
      : "sin nombre ES";
    lines.push(
      "",
      `### ${item.category} / ${item.id}`,
      "",
      `- Nombre EN: ${name}`,
      `- Nombre ES: ${es}`,
      `- Estratos: ${item.reasons.join(", ")}`,
      `- Fuente: ${str(item.entry["source"]) ?? "(sin source)"}`,
      "",
      "Campos estructurados:",
      "",
      "```json",
      JSON.stringify(structured, null, 2),
      "```",
      "",
      `Resumen ES${item.summary ? ` (${item.summary.status})` : ""}: ${item.summary?.summaryEs ?? "(sin resumen)"}`,
      "",
      "Texto EN:",
      "",
      ...String(textEn ?? "")
        .split("\n")
        .map((l) => `> ${l}`.trimEnd()),
    );
    if (item.crosscheck) {
      const x = item.crosscheck;
      lines.push(
        "",
        x.similarity === undefined
          ? "Contraste: sin contraste"
          : `Contraste: similitud ${x.similarity.toFixed(2)}${x.suspicious ? " SOSPECHOSA" : ""} (${x.url})`,
      );
    }
    lines.push("", "- [ ] OK  - [ ] Error");
  }
  return lines.join("\n") + "\n";
}

export function sampleFileName(seed: number): string {
  return `srd-sample-${seed}.md`;
}
