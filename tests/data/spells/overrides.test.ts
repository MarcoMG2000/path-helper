import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadDataset, loadIntegrityContext } from "../../../scripts/srd/lib/load-dataset";
import { overridesRule } from "../../../src/data/integrity/overrides";
import { OverrideFileSchema } from "../../../src/data/schema/override";
import { mergeProvenance } from "../../../src/data/schema/provenance";
import { ROOT } from "../../project/helpers";

// Lote Z: la nota editorial «Nethys Note» de Archives of Nethys (habla de otro libro, no del CRB)
// se recorta con un override documentado (R49) y no queda ninguna otra en los datos.
const { data } = loadDataset(ROOT);
const spells = (data.entries.spells ?? []) as { id: string; textEn: string }[];

describe("override de summon-monster-1 (nota «Nethys Note» recortada, R27, R49)", () => {
  const file = JSON.parse(
    readFileSync(resolve(ROOT, "src/data/overrides/spells/s-z.json"), "utf8"),
  ) as unknown;

  it("el fichero de overrides es válido y documenta motivo y evidencia con la cita de la fuente", () => {
    const overrides = OverrideFileSchema.parse(file);
    expect(overrides).toHaveLength(1);
    const [override] = overrides;
    expect(override).toMatchObject({ id: "summon-monster-1", field: "textEn" });
    expect(override!.reason).toContain("Nethys Note");
    expect(override!.evidence).toContain("SpellDisplay.aspx?ItemName=Summon%20Monster%201");
    expect(override!.evidence).toContain("PRPG Core Rulebook pg. 350");
  });

  it("el dato aplicado no contiene la nota y conserva el resto del texto y la tabla", () => {
    const summon = spells.find((s) => s.id === "summon-monster-1")!;
    expect(summon.textEn).not.toMatch(/nethys/i);
    expect(summon.textEn).not.toContain("Monster Summoner's Handbook");
    expect(summon.textEn).toContain("This spell summons an extraplanar creature");
    expect(summon.textEn).toContain("| **1st Level** | **Subtype** |");
    expect(summon.textEn).toContain("| **9th Level** | **Subtype** |");
    expect(summon.textEn).not.toContain("\n\n\n");
  });

  it("la procedencia del lote s-z registra el valor parseado (para detectar el override obsoleto)", () => {
    const provenance = mergeProvenance(
      (data.provenanceParts.spells ?? []).filter((p) => p.file.endsWith("s-z.json")),
    );
    const applied = provenance.overridesApplied ?? [];
    expect(applied).toHaveLength(1);
    expect(applied[0]).toMatchObject({ id: "summon-monster-1", field: "textEn" });
    expect(String(applied[0]!.parsedValue)).toContain("Nethys Note");
  });

  it("R49: la regla de overrides no informa nada sobre los datos reales", () => {
    expect(overridesRule(data, loadIntegrityContext(ROOT))).toEqual([]);
  });

  it("ninguna otra entrada de ninguna categoría contiene una nota «Nethys» (mismo patrón)", () => {
    const offenders: string[] = [];
    for (const [category, entries] of Object.entries(data.entries)) {
      for (const entry of entries as { id: string; textEn?: string }[]) {
        if (/nethys note|note from nethys|from nethys:/i.test(entry.textEn ?? "")) {
          offenders.push(`${category}:${entry.id}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
