import { describe, expect, it } from "vitest";
import { VALID_CASES } from "./fixtures";

describe("salidas serializables (JSON round-trip)", () => {
  for (const c of VALID_CASES.filter((x) => x.name !== "sizeModifier")) {
    it(`R5: la salida de ${c.name} sobrevive a JSON.parse(JSON.stringify(v)) con toStrictEqual`, () => {
      const result = c.run() as { ok: boolean; value?: unknown };
      expect(result.ok).toBe(true);
      expect(JSON.parse(JSON.stringify(result.value))).toStrictEqual(result.value);
    });
  }

  it("R5: sizeModifier (número plano) también es JSON-estable", () => {
    const r = VALID_CASES.find((c) => c.name === "sizeModifier")?.run();
    expect(JSON.parse(JSON.stringify(r))).toStrictEqual(r);
  });
});
