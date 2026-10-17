import { describe, expect, it } from "vitest";
import { resolveModifiers } from "../../src/rules/modifiers";
import { BONUS_TYPES, type Modifier, type ModifierType } from "../../src/rules/types";

const m = (id: string, type: ModifierType, value: number): Modifier => ({
  id,
  name: id,
  type,
  value,
});

function total(mods: Modifier[]): number {
  const r = resolveModifiers("t", mods);
  if (!r.ok) throw new Error(r.error.code);
  return r.value.total;
}

describe("BONUS_TYPES", () => {
  it("R7/M18: catálogo cerrado de 19 tipos del Core (CRB: tabla Bonus Types and Effects)", () => {
    expect([...BONUS_TYPES]).toEqual([
      "alchemical",
      "armor",
      "circumstance",
      "competence",
      "deflection",
      "dodge",
      "enhancement",
      "inherent",
      "insight",
      "luck",
      "morale",
      "naturalArmor",
      "profane",
      "racial",
      "resistance",
      "sacred",
      "shield",
      "size",
      "untyped",
    ]);
    expect(BONUS_TYPES).toHaveLength(19);
  });
});

describe("resolveModifiers - apilamiento (CRB: Combining Magic Effects / Bonus Types)", () => {
  it("R8/M1: dos deflection +2 y +3 -> solo cuenta +3; el +2 queda suppressed", () => {
    const r = resolveModifiers("t", [m("a", "deflection", 2), m("b", "deflection", 3)]);
    expect(r.ok && r.value.total).toBe(3);
    expect(r.ok && r.value.lines.map((l) => l.status)).toEqual(["suppressed", "applied"]);
    expect(r.ok && r.value.lines[0]?.suppressedBy).toBe("b");
  });

  it("R8/M2: armadura +4 y brazales +3 (armor) -> 4", () => {
    expect(total([m("armor", "armor", 4), m("bracers", "armor", 3)])).toBe(4);
  });

  it("R9/M3: tres dodge +1 se apilan -> 3 (CRB: Dodge Bonuses 'stack with each other')", () => {
    expect(total([m("a", "dodge", 1), m("b", "dodge", 1), m("c", "dodge", 1)])).toBe(3);
  });

  it("R9/M4: circumstance +2 y +1 se apilan -> 3", () => {
    expect(total([m("a", "circumstance", 2), m("b", "circumstance", 1)])).toBe(3);
  });

  it("R9/M5: untyped +1 y +2 se apilan -> 3 (CRB: 'Bonuses without a type always stack')", () => {
    expect(total([m("a", "untyped", 1), m("b", "untyped", 2)])).toBe(3);
  });

  // Desviación D1 del spec (OQ-2): el SRD dice "With the exception of dodge bonuses, most
  // circumstance bonuses, and racial bonuses, only the better bonus of a given type works".
  it("R9/D1: racial +2 y +1 se apilan -> 3 (CRB: excepción racial del SRD)", () => {
    const r = resolveModifiers("t", [m("a", "racial", 2), m("b", "racial", 1)]);
    expect(r.ok && r.value.total).toBe(3);
    expect(r.ok && r.value.lines.every((l) => l.status === "applied")).toBe(true);
  });

  it("R10/M6: enhancement +2, luck +1, morale +2 (tipos distintos) -> 5", () => {
    expect(total([m("a", "enhancement", 2), m("b", "luck", 1), m("c", "morale", 2)])).toBe(5);
  });

  // Desviación D2 del spec (R11, M7): el SRD dice "a character taking two or more penalties of
  // the same type applies only the worst one, although most penalties have no type and thus
  // always stack". El spec decía -4; el SRD da -2.
  it("R11/M7/D2: morale -2 y morale -2 -> solo cuenta el peor (-2); el otro queda suppressed", () => {
    const r = resolveModifiers("t", [m("a", "morale", -2), m("b", "morale", -2)]);
    expect(r.ok && r.value.total).toBe(-2);
    expect(r.ok && r.value.lines[1]?.suppressedBy).toBe("a");
  });

  it("R11/D2: morale -1 y morale -3 -> cuenta el peor (-3)", () => {
    expect(total([m("a", "morale", -1), m("b", "morale", -3)])).toBe(-3);
  });

  it("R11/D2: penalizadores sin tipo (untyped) y circumstance sí se apilan", () => {
    expect(total([m("a", "untyped", -2), m("b", "untyped", -2)])).toBe(-4);
    expect(total([m("a", "circumstance", -2), m("b", "circumstance", -1)])).toBe(-3);
  });

  it("R11/M8: morale +2 con morale -2 (bono y penalizador) -> 0, ambos applied", () => {
    const r = resolveModifiers("t", [m("a", "morale", 2), m("b", "morale", -2)]);
    expect(r.ok && r.value.total).toBe(0);
    expect(r.ok && r.value.lines.map((l) => l.status)).toEqual(["applied", "applied"]);
  });

  it("R8/R11/M9: enhancement +2, -1 y +4 -> +4 + (-1) = 3", () => {
    const r = resolveModifiers("t", [
      m("A", "enhancement", 2),
      m("B", "enhancement", -1),
      m("C", "enhancement", 4),
    ]);
    expect(r.ok && r.value.total).toBe(3);
    expect(r.ok && r.value.lines.map((l) => l.status)).toEqual([
      "suppressed",
      "applied",
      "applied",
    ]);
  });

  it("R12/M10: base +3, base +2 y ability +4 siempre suman -> 9, todos applied", () => {
    const r = resolveModifiers("t", [m("a", "base", 3), m("b", "base", 2), m("c", "ability", 4)]);
    expect(r.ok && r.value.total).toBe(9);
    expect(r.ok && r.value.lines.every((l) => l.status === "applied")).toBe(true);
  });

  it("R12: un ability negativo (Des -1) y dos ability se aplican siempre", () => {
    expect(total([m("a", "ability", -1), m("b", "ability", -2)])).toBe(-3);
  });

  it("R13/M11: dos armor +3 -> cuenta el primero; el segundo suppressedBy el primero", () => {
    const r = resolveModifiers("t", [m("A", "armor", 3), m("B", "armor", 3)]);
    expect(r.ok && r.value.total).toBe(3);
    expect(r.ok && r.value.lines[0]).toMatchObject({ id: "A", status: "applied" });
    expect(r.ok && r.value.lines[1]).toMatchObject({
      id: "B",
      status: "suppressed",
      suppressedBy: "A",
    });
  });

  it("R14/M12: toda permutación de un conjunto mixto da el mismo total", () => {
    const set: Modifier[] = [
      m("a", "enhancement", 2),
      m("b", "luck", 1),
      m("c", "morale", 2),
      m("d", "morale", -2),
      m("e", "base", 3),
      m("f", "ability", 4),
    ];
    const perms = (xs: Modifier[]): Modifier[][] =>
      xs.length <= 1
        ? [xs]
        : xs.flatMap((x, i) =>
            perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]),
          );
    const all = perms(set);
    expect(all).toHaveLength(720);
    // 2 + 1 + (2 - 2) + 3 + 4
    for (const p of all) expect(total(p)).toBe(10);
  });

  it("R14: permutar un conjunto con empates y penalizadores del mismo tipo conserva el total", () => {
    const set: Modifier[] = [
      m("a", "armor", 3),
      m("b", "armor", 3),
      m("c", "armor", 1),
      m("d", "morale", -2),
      m("e", "morale", -2),
    ];
    const perms = (xs: Modifier[]): Modifier[][] =>
      xs.length <= 1
        ? [xs]
        : xs.flatMap((x, i) =>
            perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]),
          );
    // 3 (armor) + (-2) (peor morale)
    for (const p of perms(set)) expect(total(p)).toBe(1);
  });

  it("R15: una línea por modificador en orden de entrada; total = Σ applied", () => {
    const input = [
      m("x", "armor", 2),
      m("y", "armor", 5),
      m("z", "untyped", -1),
      m("w", "dodge", 1),
    ];
    const r = resolveModifiers("stat", input);
    if (!r.ok) throw new Error("unexpected");
    expect(r.value.stat).toBe("stat");
    expect(r.value.lines.map((l) => l.id)).toEqual(["x", "y", "z", "w"]);
    const sum = r.value.lines
      .filter((l) => l.status === "applied")
      .reduce((s, l) => s + l.value, 0);
    expect(r.value.total).toBe(sum);
    expect(r.value.total).toBe(5);
  });

  it("R16/M13: lista vacía -> total 0 y lines []", () => {
    const r = resolveModifiers("t", []);
    expect(r).toEqual({ ok: true, value: { stat: "t", total: 0, lines: [] } });
  });
});

describe("resolveModifiers - validación", () => {
  it("R17/M14: tipo desconocido ('trait') -> invalid_modifier_type", () => {
    const bad = { id: "t", name: "t", value: 1, type: "trait" } as unknown as Modifier;
    const r = resolveModifiers("t", [bad]);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.code).toBe("invalid_modifier_type");
  });

  it("R18/M15: valor no entero finito -> invalid_modifier_value (1.5, NaN, Infinity)", () => {
    for (const value of [1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = resolveModifiers("t", [m("a", "armor", value)]);
      expect(!r.ok && r.error.code).toBe("invalid_modifier_value");
    }
  });

  it("R19/M16: dos modificadores con el mismo id -> duplicate_modifier_id", () => {
    const r = resolveModifiers("t", [m("x", "armor", 1), m("x", "luck", 1)]);
    expect(!r.ok && r.error.code).toBe("duplicate_modifier_id");
  });

  it("R20/M17: armor +5 excluida no cuenta ni suprime a armor +2", () => {
    const r = resolveModifiers("t", [m("big", "armor", 5), m("small", "armor", 2)], {
      excluded: new Map([["big", "touch" as const]]),
    });
    if (!r.ok) throw new Error("unexpected");
    expect(r.value.total).toBe(2);
    expect(r.value.lines[0]).toMatchObject({
      id: "big",
      status: "excluded",
      excludedReason: "touch",
    });
    expect(r.value.lines[1]).toMatchObject({ id: "small", status: "applied" });
  });
});
