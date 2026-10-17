import { describe, expect, it } from "vitest";
import {
  AbilityEnum,
  BaseEntrySchema,
  isAllowedSourceUrl,
  noHtmlTags,
  slugify,
} from "../../../src/data/schema/common";
import { baseEntry } from "../helpers/entries";

describe("BaseEntrySchema", () => {
  it("R2: una entrada válida pasa", () => {
    expect(BaseEntrySchema.safeParse(baseEntry()).success).toBe(true);
  });

  it("R2: falta de cada campo común es rechazada", () => {
    for (const field of ["id", "name", "textEn", "source", "sourceRef", "book"]) {
      const entry: Record<string, unknown> = { ...baseEntry() };
      delete entry[field];
      expect(BaseEntrySchema.safeParse(entry).success, field).toBe(false);
    }
  });

  it("R2: rechaza campos desconocidos (strict) y permite needsReview", () => {
    expect(BaseEntrySchema.safeParse(baseEntry({ extra: 1 })).success).toBe(false);
    expect(BaseEntrySchema.safeParse(baseEntry({ needsReview: true })).success).toBe(true);
  });

  it("R2: .extend() conserva el modo estricto y los campos comunes", () => {
    const Extended = BaseEntrySchema.extend({});
    expect(Extended.safeParse(baseEntry()).success).toBe(true);
    expect(Extended.safeParse(baseEntry({ extra: 1 })).success).toBe(false);
  });

  it("R3: book distinto de CRB es rechazado", () => {
    expect(BaseEntrySchema.safeParse(baseEntry({ book: "BEST" })).success).toBe(false);
    expect(BaseEntrySchema.safeParse(baseEntry({ book: "APG" })).success).toBe(false);
  });

  it("R4: el id debe ser kebab-case", () => {
    for (const id of [
      "Power-Attack",
      "power_attack",
      "power--attack",
      "-power",
      "power attack",
      "",
    ]) {
      expect(BaseEntrySchema.safeParse(baseEntry({ id })).success, id).toBe(false);
    }
    expect(BaseEntrySchema.safeParse(baseEntry({ id: "knowledge-arcana" })).success).toBe(true);
  });

  it("R6: host fuera de la lista, http y URL inválida son rechazados", () => {
    for (const source of [
      "https://example.com/x",
      "http://www.aonprd.com/x",
      "https://evil.aonprd.com.example.com/x",
      "not a url",
    ]) {
      expect(BaseEntrySchema.safeParse(baseEntry({ source })).success, source).toBe(false);
    }
    for (const source of [
      "https://aonprd.com/x",
      "https://www.aonprd.com/x",
      "https://d20pfsrd.com/x",
      "https://www.d20pfsrd.com/x",
    ]) {
      expect(isAllowedSourceUrl(source), source).toBe(true);
    }
  });

  it("R7: sourceRef debe empezar por 'PRPG Core Rulebook'", () => {
    expect(
      BaseEntrySchema.safeParse(baseEntry({ sourceRef: "Advanced Player's Guide pg. 1" })).success,
    ).toBe(false);
    expect(BaseEntrySchema.safeParse(baseEntry({ sourceRef: "PRPG Core Rulebook" })).success).toBe(
      true,
    );
  });

  it("R8: textEn con etiquetas HTML o vacío es rechazado", () => {
    expect(BaseEntrySchema.safeParse(baseEntry({ textEn: "<p>hola</p>" })).success).toBe(false);
    expect(BaseEntrySchema.safeParse(baseEntry({ textEn: "a <b>b</b>" })).success).toBe(false);
    expect(BaseEntrySchema.safeParse(baseEntry({ textEn: "" })).success).toBe(false);
    expect(
      BaseEntrySchema.safeParse(baseEntry({ textEn: "**Bold** and | a | b |\n- item" })).success,
    ).toBe(true);
  });
});

describe("noHtmlTags", () => {
  it("R8: detecta etiquetas, cierres y comentarios pero no comparaciones", () => {
    expect(noHtmlTags("<br>")).toBe(false);
    expect(noHtmlTags("</div>")).toBe(false);
    expect(noHtmlTags('<a href="x">y</a>')).toBe(false);
    expect(noHtmlTags("<!-- c -->")).toBe(false);
    expect(noHtmlTags("1 < 2 and 3 > 2")).toBe(true);
    expect(noHtmlTags("DC 10 + 1/2 level")).toBe(true);
  });
});

describe("slugify", () => {
  it("R4: minúsculas, sin apóstrofes y no alfanuméricos a guion", () => {
    expect(slugify("Power Attack")).toBe("power-attack");
    expect(slugify("Bull's Strength")).toBe("bulls-strength");
    expect(slugify("Bull’s Strength")).toBe("bulls-strength");
    expect(slugify("Knowledge (arcana)")).toBe("knowledge-arcana");
    expect(slugify("  Ring of Protection +1 ")).toBe("ring-of-protection-1");
    expect(slugify("Half-Elf")).toBe("half-elf");
    expect(slugify("Fireball/Burst")).toBe("fireball-burst");
  });
});

describe("AbilityEnum", () => {
  it("acepta las seis características y rechaza otras", () => {
    for (const a of ["str", "dex", "con", "int", "wis", "cha"]) {
      expect(AbilityEnum.safeParse(a).success).toBe(true);
    }
    expect(AbilityEnum.safeParse("luck").success).toBe(false);
  });
});
