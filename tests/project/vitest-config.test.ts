import { describe, expect, it } from "vitest";
import unitConfig from "../../vitest.config";
import intConfig from "../../vitest.int.config";

describe("configuración de Vitest", () => {
  it("R17: la suite unitaria incluye tests/**/*.test y excluye los *.int.test", () => {
    expect(unitConfig.test?.include).toEqual(["tests/**/*.test.{ts,tsx}"]);
    expect(unitConfig.test?.exclude).toContain("tests/**/*.int.test.{ts,tsx}");
  });

  it("R18: la suite de integración incluye únicamente tests/**/*.int.test", () => {
    expect(intConfig.test?.include).toEqual(["tests/**/*.int.test.{ts,tsx}"]);
  });
});
