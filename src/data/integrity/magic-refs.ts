import { evidenceContainsDice, evidenceContainsValue } from "../magic-items/evidence";
import { slugify, type EntryCategory } from "../schema/common";
import {
  MAGIC_ITEM_KINDS,
  MAX_EFFECTIVE_BONUS,
  MAX_ENHANCEMENT_BONUS,
  MagicSectionsConfigSchema,
  type MagicItem,
  type MagicItemKind,
} from "../schema/magic-item";
import { isRecord, provenanceOf, validEntries } from "./helpers";
import type { IntegrityContext, IntegrityIssue, IntegrityRule, LoadedDataset } from "./types";

// Reglas de objetos mágicos (Lote M, design §14.6): R66 y R67 (cobertura y recuentos por `kind`),
// R75 (evidencias), R82 (legalidad de las habilidades de un objeto específico), R83 (topes), R84
// (referencias) y R85 (conjuros). R70, R73, R74 y R76-R81 son del schema. Las reglas de referencia
// a otras categorías solo comprueban las categorías cargadas y completas (una categoría en curso
// de importación no produce falsos fallos; el cruce definitivo es TZ.1).

const CATEGORY = "magic-items" as const;
const issue = (id: string | undefined, rule: string, message: string): IntegrityIssue => ({
  category: CATEGORY,
  id,
  rule,
  message,
});

/** Categoría cargada y, si tiene procedencia con recuento, con todas sus entradas. */
function usable(data: LoadedDataset, category: EntryCategory): readonly unknown[] | undefined {
  const entries = data.entries[category];
  if (!entries) return undefined;
  const provenance = provenanceOf(data, category);
  const expected = provenance?.value?.expectedCount;
  if (expected !== undefined && expected !== entries.length) return undefined;
  return entries;
}

function idsOf(entries: readonly unknown[] | undefined): Set<string> | undefined {
  if (!entries) return undefined;
  const ids = new Set<string>();
  for (const raw of entries) {
    if (isRecord(raw) && typeof raw["id"] === "string") ids.add(raw["id"]);
  }
  return ids;
}

function rawEntries(data: LoadedDataset): readonly Record<string, unknown>[] {
  return (data.entries[CATEGORY] ?? []).filter(isRecord);
}

// --- R66 y R67 ----------------------------------------------------------------------------------

function coverage(data: LoadedDataset, ctx: IntegrityContext): IntegrityIssue[] {
  const out: IntegrityIssue[] = [];
  const provenance = provenanceOf(data, CATEGORY);
  const entries = rawEntries(data);
  if (!provenance) return out; // sin procedencia no hay recuentos que comprobar (TZ.1 exige la procedencia)

  const config = MagicSectionsConfigSchema.safeParse(ctx.config["magicSections"]);
  if (!config.success) {
    const first = config.error.issues[0];
    out.push(
      issue(
        undefined,
        "magic.config",
        `magic-sections.json no es válido: ${first?.path.join(".") || "(raíz)"}: ${first?.message ?? "inválido"}`,
      ),
    );
    return out;
  }
  if (provenance?.error) {
    out.push(issue(undefined, "magic.provenance", provenance.error));
    return out;
  }
  const imported = new Set(provenance?.value?.importedKinds ?? []);
  const expected = provenance?.value?.expectedCountByKind ?? {};
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const kind = typeof entry["kind"] === "string" ? entry["kind"] : "?";
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }

  for (const kind of MAGIC_ITEM_KINDS) {
    const section = config.data.kinds[kind];
    const count = counts.get(kind) ?? 0;
    if (section.expectedCount === 0) {
      if (count > 0) {
        out.push(
          issue(
            undefined,
            "magic.sections-complete",
            `${kind}: declarada con expectedCount 0 pero hay ${count} entradas`,
          ),
        );
      }
      continue;
    }
    if (!imported.has(kind) || count === 0) {
      const why = section.pending ? ` (pendiente: ${section.pending})` : "";
      out.push(
        issue(
          undefined,
          "magic.sections-complete",
          `${kind}: sección del capítulo 15 sin entradas importadas y sin expectedCount 0 con motivo${why}`,
        ),
      );
    }
  }

  // R67: solo los `kind` ya importados.
  for (const kind of imported) {
    const want = expected[kind];
    const have = counts.get(kind) ?? 0;
    if (want === undefined) {
      out.push(
        issue(
          undefined,
          "magic.count",
          `${kind}: falta expectedCountByKind en la procedencia (R67)`,
        ),
      );
    } else if (want !== have) {
      out.push(
        issue(
          undefined,
          "magic.count",
          `${kind}: ${have} entradas importadas pero expectedCountByKind es ${want} (R67)`,
        ),
      );
    }
  }
  return out;
}

// --- R75 ----------------------------------------------------------------------------------------

function evidence(items: readonly MagicItem[]): IntegrityIssue[] {
  const out: IntegrityIssue[] = [];
  for (const item of items) {
    for (const variant of item.variants) {
      variant.effects.forEach((effect, index) => {
        const where = `${variant.variantId}.effects[${index}]`;
        if (!item.textEn.includes(effect.evidence)) {
          out.push(
            issue(
              item.id,
              "magic.evidence",
              `${where}: la evidencia no es subcadena literal de textEn`,
            ),
          );
        } else if (!evidenceContainsValue(effect.evidence, effect.value)) {
          out.push(
            issue(
              item.id,
              "magic.evidence",
              `${where}: la evidencia no contiene el valor ${Math.abs(effect.value)}`,
            ),
          );
        }
      });
      variant.extraDamage.forEach((damage, index) => {
        const where = `${variant.variantId}.extraDamage[${index}]`;
        if (!item.textEn.includes(damage.evidence)) {
          out.push(
            issue(
              item.id,
              "magic.evidence",
              `${where}: la evidencia no es subcadena literal de textEn`,
            ),
          );
        } else if (!evidenceContainsDice(damage.evidence, damage.dice)) {
          out.push(
            issue(
              item.id,
              "magic.evidence",
              `${where}: la evidencia no contiene los dados ${damage.dice}`,
            ),
          );
        }
      });
    }
  }
  return out;
}

// --- R82, R83, R84, R85 ---------------------------------------------------------------------------

const ABILITY_KIND: Readonly<Record<string, MagicItemKind>> = {
  "specific-weapon": "weapon-ability",
  "specific-armor": "armor-ability",
  "specific-shield": "shield-ability",
};
const BASE_CATEGORY: Readonly<Record<string, EntryCategory>> = {
  "specific-weapon": "weapons",
  "specific-armor": "armor",
  "specific-shield": "shields",
};

function recordById(entries: readonly unknown[] | undefined): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const raw of entries ?? []) {
    if (isRecord(raw) && typeof raw["id"] === "string") map.set(raw["id"], raw);
  }
  return map;
}

/** Arma cuerpo a cuerpo si `handedness !== "ranged"`; a distancia si `ranged` o con `rangeIncrementFt` (design §14.5). */
function weaponReach(weapon: Record<string, unknown>): { melee: boolean; ranged: boolean } {
  const ranged =
    weapon["handedness"] === "ranged" || typeof weapon["rangeIncrementFt"] === "number";
  return { melee: weapon["handedness"] !== "ranged", ranged };
}

function legalityIssues(
  item: Record<string, unknown>,
  ability: Record<string, unknown>,
  base: Record<string, unknown>,
): string | undefined {
  const legalFor = ability["legalFor"];
  if (!isRecord(legalFor)) return undefined;
  if (item["kind"] === "specific-weapon") {
    const reach = weaponReach(base);
    const range = legalFor["range"];
    if (range === "melee" && !reach.melee) return "la habilidad exige arma cuerpo a cuerpo";
    if (range === "ranged" && !reach.ranged) return "la habilidad exige arma a distancia";
    const types = legalFor["damageTypes"];
    const baseTypes = base["damageTypes"];
    if (
      Array.isArray(types) &&
      Array.isArray(baseTypes) &&
      !types.some((t) => baseTypes.includes(t))
    ) {
      return `la habilidad exige daño ${types.join("/")} y el arma hace ${baseTypes.join("/")}`;
    }
    const weaponIds = legalFor["weaponIds"];
    if (
      Array.isArray(weaponIds) &&
      typeof base["id"] === "string" &&
      !weaponIds.includes(base["id"])
    ) {
      return "la habilidad no admite esta arma";
    }
    return undefined;
  }
  const categories = legalFor["categories"];
  const category = base["category"];
  if (Array.isArray(categories) && typeof category === "string" && !categories.includes(category)) {
    return `la habilidad solo admite ${categories.join("/")} y el objeto base es ${category}`;
  }
  return undefined;
}

function references(data: LoadedDataset): IntegrityIssue[] {
  const out: IntegrityIssue[] = [];
  const raw = rawEntries(data);
  const byKindName = new Map<string, Map<string, Record<string, unknown>>>();
  for (const entry of raw) {
    if (typeof entry["kind"] !== "string" || typeof entry["id"] !== "string") continue;
    const map = byKindName.get(entry["kind"]) ?? new Map<string, Record<string, unknown>>();
    map.set(entry["id"], entry);
    byKindName.set(entry["kind"], map);
  }
  const bases: Partial<Record<EntryCategory, Map<string, Record<string, unknown>>>> = {};
  for (const category of ["weapons", "armor", "shields"] as const) {
    const entries = usable(data, category);
    if (entries) bases[category] = recordById(entries);
  }
  const skills = idsOf(usable(data, "skills"));
  const spells = idsOf(usable(data, "spells"));

  for (const entry of raw) {
    const id = typeof entry["id"] === "string" ? entry["id"] : undefined;
    const kind = typeof entry["kind"] === "string" ? entry["kind"] : "";

    // R83: topes de mejora y de bonificador efectivo.
    const enhancement = entry["enhancement"];
    if (isRecord(enhancement) && typeof enhancement["bonus"] === "number") {
      if (enhancement["bonus"] > MAX_ENHANCEMENT_BONUS) {
        out.push(
          issue(
            id,
            "magic.cap",
            `mejora +${enhancement["bonus"]} por encima del máximo +${MAX_ENHANCEMENT_BONUS} del CRB (R83)`,
          ),
        );
      }
    }

    // R84 + R82 sobre objetos específicos.
    const abilityKind = ABILITY_KIND[kind];
    if (abilityKind !== undefined) {
      const abilities = Array.isArray(entry["abilityIds"])
        ? (entry["abilityIds"] as unknown[])
        : [];
      let effective =
        isRecord(enhancement) && typeof enhancement["bonus"] === "number"
          ? enhancement["bonus"]
          : 0;
      for (const abilityId of abilities) {
        if (typeof abilityId !== "string") continue;
        const ability = byKindName.get(abilityKind)?.get(abilityId);
        if (!ability) {
          out.push(
            issue(
              id,
              "magic.ref",
              `abilityIds: "${abilityId}" no existe como ${abilityKind} (R84)`,
            ),
          );
          continue;
        }
        const variants = Array.isArray(ability["variants"]) ? ability["variants"] : [];
        const equivalents = variants
          .map((v) =>
            isRecord(v) && typeof v["bonusEquivalent"] === "number"
              ? v["bonusEquivalent"]
              : undefined,
          )
          .filter((n): n is number => n !== undefined);
        if (equivalents.length > 0) effective += Math.min(...equivalents); // mínimo: sin falsos fallos
        const baseId = typeof entry["baseItemId"] === "string" ? entry["baseItemId"] : undefined;
        const base = baseId === undefined ? undefined : bases[BASE_CATEGORY[kind]!]?.get(baseId);
        if (base) {
          const problem = legalityIssues(entry, ability, base);
          if (problem) {
            out.push(
              issue(
                id,
                "magic.legal",
                `${abilityId} no es legal sobre ${baseId}: ${problem} (R82)`,
              ),
            );
          }
        }
      }
      if (effective > MAX_EFFECTIVE_BONUS) {
        out.push(
          issue(
            id,
            "magic.cap",
            `bonificador efectivo +${effective} por encima del máximo +${MAX_EFFECTIVE_BONUS} del CRB (R83)`,
          ),
        );
      }
      const baseId = entry["baseItemId"];
      const baseCategory = BASE_CATEGORY[kind]!;
      if (typeof baseId === "string" && bases[baseCategory] && !bases[baseCategory]!.has(baseId)) {
        out.push(
          issue(id, "magic.ref", `baseItemId "${baseId}" no existe en ${baseCategory} (R84)`),
        );
      }
    }

    // R84: `functionsAs` apunta a habilidades de arma existentes (y no a sí misma).
    const functionsAs = Array.isArray(entry["functionsAs"]) ? entry["functionsAs"] : [];
    for (const target of functionsAs) {
      if (typeof target !== "string") continue;
      if (target === id || !byKindName.get("weapon-ability")?.has(target)) {
        out.push(
          issue(id, "magic.ref", `functionsAs: "${target}" no existe como weapon-ability (R84)`),
        );
      }
    }

    // R78: un critMultiplier ×3/×4 debe estar respaldado por el texto de la entrada.
    const textEn = typeof entry["textEn"] === "string" ? entry["textEn"] : "";
    const variants = Array.isArray(entry["variants"]) ? entry["variants"] : [];
    for (const variant of variants) {
      const extra =
        isRecord(variant) && Array.isArray(variant["extraDamage"]) ? variant["extraDamage"] : [];
      for (const damage of extra) {
        const multiplier = isRecord(damage) ? damage["critMultiplier"] : undefined;
        if (
          typeof multiplier === "number" &&
          multiplier > 2 &&
          !textEn.includes(`×${multiplier}`)
        ) {
          out.push(
            issue(
              id,
              "magic.evidence",
              `extraDamage: critMultiplier ×${multiplier} sin "×${multiplier}" en textEn (R78)`,
            ),
          );
        }
      }
    }

    // R84: objetivos `skill.<id>`.
    for (const variant of variants) {
      const effects =
        isRecord(variant) && Array.isArray(variant["effects"]) ? variant["effects"] : [];
      for (const effect of effects) {
        const target = isRecord(effect) ? effect["target"] : undefined;
        if (typeof target === "string" && target.startsWith("skill.") && skills) {
          if (!skills.has(target.slice("skill.".length))) {
            out.push(issue(id, "magic.ref", `el objetivo "${target}" no existe en skills (R84)`));
          }
        }
      }
    }

    // R85: conjuros de pociones, aceites, varitas y bastones.
    const refs = Array.isArray(entry["spellRefs"]) ? entry["spellRefs"] : [];
    for (const ref of refs) {
      if (!isRecord(ref) || typeof ref["name"] !== "string" || !spells) continue;
      const spellId = ref["spellId"];
      if (typeof spellId === "string" && !spells.has(spellId)) {
        out.push(
          issue(id, "magic.spell", `spellRefs: spellId "${spellId}" no existe en spells (R85)`),
        );
      } else if (spellId === null && spells.has(slugify(ref["name"]))) {
        out.push(
          issue(
            id,
            "magic.spell",
            `spellRefs: "${ref["name"]}" es un conjuro del CRB y spellId es null (R85)`,
          ),
        );
      }
    }
  }
  return out;
}

export const magicRefsRule: IntegrityRule = (data, ctx) => {
  const issues: IntegrityIssue[] = [];
  issues.push(...coverage(data, ctx));
  issues.push(...evidence(validEntries(data, CATEGORY, ctx) as readonly MagicItem[]));
  issues.push(...references(data));
  return issues;
};
