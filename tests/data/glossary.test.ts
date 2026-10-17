import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GlossaryFileSchema } from "../../src/data/schema/glossary";
import { ROOT } from "../project/helpers";

// Términos transversales de design.md §7.
const TERMS = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
  "fortitude-save",
  "reflex-save",
  "will-save",
  "base-attack-bonus",
  "armor-class",
  "touch-ac",
  "flat-footed",
  "initiative",
  "enhancement-bonus",
  "morale-bonus",
  "luck-bonus",
  "dodge-bonus",
  "circumstance-bonus",
  "deflection-bonus",
  "resistance-bonus",
  "competence-bonus",
  "insight-bonus",
  "armor-bonus",
  "shield-bonus",
  "natural-armor-bonus",
  "sacred-bonus",
  "profane-bonus",
  "inherent-bonus",
  "racial-bonus",
  "alchemical-bonus",
  "smite-evil",
  "power-attack",
  "sneak-attack",
  "rage",
  "favored-enemy",
  "bardic-performance",
  "inspire-courage",
  "wild-shape",
  "channel-energy",
  "lay-on-hands",
  "animal-companion",
];

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(ROOT, path), "utf8"));
}

describe("glosario: términos transversales (R31, R32, R34)", () => {
  const terms = readJson("src/data/glossary/terms.es.json") as Record<
    string,
    Record<string, unknown>
  >;

  it("R31: terms.es.json cumple el schema del glosario", () => {
    expect(GlossaryFileSchema.safeParse(terms).success).toBe(true);
  });

  it("R34: contiene como `term` todos los términos de design.md §7", () => {
    for (const term of TERMS) {
      expect(terms[`term:${term}`], term).toBeDefined();
      expect(terms[`term:${term}`]?.["kind"]).toBe("term");
    }
    expect(Object.keys(terms)).toHaveLength(TERMS.length);
  });

  it("R32/Q2: todos son borrador sin verificar (origin draft, verified false)", () => {
    for (const [key, value] of Object.entries(terms)) {
      expect(value["origin"], key).toBe("draft");
      expect(value["verified"], key).toBe(false);
    }
  });

  it("Q2: los términos a confirmar tienen el nombre borrador esperado", () => {
    expect(terms["term:smite-evil"]?.["es"]).toBe("Castigar el mal");
    expect(terms["term:power-attack"]?.["es"]).toBe("Ataque poderoso");
    expect(terms["term:flat-footed"]?.["es"]).toBe("Desprevenido");
    expect(terms["term:touch-ac"]?.["es"]).toBe("CA de toque");
  });

  it("R31: glossary.es.json contiene todas las claves de terms.es.json con el mismo contenido", () => {
    const merged = readJson("src/data/glossary.es.json") as Record<string, unknown>;
    for (const [key, value] of Object.entries(terms)) expect(merged[key], key).toEqual(value);
    expect(Object.keys(merged)).toEqual([...Object.keys(merged)].sort());
  });
});
