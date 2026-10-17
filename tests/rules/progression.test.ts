import { describe, expect, it } from "vitest";
import {
  baseAttackBonusFor,
  baseSaveFor,
  characterBaseAttackBonus,
  characterBaseSave,
  type ClassLevel,
} from "../../src/rules/progression";

// Tablas literales del Core (design §8.2): niveles 1..20.
const BAB = {
  good: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
  medium: [0, 1, 2, 3, 3, 4, 5, 6, 6, 7, 8, 9, 9, 10, 11, 12, 12, 13, 14, 15],
  poor: [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10],
} as const;
const SAVE = {
  good: [2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12],
  poor: [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6],
} as const;

// Fixtures de clase [F]: progresiones de las clases del Core (comprobadas contra las tablas de
// clase del SRD, https://www.d20pfsrd.com/classes/core-classes/).
const cls = (
  classId: string,
  level: number,
  bab: ClassLevel["bab"],
  fort: "good" | "poor",
  ref: "good" | "poor",
  will: "good" | "poor",
): ClassLevel => ({ classId, level, bab, saves: { fortitude: fort, reflex: ref, will } });
const paladin = (l: number) => cls("paladin", l, "good", "good", "poor", "good");
const rogue = (l: number) => cls("rogue", l, "medium", "poor", "good", "poor");
const bard = (l: number) => cls("bard", l, "medium", "poor", "good", "good");
const druid = (l: number) => cls("druid", l, "medium", "good", "poor", "good");
const cleric = (l: number) => cls("cleric", l, "medium", "good", "poor", "good");
const barbarian = (l: number) => cls("barbarian", l, "good", "good", "poor", "poor");
const wizard = (l: number) => cls("wizard", l, "poor", "poor", "poor", "good");

function bab(classes: ClassLevel[]): number {
  const r = characterBaseAttackBonus(classes);
  if (!r.ok) throw new Error(r.error.code);
  return r.value.total;
}
function save(s: "fortitude" | "reflex" | "will", classes: ClassLevel[]): number {
  const r = characterBaseSave(s, classes);
  if (!r.ok) throw new Error(r.error.code);
  return r.value.total;
}

describe("tablas de progresión por nivel", () => {
  it("R27/P1: BAB good, medium y poor coinciden con las tablas del Core, niveles 1-20", () => {
    for (const p of ["good", "medium", "poor"] as const) {
      BAB[p].forEach((expected, i) => {
        expect(baseAttackBonusFor(p, i + 1), `${p} nivel ${i + 1}`).toEqual({
          ok: true,
          value: expected,
        });
      });
    }
  });

  it("R28/P1: salvación good y poor coinciden con las tablas del Core, niveles 1-20", () => {
    for (const p of ["good", "poor"] as const) {
      SAVE[p].forEach((expected, i) => {
        expect(baseSaveFor(p, i + 1), `${p} nivel ${i + 1}`).toEqual({ ok: true, value: expected });
      });
    }
  });

  it("R29/P2: nivel 0, 21, 2.5 y -1 -> invalid_level", () => {
    for (const level of [0, 21, 2.5, -1]) {
      const a = baseAttackBonusFor("good", level);
      const b = baseSaveFor("poor", level);
      expect(!a.ok && a.error.code).toBe("invalid_level");
      expect(!b.ok && b.error.code).toBe("invalid_level");
      const c = characterBaseAttackBonus([paladin(level)]);
      expect(!c.ok && c.error.code).toBe("invalid_level");
    }
  });

  // Filas literales de la tabla de clase del Paladín en el SRD (Table: Paladin).
  it("R30/R31: Paladín 1-20 reproduce las columnas BAB/Fort/Ref/Will de su tabla de clase", () => {
    const babCol = BAB.good;
    const fort = [2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12];
    const ref = [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6];
    for (let l = 1; l <= 20; l++) {
      expect(bab([paladin(l)]), `BAB ${l}`).toBe(babCol[l - 1]);
      expect(save("fortitude", [paladin(l)]), `Fort ${l}`).toBe(fort[l - 1]);
      expect(save("reflex", [paladin(l)]), `Ref ${l}`).toBe(ref[l - 1]);
      expect(save("will", [paladin(l)]), `Will ${l}`).toBe(fort[l - 1]);
    }
  });

  it("R30/R31: Pícaro y Mago 1-20 reproducen su tabla de clase del SRD", () => {
    const rogueBab = [0, 1, 2, 3, 3, 4, 5, 6, 6, 7, 8, 9, 9, 10, 11, 12, 12, 13, 14, 15];
    const wizardBab = [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10];
    for (let l = 1; l <= 20; l++) {
      expect(bab([rogue(l)]), `Pícaro BAB ${l}`).toBe(rogueBab[l - 1]);
      expect(save("reflex", [rogue(l)]), `Pícaro Ref ${l}`).toBe(SAVE.good[l - 1]);
      expect(save("fortitude", [rogue(l)]), `Pícaro Fort ${l}`).toBe(SAVE.poor[l - 1]);
      expect(bab([wizard(l)]), `Mago BAB ${l}`).toBe(wizardBab[l - 1]);
      expect(save("will", [wizard(l)]), `Mago Will ${l}`).toBe(SAVE.good[l - 1]);
    }
  });
});

describe("BAB y salvaciones de personaje (monoclase y multiclase)", () => {
  it("R30/R31/P3: Paladín 5 -> BAB 5, Fort 4, Ref 1, Vol 4", () => {
    expect(bab([paladin(5)])).toBe(5);
    expect(save("fortitude", [paladin(5)])).toBe(4);
    expect(save("reflex", [paladin(5)])).toBe(1);
    expect(save("will", [paladin(5)])).toBe(4);
  });

  it("R30/R31/P4: Pícaro 7 -> BAB 5, Fort 2, Ref 5, Vol 2", () => {
    expect(bab([rogue(7)])).toBe(5);
    expect(save("fortitude", [rogue(7)])).toBe(2);
    expect(save("reflex", [rogue(7)])).toBe(5);
    expect(save("will", [rogue(7)])).toBe(2);
  });

  it("R30/R31/P5: Bardo 10 -> BAB 7, Fort 3, Ref 7, Vol 7", () => {
    expect(bab([bard(10)])).toBe(7);
    expect(save("fortitude", [bard(10)])).toBe(3);
    expect(save("reflex", [bard(10)])).toBe(7);
    expect(save("will", [bard(10)])).toBe(7);
  });

  it("R30/R31/P6: Druida 20 -> BAB 15, Fort 12, Ref 6, Vol 12", () => {
    expect(bab([druid(20)])).toBe(15);
    expect(save("fortitude", [druid(20)])).toBe(12);
    expect(save("reflex", [druid(20)])).toBe(6);
    expect(save("will", [druid(20)])).toBe(12);
  });

  // CRB: Multiclassing - "adds all of the hit points, base attack bonuses, and saving throw
  // bonuses" de cada clase; cada clase se calcula por separado y se suma.
  it("R30/R31/P7: Paladín 3 + Clérigo 2 -> BAB 4, Fort 6, Ref 1, Vol 6", () => {
    const mc = [paladin(3), cleric(2)];
    expect(bab(mc)).toBe(3 + 1);
    expect(save("fortitude", mc)).toBe(3 + 3);
    expect(save("reflex", mc)).toBe(1 + 0);
    expect(save("will", mc)).toBe(3 + 3);
  });

  it("R30/R31/P8: Pícaro 1 + Bárbaro 1 -> BAB 1, Fort 2, Ref 2, Vol 0", () => {
    const mc = [rogue(1), barbarian(1)];
    expect(bab(mc)).toBe(0 + 1);
    expect(save("fortitude", mc)).toBe(0 + 2);
    expect(save("reflex", mc)).toBe(2 + 0);
    expect(save("will", mc)).toBe(0 + 0);
  });

  it("R30: el desglose lleva una línea base por clase", () => {
    const r = characterBaseAttackBonus([paladin(3), cleric(2)]);
    if (!r.ok) throw new Error("unexpected");
    expect(r.value.lines.map((l) => [l.id, l.type, l.value, l.status])).toEqual([
      ["class:paladin", "base", 3, "applied"],
      ["class:cleric", "base", 1, "applied"],
    ]);
    const s = characterBaseSave("fortitude", [paladin(3), cleric(2)]);
    expect(s.ok && s.value.lines).toHaveLength(2);
    expect(s.ok && s.value.lines.every((l) => l.type === "base")).toBe(true);
  });

  it("R30: sin clases el BAB es 0 con desglose vacío", () => {
    const r = characterBaseAttackBonus([]);
    expect(r.ok && r.value.total).toBe(0);
    expect(r.ok && r.value.lines).toEqual([]);
  });

  it("R32/P9: el mismo classId dos veces -> duplicate_class", () => {
    const a = characterBaseAttackBonus([paladin(3), paladin(2)]);
    const b = characterBaseSave("will", [paladin(3), paladin(2)]);
    expect(!a.ok && a.error.code).toBe("duplicate_class");
    expect(!b.ok && b.error.code).toBe("duplicate_class");
  });
});
