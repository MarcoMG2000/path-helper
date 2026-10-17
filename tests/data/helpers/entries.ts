import type { BaseEntry } from "../../../src/data/schema/common";

/** Entrada mínima válida de la capa SRD (sintética; no es un dato real del CRB). */
export function baseEntry(overrides: Partial<Record<string, unknown>> = {}): BaseEntry {
  return {
    id: "power-attack",
    name: "Power Attack",
    textEn: "You can make exceptionally powerful attacks. Take a -1 penalty and gain +2 damage.",
    source: "https://www.aonprd.com/FeatDisplay.aspx?ItemName=Power%20Attack",
    sourceRef: "PRPG Core Rulebook pg. 131",
    book: "CRB",
    ...overrides,
  } as BaseEntry;
}
