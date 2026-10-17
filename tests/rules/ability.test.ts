import { describe, expect, it } from "vitest";
import { abilityModifier, abilityModifiers, effectiveAbility } from "../../src/rules/ability";
import type { Modifier } from "../../src/rules/types";

// CRB Table: Ability Modifiers and Bonus Spells, columna de modificador (AB1), literal.
const TABLE: ReadonlyArray<readonly [number, number, number]> = [
  [1, 1, -5],
  [2, 3, -4],
  [4, 5, -3],
  [6, 7, -2],
  [8, 9, -1],
  [10, 11, 0],
  [12, 13, 1],
  [14, 15, 2],
  [16, 17, 3],
  [18, 19, 4],
  [20, 21, 5],
  [22, 23, 6],
  [24, 25, 7],
  [26, 27, 8],
  [28, 29, 9],
  [30, 31, 10],
  [32, 33, 11],
  [34, 35, 12],
  [36, 37, 13],
  [38, 39, 14],
  [40, 41, 15],
  [42, 43, 16],
  [44, 45, 17],
];

describe("abilityModifier", () => {
  it("R21/AB1: coincide con la tabla del Core para todas las puntuaciones 1-45", () => {
    let checked = 0;
    for (const [from, to, mod] of TABLE) {
      for (let s = from; s <= to; s++) {
        const r = abilityModifier(s);
        expect(r, `puntuación ${s}`).toEqual({ ok: true, value: mod });
        checked++;
      }
    }
    expect(checked).toBe(45);
  });

  it("R22/AB2: 0, -3, 10.5 y NaN -> invalid_ability_score", () => {
    for (const s of [0, -3, 10.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = abilityModifier(s);
      expect(r.ok).toBe(false);
      expect(!r.ok && r.error.code).toBe("invalid_ability_score");
    }
  });
});

describe("effectiveAbility", () => {
  const enh = (id: string, value: number): Modifier => ({
    id,
    name: id,
    value,
    type: "enhancement",
  });

  it("R23/AB3: Fue 14 con enhancement +4 y +2 (no apilan) -> 18, mod +4", () => {
    const r = effectiveAbility("str", 14, [enh("bull", 4), enh("belt", 2)]);
    if (!r.ok) throw new Error("unexpected");
    expect(r.value.score.total).toBe(18);
    expect(r.value.modifier).toBe(4);
    expect(r.value.score.stat).toBe("ability.str");
  });

  it("R23/AB4: Fue 10 con penalizador sin tipo -4 -> 6, mod -2", () => {
    const r = effectiveAbility("str", 10, [
      { id: "fatigue", name: "Fatigue", value: -4, type: "untyped" },
    ]);
    if (!r.ok) throw new Error("unexpected");
    expect(r.value.score.total).toBe(6);
    expect(r.value.modifier).toBe(-2);
  });

  it("R23: sin modificadores equivale a la puntuación base", () => {
    const r = effectiveAbility("dex", 15);
    expect(r.ok && r.value.score.total).toBe(15);
    expect(r.ok && r.value.modifier).toBe(2);
  });

  it("R24/AB5: base 8 con penalizador -8 -> ability_score_below_one", () => {
    const r = effectiveAbility("con", 8, [
      { id: "drain", name: "Drain", value: -8, type: "untyped" },
    ]);
    expect(!r.ok && r.error.code).toBe("ability_score_below_one");
  });

  it("R22: la puntuación base inválida da invalid_ability_score con field = id", () => {
    const r = effectiveAbility("int", 0);
    expect(!r.ok && r.error).toMatchObject({ code: "invalid_ability_score", field: "int" });
  });
});

describe("abilityModifiers", () => {
  it("R25/AB6: seis puntuaciones válidas -> seis modificadores", () => {
    const r = abilityModifiers({ str: 10, dex: 14, con: 12, int: 8, wis: 16, cha: 7 });
    expect(r).toEqual({
      ok: true,
      value: { str: 0, dex: 2, con: 1, int: -1, wis: 3, cha: -2 },
    });
  });

  it("R25/AB6: wis 0 -> invalid_ability_score con field 'wis'", () => {
    const r = abilityModifiers({ str: 10, dex: 10, con: 10, int: 10, wis: 0, cha: 10 });
    expect(!r.ok && r.error).toMatchObject({ code: "invalid_ability_score", field: "wis" });
  });
});
