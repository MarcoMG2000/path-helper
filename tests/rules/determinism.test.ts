import { afterEach, describe, expect, it, vi } from "vitest";
import { VALID_CASES, deepFreeze } from "./fixtures";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("determinismo y pureza de las funciones públicas", () => {
  for (const c of VALID_CASES) {
    it(`R2: ${c.name} da salidas profundamente iguales sin leer reloj ni aleatoriedad`, () => {
      const boom = () => {
        throw new Error("estado global leído");
      };
      vi.spyOn(Date, "now").mockImplementation(boom);
      vi.spyOn(Math, "random").mockImplementation(boom);
      const a = c.run();
      const b = c.run();
      expect(a).toStrictEqual(b);
    });

    it(`R3: ${c.name} acepta entradas congeladas en profundidad y no las modifica`, () => {
      const frozen = c.run(deepFreeze);
      expect(frozen).toStrictEqual(c.run());
    });
  }
});
