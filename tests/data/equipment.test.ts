import { describe, expect, it } from "vitest";
import {
  parseCostCp,
  parseDefenseStats,
  parseWeaponStats,
  parseWeightLb,
} from "../../scripts/srd/parsers/equipment-common";
import { loadDataset, loadIntegrityContext } from "../../scripts/srd/lib/load-dataset";
import { runIntegrity } from "../../src/data/integrity";
import {
  ArmorSchema,
  GearSchema,
  ShieldSchema,
  WeaponSchema,
  type Armor,
  type Shield,
} from "../../src/data/schema/equipment";
import { mergeProvenance } from "../../src/data/schema/provenance";
import { ROOT } from "../project/helpers";

// Datos reales de equipo (Lote E, R24-R27). Los goldens salen de design.md §5 y se comprueban contra
// lo importado de AoN (la fuente manda: una discrepancia se anota, no se corrige aquí).
const CATS = ["weapons", "armor", "shields", "gear"] as const;
const { data, issues: loadIssues } = loadDataset(ROOT, [...CATS]);
const weapons = (data.entries.weapons ?? []).map((e) => WeaponSchema.parse(e));
const armors = (data.entries.armor ?? []).map((e) => ArmorSchema.parse(e));
const shields = (data.entries.shields ?? []).map((e) => ShieldSchema.parse(e));
const gears = (data.entries.gear ?? []).map((e) => GearSchema.parse(e));
const pick = <T extends { id: string }>(list: T[], id: string): T => {
  const e = list.find((x) => x.id === id);
  if (!e) throw new Error(`falta ${id}`);
  return e;
};
const expected = (cat: (typeof CATS)[number]): number | undefined =>
  mergeProvenance(data.provenanceParts[cat] ?? []).expectedCount;

describe("equipo real: recuentos y procedencia (R24-R27)", () => {
  it("R26: cada categoría coincide con el expectedCount congelado", () => {
    expect(expected("weapons")).toBe(87);
    expect(expected("armor")).toBe(12);
    expect(expected("shields")).toBe(6);
    expect(expected("gear")).toBe(164);
    expect(weapons).toHaveLength(87);
    expect(armors).toHaveLength(12);
    expect(shields).toHaveLength(6);
    expect(gears).toHaveLength(164);
    for (const cat of CATS) {
      expect(mergeProvenance(data.provenanceParts[cat] ?? []).license).toBe("OGL-1.0a");
    }
  });

  it("R27/R3/R7/R6: todo es del CRB y apunta a una página de AoN", () => {
    for (const e of [...weapons, ...armors, ...shields, ...gears]) {
      expect(e.book).toBe("CRB");
      expect(e.sourceRef).toMatch(/^PRPG Core Rulebook pg\. \d+$/);
      expect(e.source).toMatch(
        /^https:\/\/aonprd\.com\/Equipment(Weapons|Armor|Misc)Display\.aspx\?ItemName=/,
      );
    }
  });

  it("R2-R8, R28-R30, R33, R4/R5: la integridad de las cuatro categorías no tiene hallazgos", () => {
    const found = runIntegrity(data, loadIntegrityContext(ROOT), { categories: [...CATS] });
    expect([...loadIssues, ...found]).toEqual([]);
  });

  it("R26: el universo de AoN (Armor [21]) se reparte en armaduras, escudos y complementos", () => {
    const extras = gears.filter((g) => g.category === "armor-extra");
    expect(armors.length + shields.length + extras.length).toBe(21);
    expect(extras.map((g) => g.id).sort()).toEqual([
      "armor-spikes",
      "locked-gauntlet",
      "shield-spikes",
    ]);
    expect(gears.length - extras.length).toBe(161); // «Equipment (Misc.) [161]»
  });

  it("R24: los 6 escudos y las 12 armaduras por categoría", () => {
    expect(shields.map((s) => s.id).sort()).toEqual([
      "buckler",
      "heavy-steel-shield",
      "heavy-wooden-shield",
      "light-steel-shield",
      "light-wooden-shield",
      "tower-shield",
    ]);
    const count = (c: Armor["category"]): number => armors.filter((a) => a.category === c).length;
    expect([count("light"), count("medium"), count("heavy")]).toEqual([4, 4, 4]);
  });
});

describe("equipo real: goldens (design.md §5)", () => {
  it("Longsword: 15 gp, 1d6/1d8, 19-20/x2, 4 lb, S", () => {
    expect(pick(weapons, "longsword")).toMatchObject({
      costCp: 1500,
      damage: { small: "1d6", medium: "1d8" },
      critical: { range: 19, multiplier: 2 },
      weightLb: 4,
      damageTypes: ["S"],
    });
  });
  it("Dagger: 2 gp, 1d3/1d4, 19-20/x2, 10 ft, 1 lb, P o S", () => {
    expect(pick(weapons, "dagger")).toMatchObject({
      costCp: 200,
      damage: { small: "1d3", medium: "1d4" },
      critical: { range: 19, multiplier: 2 },
      rangeIncrementFt: 10,
      weightLb: 1,
      damageTypes: ["P", "S"],
    });
  });
  it("Full plate: 1.500 gp, +9, Des máx +1, ACP -6, ASF 35 %, 50 lb", () => {
    expect(pick(armors, "full-plate")).toMatchObject({
      category: "heavy",
      costCp: 150000,
      armorBonus: 9,
      maxDex: 1,
      armorCheckPenalty: -6,
      arcaneSpellFailurePct: 35,
      weightLb: 50,
    });
  });
  it("Heavy steel shield: +2, ACP -2, ASF 15 %, 15 lb", () => {
    expect(pick(shields, "heavy-steel-shield")).toMatchObject({
      name: "Heavy steel",
      shieldBonus: 2,
      armorCheckPenalty: -2,
      arcaneSpellFailurePct: 15,
      weightLb: 15,
    });
  });
  it("Chainmail: valores de la tabla de la fuente (+6, Des máx +2, ACP -5)", () => {
    expect(pick(armors, "chainmail")).toMatchObject({
      category: "medium",
      armorBonus: 6,
      maxDex: 2,
      armorCheckPenalty: -5,
    });
  });
});

describe("equipo real: coherencia entre literal y estructura (R24, R25)", () => {
  it("costCp, weightLb y los campos de armas/armaduras se derivan de su literal", () => {
    for (const e of [...weapons, ...armors, ...shields, ...gears]) {
      expect(e.costCp, e.id).toBe(parseCostCp(e.costRaw));
      expect(e.weightLb, e.id).toBe(parseWeightLb(e.weightRaw));
    }
    for (const w of weapons) {
      const s = parseWeaponStats(w.stats);
      expect(w, w.id).toMatchObject({
        category: s.category,
        handedness: s.handedness,
        damage: s.damage,
        critical: s.critical,
        rangeIncrementFt: s.rangeIncrementFt,
        minRangeFt: s.minRangeFt,
        damageTypes: s.damageTypes,
        special: s.special,
        weaponGroups: s.weaponGroups,
      });
    }
    for (const a of [...armors, ...shields] as (Armor | Shield)[]) {
      const d = parseDefenseStats(a.stats);
      expect(a, a.id).toMatchObject({
        maxDex: d.maxDex,
        armorCheckPenalty: d.armorCheckPenalty,
        arcaneSpellFailurePct: d.arcaneSpellFailurePct,
        speed30: d.speed30,
        speed20: d.speed20,
      });
      expect("shieldBonus" in a ? a.shieldBonus : a.armorBonus, a.id).toBe(d.bonus);
    }
  });

  it("los complementos de armadura guardan el peso como sumando; el coste también salvo el guantelete cerrado", () => {
    for (const g of gears.filter((x) => x.category === "armor-extra")) {
      // PRD (Table: Armor and Shields, Extras): «Armor spikes | +50 gp | ... | +10 lbs.»,
      // «Gauntlet, locked | 8 gp | ... | +5 lbs.», «Shield spikes | +10 gp | ... | +5 lbs.»
      expect(g.costRaw).toMatch(g.id === "locked-gauntlet" ? /^8 gp$/ : /^\+\d+ gp$/);
      expect(g.weightRaw).toMatch(/^\+\d+ lbs\.$/);
    }
  });

  it("armas especiales: munición sin daño, máquinas de asedio con categoría propia", () => {
    const ammo = weapons.filter((w) => w.category === "ammunition");
    expect(ammo.length).toBeGreaterThan(0);
    for (const w of ammo) expect(w.damage, w.id).toBeNull();
    const siege = weapons.filter((w) => w.category === "siege").map((w) => w.id);
    expect(siege.sort()).toEqual([
      "ballista-light",
      "catapult-heavy",
      "catapult-light",
      "ram-large",
      "siege-tower-large",
    ]);
    expect(pick(weapons, "gnome-hooked-hammer").critical).toEqual({
      range: 20,
      multiplier: 3,
      secondaryMultiplier: 4,
    });
  });

  it("R25: bienes de varias variantes toman coste y peso de su fila (p. ej. caballos)", () => {
    // PRD (Mounts and Related Gear): «Horse, heavy | 200 gp | —»: el CRB no da peso a los animales
    // (los pesos de AoN son del Bestiario; corrección B).
    expect(pick(gears, "horse-heavy")).toMatchObject({ costCp: 20000, weightLb: null });
    expect(pick(gears, "horse-light-combat-trained")).toMatchObject({
      costCp: 11000,
      weightLb: null,
    });
    expect(pick(gears, "backpack-common")).toMatchObject({ costCp: 200, weightLb: 2 });
    expect(pick(gears, "flask")).toMatchObject({ costCp: 3, weightLb: 1.5 });
  });

  it("R8: el texto no contiene HTML ni la nota editorial de AoN", () => {
    for (const e of [...weapons, ...armors, ...shields, ...gears]) {
      expect(e.textEn, e.id).not.toMatch(/<[a-z/]/i);
      expect(e.textEn, e.id).not.toContain("From Nethys");
    }
  });
});

describe("equipo real: contrato con el Lote A (competencias con armas)", () => {
  it("todos los ids de armas de classes.proficiencies.weapons existen en weapons", () => {
    const { data: classes } = loadDataset(ROOT, ["classes"]);
    const ids = new Set(weapons.map((w) => w.id));
    const generic = new Set(["simple", "martial", "deity-favored-weapon"]);
    const missing: string[] = [];
    for (const raw of classes.entries.classes ?? []) {
      const c = raw as { id: string; proficiencies: { weapons: string[] } };
      for (const w of c.proficiencies.weapons) {
        if (!generic.has(w) && !ids.has(w)) missing.push(`${c.id}:${w}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
