import { describe, expect, it } from "vitest";
import type { ClassLevel } from "../../src/rules/progression";
import { SAVE_ABILITY, savingThrow } from "../../src/rules/saves";
import type { AbilityModifiers } from "../../src/rules/types";

const paladin5: ClassLevel = {
  classId: "paladin",
  level: 5,
  bab: "good",
  saves: { fortitude: "good", reflex: "poor", will: "good" },
};
const wizard1: ClassLevel = {
  classId: "wizard",
  level: 1,
  bab: "poor",
  saves: { fortitude: "poor", reflex: "poor", will: "good" },
};
// Con 14 (+2), Sab 12 (+1), Des 10 (0)
const mods: AbilityModifiers = { str: 0, dex: 0, con: 2, int: 0, wis: 1, cha: 0 };

function st(
  save: "fortitude" | "reflex" | "will",
  extra: Parameters<typeof savingThrow>[0]["modifiers"] = [],
  classes: ClassLevel[] = [paladin5],
  abilityModifiers: AbilityModifiers = mods,
) {
  const r = savingThrow({ save, classes, abilityModifiers, modifiers: extra });
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
}

describe("savingThrow (CRB: Saving Throws = base save + ability modifier + otros)", () => {
  it("R33/SV1: Paladín 5, Con 14, Sab 12, Des 10 -> Fort +6, Ref +1, Vol +5", () => {
    expect(st("fortitude").total).toBe(4 + 2);
    expect(st("reflex").total).toBe(1 + 0);
    expect(st("will").total).toBe(4 + 1);
  });

  it("R33/SV2: resistance +1 (capa A) y +2 (capa B) no apilan -> Fort +8, A suppressed", () => {
    const b = st("fortitude", [
      { id: "cloakA", name: "Cloak of Resistance +1", value: 1, type: "resistance" },
      { id: "cloakB", name: "Cloak of Resistance +2", value: 2, type: "resistance" },
    ]);
    expect(b.total).toBe(8);
    expect(b.lines.find((l) => l.id === "cloakA")).toMatchObject({
      status: "suppressed",
      suppressedBy: "cloakB",
    });
  });

  it("R33/SV3: morale +2 (bless) y morale -2 -> neto 0, ambos aplicados", () => {
    const b = st("will", [
      { id: "bless", name: "Bless", value: 2, type: "morale" },
      { id: "fear", name: "Fear", value: -2, type: "morale" },
    ]);
    expect(b.total).toBe(5);
    expect(b.lines.filter((l) => l.status === "applied")).toHaveLength(4);
  });

  it("R33/SV4: Fortitude usa Con, Reflex usa Des y Will usa Sab", () => {
    expect(SAVE_ABILITY).toEqual({ fortitude: "con", reflex: "dex", will: "wis" });
    // Mago 1: base Fort 0, Ref 0, Vol 2 (good). Con +3, Des +5, Sab +7.
    const am: AbilityModifiers = { str: 0, dex: 5, con: 3, int: 0, wis: 7, cha: 0 };
    expect(st("fortitude", [], [wizard1], am).total).toBe(0 + 3);
    expect(st("reflex", [], [wizard1], am).total).toBe(0 + 5);
    expect(st("will", [], [wizard1], am).total).toBe(2 + 7);
  });

  it("R33: el desglose lleva base por clase, línea de característica y stat 'save.<id>'", () => {
    const b = st("fortitude");
    expect(b.stat).toBe("save.fortitude");
    expect(b.lines.map((l) => [l.type, l.value])).toEqual([
      ["base", 4],
      ["ability", 2],
    ]);
  });

  it("R33 (multiclase): suma las salvaciones base de cada clase", () => {
    const cleric2: ClassLevel = {
      classId: "cleric",
      level: 2,
      bab: "medium",
      saves: { fortitude: "good", reflex: "poor", will: "good" },
    };
    const paladin3 = { ...paladin5, level: 3 };
    const zero: AbilityModifiers = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
    expect(st("fortitude", [], [paladin3, cleric2], zero).total).toBe(6);
  });

  it("R1: un nivel de clase inválido propaga invalid_level sin lanzar", () => {
    const r = savingThrow({
      save: "will",
      classes: [{ ...paladin5, level: 0 }],
      abilityModifiers: mods,
    });
    expect(!r.ok && r.error.code).toBe("invalid_level");
  });
});
