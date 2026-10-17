import { describe, expect, it } from "vitest";
import {
  ArmorSchema,
  DiceSchema,
  GEAR_CATEGORIES,
  GearSchema,
  ShieldSchema,
  WeaponSchema,
} from "../../../src/data/schema/equipment";

// Schemas de equipo (R2, R3, R24, R25).
const base = {
  textEn: "**Cost** 15 gp **Weight** 4 lbs.",
  source: "https://aonprd.com/EquipmentWeaponsDisplay.aspx?ItemName=Longsword",
  sourceRef: "PRPG Core Rulebook pg. 142",
  book: "CRB" as const,
};
const money = {
  costCp: 1500,
  costRaw: "15 gp",
  weightLb: 4,
  weightRaw: "4 lbs.",
  stats: { Cost: "15 gp" },
};
const weapon = {
  ...base,
  id: "longsword",
  name: "Longsword",
  ...money,
  category: "martial",
  handedness: "oneHanded",
  damage: { small: "1d6", medium: "1d8" },
  critical: { range: 19, multiplier: 2 },
  rangeIncrementFt: null,
  minRangeFt: null,
  damageTypes: ["S"],
  special: [],
  weaponGroups: ["Blades, Heavy"],
};
const defense = {
  maxDex: 1,
  armorCheckPenalty: -6,
  arcaneSpellFailurePct: 35,
  speed30: 20,
  speed20: 15,
};
const armor = {
  ...base,
  id: "full-plate",
  name: "Full plate",
  ...money,
  category: "heavy",
  armorBonus: 9,
  ...defense,
};
const shield = {
  ...base,
  id: "heavy-steel-shield",
  name: "Heavy steel",
  ...money,
  shieldBonus: 2,
  ...defense,
  maxDex: null,
  speed30: null,
  speed20: null,
};
const gear = {
  ...base,
  id: "backpack-common",
  name: "Backpack (common)",
  ...money,
  category: "adventuring-gear",
};

describe("schemas de equipo (R24, R25)", () => {
  it("una entrada válida de cada tipo pasa", () => {
    expect(WeaponSchema.safeParse(weapon).success).toBe(true);
    expect(ArmorSchema.safeParse(armor).success).toBe(true);
    expect(ShieldSchema.safeParse(shield).success).toBe(true);
    expect(GearSchema.safeParse(gear).success).toBe(true);
  });

  it("R3: un libro distinto del CRB se rechaza en las cuatro categorías", () => {
    for (const [schema, entry] of [
      [WeaponSchema, weapon],
      [ArmorSchema, armor],
      [ShieldSchema, shield],
      [GearSchema, gear],
    ] as const) {
      expect(schema.safeParse({ ...entry, book: "APG" }).success).toBe(false);
      expect(schema.safeParse({ ...entry, sourceRef: "Ultimate Equipment pg. 1" }).success).toBe(
        false,
      );
    }
  });

  it("R2/R8: falta de campo común y HTML en textEn se rechazan; campos extra también", () => {
    const noText: Record<string, unknown> = { ...weapon };
    delete noText["textEn"];
    expect(WeaponSchema.safeParse(noText).success).toBe(false);
    expect(WeaponSchema.safeParse({ ...weapon, textEn: "<b>x</b>" }).success).toBe(false);
    expect(WeaponSchema.safeParse({ ...weapon, extra: 1 }).success).toBe(false);
  });

  it("dinero en cp: entero no negativo o null", () => {
    expect(WeaponSchema.safeParse({ ...weapon, costCp: 1.5 }).success).toBe(false);
    expect(WeaponSchema.safeParse({ ...weapon, costCp: -1 }).success).toBe(false);
    expect(WeaponSchema.safeParse({ ...weapon, costCp: null }).success).toBe(true);
    expect(GearSchema.safeParse({ ...gear, weightLb: -2 }).success).toBe(false);
    expect(GearSchema.safeParse({ ...gear, weightLb: 0.5 }).success).toBe(true);
  });

  it("armas: dados, crítico, tipos y categoría", () => {
    for (const ok of ["1d6", "1d8/1d8", "1"]) expect(DiceSchema.safeParse(ok).success).toBe(true);
    for (const bad of ["d6", "1d", "big", ""])
      expect(DiceSchema.safeParse(bad).success).toBe(false);
    expect(
      WeaponSchema.safeParse({ ...weapon, critical: { range: 17, multiplier: 2 } }).success,
    ).toBe(false);
    expect(
      WeaponSchema.safeParse({ ...weapon, critical: { range: 20, multiplier: 5 } }).success,
    ).toBe(false);
    expect(WeaponSchema.safeParse({ ...weapon, damageTypes: ["X"] }).success).toBe(false);
    expect(WeaponSchema.safeParse({ ...weapon, category: "firearm" }).success).toBe(false);
    expect(WeaponSchema.safeParse({ ...weapon, handedness: "floating" }).success).toBe(false);
  });

  it("armaduras y escudos: penalizador <= 0, fallo arcano 0-100, categoría de armadura", () => {
    expect(ArmorSchema.safeParse({ ...armor, armorCheckPenalty: 2 }).success).toBe(false);
    expect(ArmorSchema.safeParse({ ...armor, arcaneSpellFailurePct: 101 }).success).toBe(false);
    expect(ArmorSchema.safeParse({ ...armor, category: "extra" }).success).toBe(false);
    expect(ArmorSchema.safeParse({ ...armor, maxDex: null }).success).toBe(true);
    expect(ShieldSchema.safeParse({ ...shield, shieldBonus: -1 }).success).toBe(false);
    expect(ShieldSchema.safeParse({ ...shield, armorBonus: 2 }).success).toBe(false);
  });

  it("bienes: la categoría es una de las de la fuente (incluye armor-extra)", () => {
    expect(GEAR_CATEGORIES).toContain("armor-extra");
    expect(GearSchema.safeParse({ ...gear, category: "armor-extra" }).success).toBe(true);
    expect(GearSchema.safeParse({ ...gear, category: "weapons" }).success).toBe(false);
  });
});
