import { describe, expect, it } from "vitest";
import { applyD20 } from "../../src/rules/check";
import { initiativeModifier } from "../../src/rules/initiative";

describe("initiativeModifier (CRB: Initiative es una prueba de Des + dotes/conjuros)", () => {
  it("R46/I1: Des 14 (+2) + Iniciativa mejorada (+4 untyped) -> +6; con d20 13 -> 19", () => {
    const r = initiativeModifier({
      dexModifier: 2,
      modifiers: [
        { id: "feat:improvedInitiative", name: "Improved Initiative", value: 4, type: "untyped" },
      ],
    });
    if (!r.ok) throw new Error("unexpected");
    expect(r.value.total).toBe(6);
    expect(r.value.stat).toBe("initiative");
    const roll = applyD20(r.value, 13);
    expect(roll.ok && roll.value.total).toBe(19);
  });

  it("R46/I2: Des 8 (-1), d20 1 -> total 0", () => {
    const r = initiativeModifier({ dexModifier: -1 });
    if (!r.ok) throw new Error("unexpected");
    expect(r.value.total).toBe(-1);
    const roll = applyD20(r.value, 1);
    expect(roll.ok && roll.value.total).toBe(0);
  });

  // CRB Ch.6 Armor: el Des máx. "doesn't affect any other Dexterity-related abilities".
  it("R46/I4: Des +4 sigue siendo +4 (la API no recibe límites de Des máx.)", () => {
    const r = initiativeModifier({ dexModifier: 4 });
    expect(r.ok && r.value.total).toBe(4);
    expect(r.ok && r.value.lines[0]).toMatchObject({
      id: "initiative.dex",
      type: "ability",
      value: 4,
    });
  });

  it("R46: aplica el apilamiento (dos bonos de mejora no se suman)", () => {
    const r = initiativeModifier({
      dexModifier: 0,
      modifiers: [
        { id: "a", name: "A", value: 2, type: "luck" },
        { id: "b", name: "B", value: 1, type: "luck" },
      ],
    });
    expect(r.ok && r.value.total).toBe(2);
  });
});
