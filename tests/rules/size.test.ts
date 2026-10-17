import { describe, expect, it } from "vitest";
import { sizeModifier } from "../../src/rules/size";

describe("sizeModifier", () => {
  // CRB Ch.8, Armor Class - Table: Size Modifiers (literal).
  it("R26: los nueve valores de la tabla de modificadores de tamaño", () => {
    expect(sizeModifier("fine")).toBe(8);
    expect(sizeModifier("diminutive")).toBe(4);
    expect(sizeModifier("tiny")).toBe(2);
    expect(sizeModifier("small")).toBe(1);
    expect(sizeModifier("medium")).toBe(0);
    expect(sizeModifier("large")).toBe(-1);
    expect(sizeModifier("huge")).toBe(-2);
    expect(sizeModifier("gargantuan")).toBe(-4);
    expect(sizeModifier("colossal")).toBe(-8);
  });
});
