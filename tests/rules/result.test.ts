import { describe, expect, it } from "vitest";
import { err, ok } from "../../src/rules/result";
import { INVALID_CASES } from "./fixtures";

describe("Result", () => {
  it("R1: ok() y err() construyen la unión discriminada; err omite field si no se da", () => {
    expect(ok(3)).toEqual({ ok: true, value: 3 });
    expect(err("invalid_d20", "m")).toStrictEqual({
      ok: false,
      error: { code: "invalid_d20", message: "m" },
    });
    expect(err("invalid_d20", "m", "d20")).toStrictEqual({
      ok: false,
      error: { code: "invalid_d20", message: "m", field: "d20" },
    });
  });

  for (const c of INVALID_CASES) {
    it(`R1: entrada inválida de ${c.name} devuelve ok:false y no lanza`, () => {
      let result: unknown;
      expect(() => {
        result = c.run();
      }).not.toThrow();
      expect(result).toMatchObject({
        ok: false,
        error: { code: expect.any(String), message: expect.any(String) },
      });
    });
  }
});
