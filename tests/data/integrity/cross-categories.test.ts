import { describe, expect, it } from "vitest";
import { loadDataset, loadIntegrityContext } from "../../../scripts/srd/lib/load-dataset";
import { resolveEntryId } from "../../../src/data/integrity";
import { classRefsRule } from "../../../src/data/integrity/class-refs";
import { countsRule } from "../../../src/data/integrity/counts";
import { domainRefsRule } from "../../../src/data/integrity/domain-refs";
import { magicRefsRule } from "../../../src/data/integrity/magic-refs";
import { spellListsRule } from "../../../src/data/integrity/spell-lists";
import type { IntegrityIssue, LoadedDataset } from "../../../src/data/integrity/types";
import { CATEGORY_IDS, type EntryCategory } from "../../../src/data/schema/common";
import { mergeProvenance } from "../../../src/data/schema/provenance";
import { CRB_CLASS_IDS } from "../../../src/data/schema/spell";
import { ROOT } from "../../project/helpers";

// TZ.1: integración final sobre los datos REALES de todas las categorías (R14, R23, R26, R82, R84,
// R85, R92, R98, R99). Cada comprobación se contrasta primero en verde sobre los datos reales y
// después con una copia alterada de esos mismos datos, para demostrar que la regla se evalúa de
// verdad (no solo que "no hay hallazgos").

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- JSON sin tipar
const { data, issues: loadIssues } = loadDataset(ROOT);
const ctx = loadIntegrityContext(ROOT);

const rows = (category: EntryCategory): Row[] => (data.entries[category] ?? []) as Row[];

/** Copia del dataset real con `category` sustituida por el resultado de `change` sobre un clon. */
function withEntries(category: EntryCategory, change: (clone: Row[]) => Row[]): LoadedDataset {
  const clone = structuredClone(rows(category));
  return { ...data, entries: { ...data.entries, [category]: change(clone) } };
}

const rules = (issues: IntegrityIssue[]): string[] => [...new Set(issues.map((i) => i.rule))];

describe("integración: todas las categorías cargadas", () => {
  it("el dataset real carga sin errores de lectura y las 13 categorías tienen procedencia (R39, R42)", () => {
    expect(loadIssues).toEqual([]);
    for (const category of CATEGORY_IDS) {
      expect(data.provenanceParts[category]?.length, category).toBeGreaterThan(0);
      const license = mergeProvenance(data.provenanceParts[category]!).license;
      expect(license, category).toBe("OGL-1.0a");
    }
  });

  it("R26: cada categoría tiene tantas entradas como su expectedCount congelado", () => {
    const expected: Record<string, number> = {};
    for (const category of CATEGORY_IDS) {
      if (category === "spell-lists" || category === "magic-items") continue;
      const prov = mergeProvenance(data.provenanceParts[category]!);
      expect(prov.expectedCount, category).toBeDefined();
      expected[category] = prov.expectedCount!;
      expect(rows(category as EntryCategory).length, category).toBe(prov.expectedCount);
    }
    expect(expected).toMatchObject({
      classes: 7,
      races: 7,
      skills: 35,
      feats: 176,
      spells: 623,
      weapons: 87,
      armor: 12,
      shields: 6,
      gear: 164,
    });
    expect(countsRule(data, ctx)).toEqual([]);
  });

  it("R26: quitar una entrada de una categoría hace fallar la regla nombrándola", () => {
    const broken = withEntries("feats", (feats) => feats.slice(1));
    const found = countsRule(broken, ctx);
    expect(found.map((i) => [i.category, i.rule])).toEqual([["feats", "counts.count"]]);
  });

  it("R26: una categoría con datos sin procedencia falla", () => {
    const provenanceParts = Object.fromEntries(
      Object.entries(data.provenanceParts).filter(([category]) => category !== "skills"),
    );
    const found = countsRule({ ...data, provenanceParts }, ctx);
    expect(found.map((i) => [i.category, i.rule])).toEqual([["skills", "counts.no-provenance"]]);
  });
});

describe("integración: R98 y R99 (conjuros por lotes)", () => {
  const spellsProvenance = mergeProvenance(data.provenanceParts.spells!);

  it("R98: la procedencia de spells es la unión de un fichero por lote más el del índice, todos OGL-1.0a", () => {
    const parts = data.provenanceParts.spells!;
    expect(parts.map((p) => p.file).sort()).toEqual([
      "provenance/spells/a-d.json",
      "provenance/spells/e-k.json",
      "provenance/spells/index.json",
      "provenance/spells/l-r.json",
      "provenance/spells/s-z.json",
    ]);
    for (const part of parts) expect((part.data as Row)["license"], part.file).toBe("OGL-1.0a");
  });

  it("R99: los lotes cubren a-z, la suma de expectedCountByBatch es el total y cada lote cuadra", () => {
    const byBatch = spellsProvenance.expectedCountByBatch!;
    expect(Object.keys(byBatch).sort()).toEqual(["a-d", "e-k", "l-r", "s-z"]);
    expect(Object.values(byBatch).reduce((a, b) => a + b, 0)).toBe(spellsProvenance.expectedCount);
    expect(spellsProvenance.expectedCount).toBe(623);
    expect(countsRule(data, ctx).filter((i) => i.category === "spells")).toEqual([]);
  });

  it("R99: un conjuro de más en un lote falla en el lote y en el total", () => {
    const broken = withEntries("spells", (spells) => [
      ...spells,
      { ...spells[0]!, id: "aaa-extra", name: "Aaa Extra" },
    ]);
    const found = countsRule(broken, ctx);
    expect(rules(found).sort()).toEqual(["counts.batch-count", "counts.count"]);
    expect(found.find((i) => i.rule === "counts.batch-count")?.id).toBe("a-d");
  });

  it("R98: quitar la license de un fichero de lote hace fallar la unión", () => {
    const parts = structuredClone(data.provenanceParts.spells!);
    const target = parts.find((p) => p.file.endsWith("e-k.json"))!;
    delete (target.data as Row)["license"];
    const found = countsRule(
      { ...data, provenanceParts: { ...data.provenanceParts, spells: parts } },
      ctx,
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ category: "spells", rule: "counts.provenance" });
    expect(found[0]!.message).toContain("e-k.json");
  });
});

describe("integración: R14 (class.special-ref) y classSkills contra skills", () => {
  it("R14: cada nombre de la columna special de las 7 clases resuelve a una capacidad de su clase", () => {
    expect(classRefsRule(data, ctx)).toEqual([]);
    const total = rows("classes").flatMap((c) => c.table.flatMap((r: Row) => r.specialIds)).length;
    expect(total).toBeGreaterThan(50);
  });

  it("R14: quitar una capacidad referenciada por una tabla falla nombrando la clase", () => {
    const druid = rows("classes").find((c) => c.id === "druid")!;
    const wanted = druid.table.flatMap((r: Row) => r.specialIds)[0] as string;
    const broken = withEntries("class-features", (f) => f.filter((x) => x.id !== wanted));
    const found = classRefsRule(broken, ctx).filter((i) => i.rule === "class.special-ref");
    expect(found.length).toBeGreaterThan(0);
    expect(found.some((i) => i.id === "druid" && i.message.includes(wanted))).toBe(true);
  });

  it("classSkills -> skills: quitar la habilidad Stealth falla en las clases que la tienen", () => {
    const broken = withEntries("skills", (s) => s.filter((x) => x.id !== "stealth"));
    const found = classRefsRule(broken, ctx).filter((i) => i.rule === "class.skill-ref");
    expect(found.map((i) => i.id)).toContain("rogue");
  });
});

describe("integración: R23 (conjuros de dominio contra spells) y alias de slug", () => {
  const aliases = ctx.slugAliases["spells"] ?? {};
  const spellIds = new Set(rows("spells").map((s) => s.id as string));

  it("R23: cada conjuro de los 33 dominios existe en spells", () => {
    expect(rows("domains")).toHaveLength(33);
    expect(domainRefsRule(data, ctx)).toEqual([]);
    for (const domain of rows("domains")) {
      for (const spell of domain.spells)
        expect(spellIds.has(spell.spellId), spell.spellId).toBe(true);
    }
  });

  it("R4/R23: el spellId de un dominio es el slug (con alias) del nombre literal de la fuente", () => {
    for (const domain of rows("domains")) {
      for (const spell of domain.spells) {
        expect(spell.spellId, `${domain.id} ${spell.name}`).toBe(
          resolveEntryId("spells", spell.name, ctx.slugAliases),
        );
      }
    }
  });

  it("los alias de spells apuntan a conjuros existentes, no chocan con un id real y todos se usan", () => {
    expect(Object.keys(aliases)).toHaveLength(14);
    const used = new Set(
      rows("domains").flatMap((d) =>
        d.spells.map((s: Row) => resolveEntryId("spells", s.name, {})),
      ),
    );
    for (const [slug, id] of Object.entries(aliases)) {
      expect(spellIds.has(id), `${slug} -> ${id}`).toBe(true);
      expect(spellIds.has(slug), `${slug} no debe ser ya un id de spells`).toBe(false);
      expect(used.has(slug), `${slug} lo usa algún dominio`).toBe(true);
    }
  });

  it("R23: sin el alias el conjuro de dominio deja de resolver (el alias es lo que lo resuelve)", () => {
    for (const [slug, id] of Object.entries(aliases)) {
      const names = rows("domains").flatMap((d) => d.spells.filter((s: Row) => s.spellId === id));
      expect(names.length, `${slug} -> ${id}`).toBeGreaterThan(0);
      expect(spellIds.has(slug)).toBe(false);
    }
  });

  it("R23: quitar Teleport, Greater de spells hace fallar el dominio Travel", () => {
    const broken = withEntries("spells", (s) => s.filter((x) => x.id !== "teleport-greater"));
    const found = domainRefsRule(broken, ctx);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ category: "domains", id: "travel", rule: "domain.spell-ref" });
  });
});

describe("integración: R92 (claves de spells[].levels)", () => {
  it("R92: sobre los datos reales todas las claves son del catálogo CRB o dominios", () => {
    const keys = new Set(rows("spells").flatMap((s) => Object.keys(s.levels)));
    for (const key of keys)
      expect((CRB_CLASS_IDS as readonly string[]).includes(key), key).toBe(true);
    expect(spellListsRule(data, ctx).filter((i) => i.rule === "spells.level-key")).toEqual([]);
  });

  it("R92: una clave de otro libro (alchemist) falla nombrando conjuro y clave", () => {
    const broken = withEntries("spells", (s) => {
      s[0]!.levels = { ...s[0]!.levels, alchemist: 1 };
      return s;
    });
    const found = spellListsRule(broken, ctx).filter((i) => i.rule === "spells.level-key");
    expect(found).toHaveLength(1);
    expect(found[0]!.id).toBe(rows("spells")[0]!.id);
    expect(found[0]!.message).toContain("alchemist");
  });

  it("R92: el id de un dominio real es una clave válida y uno inexistente no", () => {
    const withDomain = withEntries("spells", (s) => {
      s[0]!.levels = { ...s[0]!.levels, fire: 1 };
      return s;
    });
    expect(spellListsRule(withDomain, ctx).filter((i) => i.rule === "spells.level-key")).toEqual(
      [],
    );
    const withBogus = withEntries("spells", (s) => {
      s[0]!.levels = { ...s[0]!.levels, "fire-domain": 1 };
      return s;
    });
    expect(
      spellListsRule(withBogus, ctx).filter((i) => i.rule === "spells.level-key"),
    ).toHaveLength(1);
  });
});

describe("integración: magic-items contra weapons, armor, shields, skills y spells (R82, R84, R85)", () => {
  const items = rows("magic-items");

  it("R82/R84/R85: sin hallazgos sobre los datos reales", () => {
    expect(magicRefsRule(data, ctx)).toEqual([]);
  });

  it("R84: un baseItemId inexistente en weapons falla", () => {
    const broken = withEntries("magic-items", (all) => {
      const target = all.find((i) => i.kind === "specific-weapon")!;
      target.baseItemId = "arma-que-no-existe";
      return all;
    });
    const found = magicRefsRule(broken, ctx);
    expect(rules(found)).toEqual(["magic.ref"]);
    expect(found[0]!.message).toContain("arma-que-no-existe");
  });

  it("R84: un objeto específico de escudo o armadura apunta a datos reales de shields y armor", () => {
    for (const [kind, category] of [
      ["specific-armor", "armor"],
      ["specific-shield", "shields"],
    ] as const) {
      const ids = new Set(rows(category).map((r) => r.id as string));
      const specifics = items.filter((i) => i.kind === kind);
      expect(specifics.length, kind).toBeGreaterThan(0);
      for (const item of specifics) {
        // baseItemId null solo se admite en objetos marcados needsReview (objeto base no deducible).
        if (item.baseItemId === null) expect(item.needsReview, item.id).toBe(true);
        else expect(ids.has(item.baseItemId), `${item.id} -> ${item.baseItemId}`).toBe(true);
      }
    }
  });

  it("R84: una habilidad (abilityIds) inexistente falla", () => {
    const broken = withEntries("magic-items", (all) => {
      const target = all.find((i) => i.kind === "specific-weapon" && i.abilityIds.length > 0)!;
      target.abilityIds = ["habilidad-inventada"];
      return all;
    });
    expect(rules(magicRefsRule(broken, ctx))).toContain("magic.ref");
  });

  it("R84: un objetivo skill.<id> inexistente en skills falla", () => {
    const broken = withEntries("magic-items", (all) => {
      for (const item of all) {
        for (const variant of item.variants ?? []) {
          for (const effect of variant.effects) {
            if (effect.target.startsWith("skill.")) {
              effect.target = "skill.habilidad-inventada";
              return all;
            }
          }
        }
      }
      throw new Error("no hay ningún efecto skill.* en los datos reales");
    });
    const found = magicRefsRule(broken, ctx);
    expect(rules(found)).toEqual(["magic.ref"]);
  });

  it("R82: la legalidad se evalúa en cada par (objeto específico, habilidad) de los datos reales", () => {
    const abilityKind = {
      "specific-weapon": "weapon-ability",
      "specific-armor": "armor-ability",
      "specific-shield": "shield-ability",
    } as const;
    const pairs = items.flatMap((item) =>
      item.kind in abilityKind
        ? (item.abilityIds as string[]).map((abilityId) => ({ item, abilityId }))
        : [],
    );
    expect(pairs.map((p) => `${p.item.id}:${p.abilityId}`).sort()).toEqual([
      "flame-tongue:flaming-burst",
      "frost-brand:frost",
      "rapier-of-puncturing:wounding",
    ]);
    for (const { item, abilityId } of pairs) {
      const ability = items.find(
        (i) => i.kind === abilityKind[item.kind as keyof typeof abilityKind] && i.id === abilityId,
      );
      expect(ability?.legalFor, abilityId).toBeDefined();
    }
  });

  it("R82: Keen (arma cuerpo a cuerpo con daño cortante/perforante) sobre un arco o una maza falla", () => {
    const abilities = new Map(
      items.filter((i) => i.kind === "weapon-ability").map((i) => [i.id, i]),
    );
    const legalKinds = [...abilities.values()].filter((a) => a.legalFor);
    expect(legalKinds.length).toBeGreaterThan(5);
    const weapons = rows("weapons");
    const bow = weapons.find((w) => w.id === "longbow")!;
    expect(bow).toBeDefined();
    const candidates = items.filter(
      (i) =>
        i.kind === "specific-weapon" &&
        i.abilityIds.some((id: string) => abilities.get(id)?.legalFor?.range === "melee"),
    );
    expect(candidates.length).toBeGreaterThan(0);
    const broken = withEntries("magic-items", (all) => {
      const target = all.find((i) => i.id === candidates[0]!.id)!;
      target.baseItemId = "longbow";
      return all;
    });
    const found = magicRefsRule(broken, ctx).filter((i) => i.rule === "magic.legal");
    expect(found).toHaveLength(1);
    expect(found[0]!.id).toBe(candidates[0]!.id);
    expect(found[0]!.message).toContain("longbow");
  });

  it("R85: un spellRefs con spellId inexistente, o null con un conjuro del CRB, falla", () => {
    const withRefs = items.filter((i) => (i.spellRefs ?? []).length > 0);
    expect(withRefs.length).toBeGreaterThan(0);
    const target = withRefs.find((i) =>
      i.spellRefs.some((r: Row) => typeof r.spellId === "string"),
    )!;
    const brokenId = withEntries("magic-items", (all) => {
      const item = all.find((i) => i.id === target.id)!;
      item.spellRefs[0].spellId = "conjuro-inventado";
      return all;
    });
    expect(magicRefsRule(brokenId, ctx).map((i) => i.rule)).toEqual(["magic.spell"]);

    const brokenNull = withEntries("magic-items", (all) => {
      const item = all.find((i) => i.id === target.id)!;
      item.spellRefs[0].spellId = null;
      return all;
    });
    const found = magicRefsRule(brokenNull, ctx);
    expect(found.map((i) => i.rule)).toEqual(["magic.spell"]);
    expect(found[0]!.message).toContain("spellId es null");
  });
});
