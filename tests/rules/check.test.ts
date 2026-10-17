import { describe, expect, it } from "vitest";
import { applyD20 } from "../../src/rules/check";
import type { Breakdown } from "../../src/rules/types";

const bd = (total: number): Breakdown => ({ stat: "x", total, lines: [] });

describe("applyD20 (CRB: se tira 1d20 y se suma el modificador)", () => {
  it("R44: total = d20 + desglose.total, junto con el d20 natural y el desglose", () => {
    const b = bd(6);
    const r = applyD20(b, 13);
    expect(r).toEqual({ ok: true, value: { d20: 13, modifier: 6, total: 19, breakdown: b } });
  });

  it("R44: con modificador negativo, d20 1 -> total 0 (I2)", () => {
    const r = applyD20(bd(-1), 1);
    expect(r.ok && r.value.total).toBe(0);
  });

  it("R45/I3: d20 0, 21 y 10.5 -> invalid_d20", () => {
    for (const d of [0, 21, 10.5, Number.NaN]) {
      const r = applyD20(bd(0), d);
      expect(!r.ok && r.error.code).toBe("invalid_d20");
    }
  });

  it("R45: los extremos 1 y 20 son válidos", () => {
    expect(applyD20(bd(0), 1).ok).toBe(true);
    expect(applyD20(bd(0), 20).ok).toBe(true);
  });
});
