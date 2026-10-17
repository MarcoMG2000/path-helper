import { describe, expect, it } from "vitest";
import {
  armorClass,
  type ArmorClassInput,
  type ArmorClassResult,
  type MaxDexCap,
} from "../../src/rules/armor-class";
import type { Modifier, ModifierType, Size } from "../../src/rules/types";

// Fixtures [F] de equipo del Core (CRB Table: Armor and Shields; el dato oficial vive en f3):
//   Full plate +9 / Des máx. +1 / ACP -6; Chainmail +6 / +2 / -5 (SRD: +6, el spec decía +5);
//   Leather +2 / +6 / 0; Studded leather +3 / +5 / -1; Heavy steel shield +2 / - / -2.
const mod = (id: string, name: string, type: ModifierType, value: number): Modifier => ({
  id,
  name,
  type,
  value,
});
const fullPlate = mod("armor:fullPlate", "Full plate", "armor", 9);
const fullPlateCap: MaxDexCap = { id: "armor:fullPlate", name: "Full plate", value: 1 };
const chainmail = mod("armor:chainmail", "Chainmail", "armor", 6);
const chainmailCap: MaxDexCap = { id: "armor:chainmail", name: "Chainmail", value: 2 };
const leather = mod("armor:leather", "Leather", "armor", 2);
const leatherCap: MaxDexCap = { id: "armor:leather", name: "Leather", value: 6 };
const heavyShield = mod("shield:heavySteel", "Heavy steel shield", "shield", 2);

function ac(input: ArmorClassInput): ArmorClassResult {
  const r = armorClass(input);
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
}

function totals(r: ArmorClassResult): [number, number, number, number] {
  return [r.normal.total, r.touch.total, r.flatFooted.total, r.flatFootedTouch.total];
}

describe("armorClass - casos A1-A10 (CRB: AC = 10 + armor + shield + Dex + size + natural + deflection + dodge + otros)", () => {
  it("R34: devuelve las cuatro variantes", () => {
    const r = ac({ size: "medium", dexModifier: 0 });
    expect(Object.keys(r).sort()).toEqual(["flatFooted", "flatFootedTouch", "normal", "touch"]);
    expect(r.normal.stat).toBe("ac.normal");
    expect(r.flatFootedTouch.stat).toBe("ac.flatFootedTouch");
  });

  it("R35/R36/R37/R39/R40/A1: Medio, Des +2, armadura completa (máx. +1), escudo pesado -> 22/11/21/10", () => {
    const r = ac({
      size: "medium",
      dexModifier: 2,
      maxDexCaps: [fullPlateCap],
      modifiers: [fullPlate, heavyShield],
    });
    expect(totals(r)).toEqual([22, 11, 21, 10]);
  });

  it("R35/R36/R37/R43/A2: A1 + desvío +2 + esquiva +1 -> 25/14/23/12", () => {
    const r = ac({
      size: "medium",
      dexModifier: 2,
      maxDexCaps: [fullPlateCap],
      modifiers: [
        fullPlate,
        heavyShield,
        mod("ring:protection", "Ring of protection +2", "deflection", 2),
        mod("feat:dodge", "Dodge", "dodge", 1),
      ],
    });
    expect(totals(r)).toEqual([25, 14, 23, 12]);
  });

  it("R35/R38/A3: Pequeño (+1), Des -1, cuero +2 (máx. +6) -> 12/10/12/10", () => {
    const r = ac({
      size: "small",
      dexModifier: -1,
      maxDexCaps: [leatherCap],
      modifiers: [leather],
    });
    expect(totals(r)).toEqual([12, 10, 12, 10]);
  });

  it("R40/A4: Medio, Des +4, cota de mallas +6 (máx. +2) -> 18/12/16/10 con Des limitado a +2", () => {
    const r = ac({
      size: "medium",
      dexModifier: 4,
      maxDexCaps: [chainmailCap],
      modifiers: [chainmail],
    });
    expect(totals(r)).toEqual([18, 12, 16, 10]);
    expect(r.normal.lines.find((l) => l.id === "ac.dex")).toMatchObject({
      value: 2,
      adjustment: { reason: "maxDex", originalValue: 4, cappedBy: "armor:chainmail" },
    });
  });

  it("R40/A5: A4 + carga pesada (máx. +1) -> se aplica el menor: 17/11/16/10, cappedBy = carga", () => {
    // CRB Carrying Capacity, Table 7-5: carga pesada Máx. Des +1; "use the worse figure".
    const r = ac({
      size: "medium",
      dexModifier: 4,
      maxDexCaps: [chainmailCap, { id: "load:heavy", name: "Heavy load", value: 1 }],
      modifiers: [chainmail],
    });
    expect(totals(r)).toEqual([17, 11, 16, 10]);
    expect(r.normal.lines.find((l) => l.id === "ac.dex")?.adjustment?.cappedBy).toBe("load:heavy");
  });

  it("R35/R36/R37/A6: Grande (-1), Des +1, armadura natural +3 -> 13/10/12/9", () => {
    const r = ac({
      size: "large",
      dexModifier: 1,
      modifiers: [mod("natural", "Natural armor", "naturalArmor", 3)],
    });
    expect(totals(r)).toEqual([13, 10, 12, 9]);
  });

  it("R35/A7: Medio, Des 0, sin modificadores -> 10/10/10/10", () => {
    expect(totals(ac({ size: "medium", dexModifier: 0 }))).toEqual([10, 10, 10, 10]);
  });

  it("R43/A8: natural +2 y natural +4 no apilan (cuenta +4) -> 16/12/14/10", () => {
    const r = ac({
      size: "medium",
      dexModifier: 2,
      modifiers: [
        mod("n1", "Natural armor", "naturalArmor", 2),
        mod("n2", "Amulet of natural armor +4", "naturalArmor", 4),
      ],
    });
    expect(totals(r)).toEqual([16, 12, 14, 10]);
    expect(r.normal.lines.find((l) => l.id === "n1")?.status).toBe("suppressed");
  });

  it("R37/R43/A9: esquiva +1 y +1 se apilan y se pierden sin Des -> 14/14/10/10", () => {
    const r = ac({
      size: "medium",
      dexModifier: 2,
      modifiers: [mod("d1", "Dodge", "dodge", 1), mod("d2", "Dodge", "dodge", 1)],
    });
    expect(totals(r)).toEqual([14, 14, 10, 10]);
  });

  it("R38/R40/A10: Des -1 con límite de Des máx. +2 -> 9/9/9/9 (un límite no altera un Des negativo)", () => {
    const r = ac({ size: "medium", dexModifier: -1, maxDexCaps: [chainmailCap] });
    expect(totals(r)).toEqual([9, 9, 9, 9]);
    expect(r.normal.lines.find((l) => l.id === "ac.dex")).not.toHaveProperty("adjustment");
  });

  it("R40: Des 8 (-1) con cota de mallas +6 -> 10 - 1 + 6 = 15", () => {
    const r = ac({
      size: "medium",
      dexModifier: -1,
      maxDexCaps: [chainmailCap],
      modifiers: [chainmail],
    });
    expect(r.normal.total).toBe(15);
  });

  it("R40: Des 18 (+4) con cota de mallas (máx. +2) -> Des efectivo +2", () => {
    const r = ac({ size: "medium", dexModifier: 4, maxDexCaps: [chainmailCap] });
    expect(r.normal.lines.find((l) => l.id === "ac.dex")?.value).toBe(2);
  });
});

describe("armorClass - desglose y exclusiones", () => {
  const input: ArmorClassInput = {
    size: "medium",
    dexModifier: 3,
    maxDexCaps: [chainmailCap],
    modifiers: [
      chainmail,
      heavyShield,
      mod("natural", "Natural armor", "naturalArmor", 1),
      mod("ring", "Ring of protection", "deflection", 1),
      mod("dodge", "Dodge", "dodge", 1),
    ],
  };

  it("R42: toda variante lleva base 10, Des (ability), tamaño y una línea por modificador", () => {
    const r = ac(input);
    for (const b of [r.normal, r.touch, r.flatFooted, r.flatFootedTouch]) {
      expect(b.lines.map((l) => l.id)).toEqual([
        "ac.base",
        "ac.dex",
        "ac.size",
        "armor:chainmail",
        "shield:heavySteel",
        "natural",
        "ring",
        "dodge",
      ]);
      expect(b.lines[0]).toMatchObject({ type: "base", value: 10, status: "applied" });
      expect(b.lines[1]).toMatchObject({ type: "ability" });
      expect(b.lines[2]).toMatchObject({ type: "size", value: 0 });
    }
  });

  it("R36/R42: en toque, armor/shield/naturalArmor quedan excluded con razón 'touch'", () => {
    const r = ac(input);
    const status = (b: typeof r.touch, id: string) => {
      const l = b.lines.find((x) => x.id === id);
      return [l?.status, l?.excludedReason];
    };
    for (const b of [r.touch, r.flatFootedTouch]) {
      expect(status(b, "armor:chainmail")).toEqual(["excluded", "touch"]);
      expect(status(b, "shield:heavySteel")).toEqual(["excluded", "touch"]);
      expect(status(b, "natural")).toEqual(["excluded", "touch"]);
      expect(status(b, "ring")).toEqual(["applied", undefined]);
    }
    expect(status(r.normal, "armor:chainmail")).toEqual(["applied", undefined]);
  });

  it("R37/R42: desprevenido excluye el Des positivo y la esquiva con razón 'lostDexBonus'", () => {
    const r = ac(input);
    for (const b of [r.flatFooted, r.flatFootedTouch]) {
      const dex = b.lines.find((l) => l.id === "ac.dex");
      expect(dex).toMatchObject({ status: "excluded", excludedReason: "lostDexBonus" });
      expect(b.lines.find((l) => l.id === "dodge")).toMatchObject({
        status: "excluded",
        excludedReason: "lostDexBonus",
      });
    }
    expect(r.normal.lines.find((l) => l.id === "ac.dex")?.status).toBe("applied");
  });

  it("R38/R42: con Des negativo la línea de Des NO se excluye desprevenido", () => {
    const r = ac({ size: "medium", dexModifier: -2 });
    expect(r.flatFooted.lines.find((l) => l.id === "ac.dex")).toMatchObject({
      status: "applied",
      value: -2,
    });
    expect(r.flatFooted.total).toBe(8);
  });

  it("R36: un penalizador (value < 0) de tipo armor no se excluye en toque", () => {
    const r = ac({
      size: "medium",
      dexModifier: 0,
      modifiers: [mod("shatter", "Armor penalty", "armor", -2)],
    });
    expect(r.touch.total).toBe(8);
  });

  it("R37: un penalizador de esquiva no se excluye desprevenido", () => {
    const r = ac({
      size: "medium",
      dexModifier: 0,
      modifiers: [mod("slow", "Dodge penalty", "dodge", -1)],
    });
    expect(r.flatFooted.total).toBe(9);
  });

  it("R43: dos desvíos +2 y +3 -> +3; dos esquivas +1 -> +2 (CRB: Deflection / Dodge Bonuses)", () => {
    const r = ac({
      size: "medium",
      dexModifier: 0,
      modifiers: [
        mod("d1", "Deflection", "deflection", 2),
        mod("d2", "Deflection", "deflection", 3),
        mod("e1", "Dodge", "dodge", 1),
        mod("e2", "Dodge", "dodge", 1),
      ],
    });
    expect(r.normal.total).toBe(10 + 3 + 2);
  });

  it("R41: Des máx. -1 o 1.5 -> invalid_max_dex", () => {
    for (const value of [-1, 1.5]) {
      const r = armorClass({
        size: "medium",
        dexModifier: 2,
        maxDexCaps: [{ id: "x", name: "x", value }],
      });
      expect(!r.ok && r.error).toMatchObject({ code: "invalid_max_dex", field: "x" });
    }
  });

  it("R41: Des máx. 0 es válido (limita a 0)", () => {
    const r = ac({
      size: "medium",
      dexModifier: 3,
      maxDexCaps: [{ id: "x", name: "x", value: 0 }],
    });
    expect(r.normal.total).toBe(10);
  });

  it("R19/R42: ids reservados ac.base, ac.dex y ac.size -> duplicate_modifier_id", () => {
    for (const id of ["ac.base", "ac.dex", "ac.size"]) {
      const r = armorClass({
        size: "medium",
        dexModifier: 0,
        modifiers: [mod(id, "x", "untyped", 1)],
      });
      expect(!r.ok && r.error.code).toBe("duplicate_modifier_id");
    }
  });

  it("R17/R18: modificadores inválidos propagan su error sin lanzar", () => {
    const r = armorClass({
      size: "medium" as Size,
      dexModifier: 0,
      modifiers: [mod("x", "x", "armor", 1.5)],
    });
    expect(!r.ok && r.error.code).toBe("invalid_modifier_value");
  });

  it("R35: el modificador de tamaño entra en la CA (Grande -1, Pequeño +1)", () => {
    expect(ac({ size: "large", dexModifier: 0 }).normal.total).toBe(9);
    expect(ac({ size: "small", dexModifier: 0 }).normal.total).toBe(11);
  });
});
