import { describe, expect, it } from "vitest";
import {
  changePinBodySchema,
  createAccountBodySchema,
  loginBodySchema,
  nameSchema,
  normalizeName,
  patchAccountBodySchema,
  pinSchema,
  resetPinBodySchema,
} from "../../src/shared";

describe("nameSchema", () => {
  it("R3: acepta 1-32 caracteres y recorta espacios exteriores", () => {
    expect(nameSchema.parse("  Valeros ")).toBe("Valeros");
    expect(nameSchema.parse("a")).toBe("a");
    expect(nameSchema.safeParse("a".repeat(32)).success).toBe(true);
  });

  it("R3: rechaza vacío, solo espacios y más de 32 caracteres", () => {
    expect(nameSchema.safeParse("").success).toBe(false);
    expect(nameSchema.safeParse("   ").success).toBe(false);
    expect(nameSchema.safeParse("a".repeat(33)).success).toBe(false);
  });

  it("R3: rechaza caracteres de control", () => {
    for (const bad of ["a\nb", "a\u0000b", "a\tb", "a\u007fb", "a\u0085b"]) {
      expect(nameSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("R3: rechaza valores que no son cadena", () => {
    expect(nameSchema.safeParse(12).success).toBe(false);
    expect(nameSchema.safeParse(null).success).toBe(false);
  });
});

describe("pinSchema", () => {
  it("R3: acepta 4-8 dígitos, incluidos ceros a la izquierda", () => {
    for (const ok of ["1234", "0000", "0042", "12345678", "00000000"]) {
      expect(pinSchema.parse(ok)).toBe(ok);
    }
  });

  it("R3: rechaza longitudes fuera de rango, no dígitos y números", () => {
    for (const bad of [
      "123",
      "123456789",
      "12a4",
      " 1234",
      "1234 ",
      "12.34",
      "-1234",
      "",
      "１２３４",
    ]) {
      expect(pinSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
    expect(pinSchema.safeParse(1234).success).toBe(false);
  });

  it("R3: un salto de línea final no pasa la validación", () => {
    expect(pinSchema.safeParse("1234\n").success).toBe(false);
  });
});

describe("loginBodySchema", () => {
  it("R24: acepta name 1-64 y pin cadena 1-64 (sin exigir formato de PIN)", () => {
    expect(loginBodySchema.safeParse({ name: "ana", pin: "x" }).success).toBe(true);
    expect(loginBodySchema.safeParse({ name: "n".repeat(64), pin: "9".repeat(64) }).success).toBe(
      true,
    );
  });

  it("R24: rechaza campos ausentes, vacíos, demasiado largos o de otro tipo", () => {
    const bad: unknown[] = [
      null,
      "texto",
      {},
      { name: "ana" },
      { pin: "1234" },
      { name: "", pin: "1234" },
      { name: "ana", pin: "" },
      { name: "n".repeat(65), pin: "1234" },
      { name: "ana", pin: "9".repeat(65) },
      { name: "ana", pin: 1234 },
      { name: 5, pin: "1234" },
    ];
    for (const body of bad) {
      expect(loginBodySchema.safeParse(body).success, JSON.stringify(body)).toBe(false);
    }
  });
});

describe("schemas de cuerpos de cuentas", () => {
  it("R3: createAccountBodySchema valida nombre y PIN", () => {
    expect(createAccountBodySchema.safeParse({ name: " Ana ", pin: "0123" }).success).toBe(true);
    expect(createAccountBodySchema.safeParse({ name: "Ana", pin: "12" }).success).toBe(false);
    expect(createAccountBodySchema.safeParse({ name: "", pin: "1234" }).success).toBe(false);
  });

  it("resetPin / changePin / patch validan su forma", () => {
    expect(resetPinBodySchema.safeParse({ pin: "1234" }).success).toBe(true);
    expect(resetPinBodySchema.safeParse({ pin: "abc" }).success).toBe(false);
    expect(changePinBodySchema.safeParse({ currentPin: "x", newPin: "1234" }).success).toBe(true);
    expect(changePinBodySchema.safeParse({ currentPin: "x", newPin: "12" }).success).toBe(false);
    expect(patchAccountBodySchema.safeParse({ disabled: true }).success).toBe(true);
    expect(patchAccountBodySchema.safeParse({ disabled: "true" }).success).toBe(false);
  });
});

describe("normalizeName", () => {
  it("R20: ignora mayúsculas y espacios exteriores", () => {
    expect(normalizeName("  ValErOs ")).toBe("valeros");
  });

  it("R20: normaliza Unicode a NFC", () => {
    expect(normalizeName("José")).toBe(normalizeName("José"));
  });

  it("R20: no elimina espacios interiores", () => {
    expect(normalizeName("Ana  Maria")).toBe("ana  maria");
  });
});
