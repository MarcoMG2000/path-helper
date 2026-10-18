import { describe, expect, it } from "vitest";
import { errorMessage } from "../../../src/web/i18n/error-message";
import { formatWait, plural } from "../../../src/web/i18n/format";

describe("formatWait", () => {
  it.each([
    [1, "1 minuto"],
    [59, "1 minuto"],
    [60, "1 minuto"],
    [61, "2 minutos"],
    [900, "15 minutos"],
    [3540, "59 minutos"],
    [3600, "1 hora"],
    [3601, "1 hora y 1 minuto"],
    [7500, "2 horas y 5 minutos"],
    [86400, "24 horas"],
  ] as [number, string][])("R46: %i s -> %s", (seconds, expected) => {
    expect(formatWait(seconds)).toBe(expected);
  });

  it("R46: sin segundos (o inválidos) devuelve el texto genérico", () => {
    expect(formatWait(undefined)).toBe("unos minutos");
    expect(formatWait(0)).toBe("unos minutos");
    expect(formatWait(-3)).toBe("unos minutos");
    expect(formatWait(Number.NaN)).toBe("unos minutos");
  });
});

describe("plural", () => {
  it("R46: distingue 1 del resto", () => {
    expect(plural(1, "hora", "horas")).toBe("hora");
    expect(plural(0, "hora", "horas")).toBe("horas");
    expect(plural(2, "hora", "horas")).toBe("horas");
  });
});

describe("errorMessage", () => {
  it("R45: locked incluye la espera formateada a partir de retryAfterSeconds", () => {
    expect(errorMessage({ code: "locked", retryAfterSeconds: 900 })).toContain("15 minutos");
    expect(errorMessage({ code: "locked" })).toContain("unos minutos");
  });

  it("R44: invalid_credentials no revela el motivo concreto", () => {
    const text = errorMessage({ code: "invalid_credentials" });
    expect(text).toContain("Nombre o PIN incorrectos");
    expect(text.toLowerCase()).not.toContain("deshabilitada");
  });
});
