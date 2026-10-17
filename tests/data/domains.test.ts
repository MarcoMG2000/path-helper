import { describe, expect, it } from "vitest";
import { loadDataset, loadIntegrityContext } from "../../scripts/srd/lib/load-dataset";
import { mergeProvenance } from "../../src/data/schema/provenance";
import { runIntegrity } from "../../src/data/integrity";
import type { ClassFeature } from "../../src/data/schema/class-feature";
import type { Domain } from "../../src/data/schema/domain";
import { ROOT } from "../project/helpers";

// Datos reales de `domains`. Los 33 dominios CRB y las 2 páginas de otro libro (Scalykind y Void,
// "Book of the Damned") salen del índice ClericDomains.aspx y de la etiqueta Source de cada página.
const { data } = loadDataset(ROOT, ["domains", "class-features"]);
const domains = (data.entries.domains ?? []) as Domain[];
const byId = new Map(domains.map((d) => [d.id, d] as const));

const CRB_DOMAINS = [
  "air",
  "animal",
  "artifice",
  "chaos",
  "charm",
  "community",
  "darkness",
  "death",
  "destruction",
  "earth",
  "evil",
  "fire",
  "glory",
  "good",
  "healing",
  "knowledge",
  "law",
  "liberation",
  "luck",
  "madness",
  "magic",
  "nobility",
  "plant",
  "protection",
  "repose",
  "rune",
  "strength",
  "sun",
  "travel",
  "trickery",
  "war",
  "water",
  "weather",
];

describe("domains (R23)", () => {
  it("R23: los 33 dominios del CRB y ninguno de otro libro", () => {
    expect(domains.map((d) => d.id).sort()).toEqual(CRB_DOMAINS);
    expect(byId.has("scalykind")).toBe(false);
    expect(byId.has("void")).toBe(false);
  });

  it("R26: el recuento coincide con el expectedCount congelado", () => {
    expect(mergeProvenance(data.provenanceParts.domains!).expectedCount).toBe(33);
  });

  it("R23: cada dominio tiene sus poderes y conjuros de nivel 1 a 9", () => {
    for (const d of domains) {
      expect(d.grantedPowers.length, d.id).toBeGreaterThanOrEqual(2);
      expect(
        d.spells.map((s) => s.level),
        d.id,
      ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    }
  });

  it("R23: Air tal como lo da la fuente (poderes, niveles y cualificadores)", () => {
    const air = byId.get("air")!;
    expect(air.sourceRef).toBe("PRPG Core Rulebook pg. 41");
    expect(air.grantedPowers.map((p) => [p.name, p.abilityType, p.level])).toEqual([
      ["Lightning Arc", "Sp", 1],
      ["Electricity Resistance", "Ex", 6],
    ]);
    expect(air.spells.map((s) => s.name)).toEqual([
      "obscuring mist",
      "wind wall",
      "gaseous form",
      "air walk",
      "control winds",
      "chain lightning",
      "elemental body IV",
      "whirlwind",
      "elemental swarm",
    ]);
    expect(air.spells[6]).toMatchObject({ note: "air only" });
    expect(air.spells[8]).toMatchObject({ spellId: "elemental-swarm", note: "air spell only" });
  });

  it("R23: Fire incluye burning hands como conjuro de nivel 1 del dominio", () => {
    expect(byId.get("fire")!.spells[0]).toMatchObject({ level: 1, spellId: "burning-hands" });
  });

  it("R27: sin subdominios, variantes ni deidades de otros libros en el texto", () => {
    for (const d of domains) {
      expect(d.textEn, d.id).not.toMatch(
        /Subdomain|Replacement Power|Associated Domain|Pharasma-Friendly/,
      );
      expect(d.sourceRef.startsWith("PRPG Core Rulebook")).toBe(true);
    }
  });

  it("R13/R23: los poderes de dominio de domains y de class-features son los mismos", () => {
    const features = (data.entries["class-features"] ?? []) as ClassFeature[];
    const powers = features.filter((f) => f.id.startsWith("cleric.domain."));
    expect(powers).toHaveLength(domains.reduce((n, d) => n + d.grantedPowers.length, 0));
  });

  it("la capa ES de los dominios está completa y las referencias internas son correctas", () => {
    const found = runIntegrity(data, loadIntegrityContext(ROOT), { categories: ["domains"] });
    // El contraste de conjuros de dominio contra `spells` lo cierra la integración final (TZ.1).
    expect(found.filter((i) => i.rule !== "domain.spell-ref")).toEqual([]);
  });
});
