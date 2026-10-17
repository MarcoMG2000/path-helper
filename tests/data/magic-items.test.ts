import { describe, expect, it } from "vitest";
import { loadDataset, loadIntegrityContext } from "../../scripts/srd/lib/load-dataset";
import { runIntegrity } from "../../src/data/integrity";
import { getEnhancementEffects, getItemEffects } from "../../src/data/magic-items/effects";
import { mergeProvenance } from "../../src/data/schema/provenance";
import {
  MAGIC_ITEM_KINDS,
  MagicItemSchema,
  MagicSectionsConfigSchema,
  type MagicItem,
} from "../../src/data/schema/magic-item";
import { ROOT } from "../project/helpers";
import golden from "./fixtures/magic-golden.json";

// Datos reales de `magic-items` (Lote M). Los valores de referencia salen del spec (design §14.8,
// `fixtures/magic-golden.json`) y de la propia fuente (AoN, páginas con etiqueta PRPG Core Rulebook).
const { data, issues: loadIssues } = loadDataset(ROOT, [
  "magic-items",
  "weapons",
  "armor",
  "shields",
  "skills",
  "spells",
]);
const items = (data.entries["magic-items"] ?? []).map((e) => MagicItemSchema.parse(e));
const byId = new Map<string, MagicItem>(items.map((i) => [i.id, i]));
const get = (id: string): MagicItem => {
  const item = byId.get(id);
  if (!item) throw new Error(`falta el objeto ${id}`);
  return item;
};
const count = (kind: string): number => items.filter((i) => i.kind === kind).length;
const provenance = mergeProvenance(data.provenanceParts["magic-items"] ?? []);

describe("magic-items reales: recuentos y procedencia (R63, R66, R67)", () => {
  it("R67: el recuento por kind coincide con expectedCountByKind (congelado desde la fuente)", () => {
    for (const [kind, expected] of Object.entries(provenance.expectedCountByKind ?? {})) {
      expect(count(kind), kind).toBe(expected);
    }
    expect(provenance.expectedCountByKind).toEqual(golden.counts);
    expect(provenance.importedKinds).toEqual(Object.keys(golden.counts).sort());
    expect(provenance.license).toBe("OGL-1.0a");
  });

  it("R66: potion, oil y wand (Q11) e intelligent se declaran con expectedCount 0 y motivo, sin entradas", () => {
    const config = MagicSectionsConfigSchema.parse(
      loadIntegrityContext(ROOT).config["magicSections"],
    );
    for (const kind of [...golden.pendingKinds, ...golden.emptyKinds]) {
      const section = config.kinds[kind as keyof typeof config.kinds];
      expect(section.expectedCount, kind).toBe(0);
      expect(section.pending, kind).toBeUndefined();
      expect(section.reason, kind).toBeTruthy();
    }
    for (const kind of golden.pendingKinds) {
      // Q11: decisión por recomendación por defecto, pendiente de ratificación humana.
      expect(config.kinds[kind as keyof typeof config.kinds].reason, kind).toContain("Q11");
    }
    for (const kind of golden.pendingKinds) expect(count(kind), kind).toBe(0);
    for (const kind of golden.emptyKinds) expect(count(kind), kind).toBe(0);
    const kinds = new Set(MAGIC_ITEM_KINDS);
    for (const kind of [
      ...Object.keys(golden.counts),
      ...golden.pendingKinds,
      ...golden.emptyKinds,
    ]) {
      expect(kinds.has(kind as never), kind).toBe(true);
    }
  });

  it("R3/R7/R6: todo es del CRB y apunta a una página de AoN", () => {
    for (const item of items) {
      expect(item.book).toBe("CRB");
      expect(item.sourceRef).toMatch(/^PRPG Core Rulebook pg\. \d+$/);
      expect(item.source).toMatch(/^https:\/\/aonprd\.com\/(Magic\w+Display|Rules)\.aspx\?/);
    }
  });

  it("R86: sourceRefAll y reprintedIn son coherentes con sourceRef", () => {
    for (const item of items) {
      if (item.sourceRefAll !== undefined) {
        expect(item.sourceRefAll).toContain(item.sourceRef);
        expect(item.reprintedIn.length).toBeGreaterThan(0);
        for (const other of item.reprintedIn) expect(item.sourceRefAll).toContain(other);
      } else {
        expect(item.reprintedIn).toEqual([]);
      }
    }
  });

  it("la integridad de magic-items no informa nada (R66 con Q11 declarado como expectedCount 0)", () => {
    const found = runIntegrity(data, loadIntegrityContext(ROOT), { categories: ["magic-items"] });
    expect(loadIssues).toEqual([]);
    expect(found).toEqual([]);
  });
});

describe("goldens del spec (design §14.8)", () => {
  it("R65/R69/R81: Keen y Seeking", () => {
    const keen = get("keen");
    expect(keen).toMatchObject({
      kind: "weapon-ability",
      aura: golden.entries.keen.aura,
      sourceRef: golden.entries.keen.sourceRef,
    });
    expect(keen.variants[0]).toMatchObject({
      bonusEquivalent: 1,
      priceCp: null,
      casterLevel: golden.entries.keen.casterLevel,
    });
    expect(keen).toMatchObject({ legalFor: golden.entries.keen.legalFor });
    expect(keen.reprintedIn.join()).toContain(golden.entries.keen.reprintedInContains);
    // R65: descripción, requisitos y coste de construcción
    expect(keen.textEn).toContain("This ability doubles the threat range of a weapon.");
    expect(keen.textEn).toContain("**Requirements** Craft Magic Arms and Armor");
    expect(keen.construction.requirements).toBe("Craft Magic Arms and Armor, keen edge");

    const seeking = get("seeking");
    expect(seeking.variants[0]).toMatchObject({ bonusEquivalent: 1, casterLevel: 12 });
    expect(seeking).toMatchObject({ legalFor: golden.entries.seeking.legalFor });
  });

  it("R78: Flaming declara 1d6 de fuego siempre", () => {
    expect(get("flaming").variants[0]!.extraDamage).toMatchObject(
      golden.entries.flaming.extraDamage,
    );
  });

  it("R70: Flame Tongue (con la discrepancia del golden anotada)", () => {
    const flameTongue = get("flame-tongue");
    const g = golden.entries["flame-tongue"];
    expect(flameTongue).toMatchObject({
      kind: "specific-weapon",
      baseItemId: g.baseItemId,
      enhancement: g.enhancement,
      abilityIds: g.abilityIds,
    });
    // Discrepancia golden/fuente: el spec dice [flaming, flaming-burst]; la fuente solo «flaming burst».
    expect(g.specAbilityIds).not.toEqual(g.abilityIds);
    expect(flameTongue.textEn).toContain(
      g.discrepancy ? "This is a *+1 flaming burst longsword*." : "",
    );
    expect(flameTongue.variants[0]!.priceRaw).toBe("20,715 gp");
  });

  it("R68/R72/R73: precios y efectos de anillos, capas, cinturones, amuletos y brazales", () => {
    for (const [id, expected] of Object.entries(golden.priced)) {
      const item = get(id);
      expect(Object.fromEntries(item.variants.map((v) => [v.variantId, v.priceCp])), id).toEqual(
        expected.variants,
      );
      for (const variant of item.variants) {
        const effects = getItemEffects(item, variant.variantId)!;
        const bonus = Number(/(\d+)$/.exec(variant.variantId)![1]);
        expect(effects.length).toBeGreaterThan(0);
        for (const effect of effects) {
          expect(effect.value, `${id} ${variant.variantId}`).toBe(bonus);
          expect(effect.type).toBe(expected.effect.bonusType);
          if (expected.effect.target === "save.all") {
            expect(effect.target.startsWith("save.")).toBe(true);
          } else {
            expect(effect.target).toBe(expected.effect.target);
          }
          if ("foldInto" in expected.effect) expect(effect.foldInto).toBe(expected.effect.foldInto);
        }
      }
      if ("formulaCpPerBonusSquared" in expected) {
        for (const variant of item.variants) {
          const bonus = Number(/(\d+)$/.exec(variant.variantId)![1]);
          expect(variant.priceCp).toBe(bonus * bonus * expected.formulaCpPerBonusSquared);
        }
      }
    }
  });

  it("R79: Cloak of Resistance expande save.all en tres efectos por variante", () => {
    const effects = getItemEffects(get("cloak-of-resistance"), "plus-3")!;
    expect(effects.map((e) => [e.target, e.value, e.type])).toEqual([
      ["save.fortitude", 3, "resistance"],
      ["save.reflex", 3, "resistance"],
      ["save.will", 3, "resistance"],
    ]);
    expect(effects.every((e) => e.id.startsWith("magic:cloak-of-resistance:plus-3:"))).toBe(true);
  });

  it("R71: precios de mejora de armadura/escudo (+1 1.000 gp ... +5 25.000 gp) y de arma (+1 2.000 gp ... +5 50.000 gp)", () => {
    for (const [id, prices] of Object.entries(golden.enhancementPrices)) {
      const item = get(id);
      expect(item.kind).toBe("general");
      if (item.kind !== "general") continue;
      expect(item.enhancementPrices?.map((p) => p.priceCp)).toEqual(prices);
      expect(item.enhancementPrices?.map((p) => p.bonus)).toEqual([1, 2, 3, 4, 5]);
    }
  });

  it("R80: la mejora de un objeto específico se deriva con getEnhancementEffects", () => {
    const flameTongue = get("flame-tongue");
    if (flameTongue.kind !== "specific-weapon" || !flameTongue.enhancement) throw new Error("x");
    expect(
      getEnhancementEffects(flameTongue.enhancement.on, flameTongue.enhancement.bonus),
    ).toHaveLength(2);
  });

  it("Q11: las filas genéricas de poción y varita solo existen como tablas de coste de las secciones general", () => {
    expect(get("potions").textEn).toContain(golden.potionAndWand.textContains.potions);
    expect(get("wands").textEn).toContain(golden.potionAndWand.textContains.wands);
  });
});

describe("coherencia de los datos reales", () => {
  it("R70/R82/R84: los objetos específicos con base resuelta apuntan a equipo existente", () => {
    const weapons = new Set((data.entries.weapons ?? []).map((e) => (e as { id: string }).id));
    const armor = new Set((data.entries.armor ?? []).map((e) => (e as { id: string }).id));
    const shields = new Set((data.entries.shields ?? []).map((e) => (e as { id: string }).id));
    for (const item of items) {
      if (item.kind === "specific-weapon" && item.baseItemId)
        expect(weapons.has(item.baseItemId), item.id).toBe(true);
      if (item.kind === "specific-armor" && item.baseItemId)
        expect(armor.has(item.baseItemId), item.id).toBe(true);
      if (item.kind === "specific-shield" && item.baseItemId)
        expect(shields.has(item.baseItemId), item.id).toBe(true);
    }
  });

  it("R85: los bastones enlazan conjuros del CRB existentes", () => {
    const spells = new Set((data.entries.spells ?? []).map((e) => (e as { id: string }).id));
    const staves = items.filter((i) => i.kind === "staff");
    expect(staves).toHaveLength(21);
    for (const staff of staves) {
      if (staff.kind !== "staff") continue;
      expect(staff.spellRefs.length, staff.id).toBeGreaterThan(0);
      for (const ref of staff.spellRefs)
        expect(spells.has(ref.spellId ?? ""), `${staff.id}:${ref.name}`).toBe(true);
    }
  });

  it("R74/R84: los objetivos de habilidad existen en skills", () => {
    const skills = new Set((data.entries.skills ?? []).map((e) => (e as { id: string }).id));
    for (const item of items) {
      for (const variant of item.variants) {
        for (const effect of variant.effects) {
          if (effect.target.startsWith("skill.")) {
            expect(skills.has(effect.target.slice(6)), `${item.id}: ${effect.target}`).toBe(true);
          }
        }
      }
    }
  });

  it("las habilidades que sirven a armadura y escudo existen como dos entradas con alias", () => {
    for (const base of ["energy-resistance", "fortification", "ghost-touch", "spell-resistance"]) {
      expect(get(`${base}-armor`).kind).toBe("armor-ability");
      expect(get(`${base}-shield`).kind).toBe("shield-ability");
    }
    expect(get("ghost-touch-weapon").kind).toBe("weapon-ability");
  });

  it("R59 de los huecos de la fuente: Lens of Detection y Bag of Tricks no tienen entrada", () => {
    expect(byId.has("lens-of-detection")).toBe(false);
    expect(byId.has("bag-of-tricks")).toBe(false);
  });

  it("R28-R33: cada entrada tiene su resumen y su clave de glosario (sin hallazgos de capa ES)", () => {
    const found = runIntegrity(data, loadIntegrityContext(ROOT), { categories: ["magic-items"] });
    expect(found.filter((f) => /^(summaries|glossary)\./.test(f.rule))).toEqual([]);
  });
});
