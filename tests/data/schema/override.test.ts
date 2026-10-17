import { describe, expect, it } from "vitest";
import { OverrideSchema, getAtPath, jsonEqual, setAtPath } from "../../../src/data/schema/override";

describe("OverrideSchema", () => {
  const ok = { id: "x", field: "a.b", value: 1, reason: "r", evidence: "e" };

  it("R49: reason y evidence son obligatorios y no vacíos", () => {
    expect(OverrideSchema.safeParse(ok).success).toBe(true);
    expect(OverrideSchema.safeParse({ ...ok, reason: "" }).success).toBe(false);
    const noEvidence: Record<string, unknown> = { ...ok };
    delete noEvidence["evidence"];
    expect(OverrideSchema.safeParse(noEvidence).success).toBe(false);
  });
});

describe("rutas y comparación", () => {
  it("getAtPath/setAtPath recorren objetos y arrays", () => {
    const target = { table: [{ special: ["a"] }, { special: [] }] };
    expect(getAtPath(target, "table.0.special.0")).toBe("a");
    expect(getAtPath(target, "table.5.special")).toBeUndefined();
    expect(setAtPath(target, "table.1.special", ["b"])).toBe(true);
    expect(target.table[1]?.special).toEqual(["b"]);
    expect(setAtPath(target, "x.y.z", 1)).toBe(true);
    expect((target as unknown as Record<string, unknown>)["x"]).toEqual({ y: { z: 1 } });
    expect(setAtPath(5, "a", 1)).toBe(false);
  });

  it("jsonEqual ignora el orden de claves y distingue valores", () => {
    expect(jsonEqual({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
    expect(jsonEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(jsonEqual([1], { 0: 1 })).toBe(false);
    expect(jsonEqual(null, {})).toBe(false);
  });
});
