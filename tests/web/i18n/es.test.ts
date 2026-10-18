import { describe, expect, it } from "vitest";
import { ERROR_CODES } from "../../../src/web/api/schemas";
import { errorMessage } from "../../../src/web/i18n/error-message";
import { es } from "../../../src/web/i18n/es";

describe("es.errors", () => {
  it.each([...ERROR_CODES, "network", "unexpected"] as const)(
    "R76: %s tiene un mensaje en español no vacío",
    (code) => {
      const text = errorMessage({ code, retryAfterSeconds: 60 });
      expect(text.trim().length).toBeGreaterThan(0);
    },
  );

  it("R76: no hay entradas sobrantes en es.errors", () => {
    expect(Object.keys(es.errors).sort()).toEqual([...ERROR_CODES, "network", "unexpected"].sort());
  });

  it("R76: se mantienen appName y health de f0", () => {
    expect(es.appName).toBe("Path Helper");
    expect(Object.keys(es.health).sort()).toEqual(["error", "loading", "ok"]);
  });
});
