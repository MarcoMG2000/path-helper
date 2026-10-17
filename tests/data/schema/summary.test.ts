import { describe, expect, it } from "vitest";
import {
  SummaryFileSchema,
  checkNumericFidelity,
  numericTokens,
} from "../../../src/data/schema/summary";

describe("SummaryFileSchema", () => {
  it("R28: acepta resúmenes de 1 a 300 caracteres con estado draft/reviewed", () => {
    expect(
      SummaryFileSchema.safeParse({
        a: { summaryEs: "x", status: "draft" },
        b: { summaryEs: "y".repeat(300), status: "reviewed" },
      }).success,
    ).toBe(true);
  });

  it("R28: rechaza vacío, más de 300, estado desconocido y campos extra", () => {
    for (const bad of [
      { summaryEs: "", status: "draft" },
      { summaryEs: "y".repeat(301), status: "draft" },
      { summaryEs: "x", status: "ok" },
      { summaryEs: "x", status: "draft", extra: 1 },
    ]) {
      expect(SummaryFileSchema.safeParse({ a: bad }).success).toBe(false);
    }
  });
});

describe("checkNumericFidelity", () => {
  const text = "You gain a +2 bonus and deal 1d6 damage. The DC is 10 + your level. Penalty of -1.";

  it("R30: cifras presentes en textEn pasan", () => {
    expect(checkNumericFidelity("Bono de +2, 1d6 de daño, CD 10, penalizador -1.", text)).toEqual(
      [],
    );
  });

  it("R30: devuelve las cifras ausentes (dado, modificador y número)", () => {
    expect(checkNumericFidelity("Bono de +3 y 2d6 de daño, CD 12.", text)).toEqual([
      "+3",
      "2d6",
      "12",
    ]);
  });

  it("R30: un +N se acepta si el texto trae N sin signo, pero -N exige signo", () => {
    expect(checkNumericFidelity("+10", text)).toEqual([]);
    expect(checkNumericFidelity("-10", text)).toEqual(["-10"]);
    expect(checkNumericFidelity("+1", text)).toEqual(["+1"]); // "-1" y "1d6" no justifican "+1"
  });

  it("R30: normaliza el signo menos tipográfico", () => {
    expect(numericTokens("−2 y –3")).toEqual(["-2", "-3"]);
    expect(checkNumericFidelity("−1", text)).toEqual([]);
  });

  it("R30: un texto sin cifras acepta un resumen sin cifras", () => {
    expect(checkNumericFidelity("Sin números.", "No numbers here.")).toEqual([]);
  });
});
