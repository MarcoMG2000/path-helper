import { describe, expect, it } from "vitest";
import {
  applyOverrides,
  parseOverrideParts,
  readOverrideParts,
} from "../../../scripts/srd/lib/overrides";
import { stableStringify } from "../../../scripts/srd/lib/json";
import { tempDir, writeFile } from "../helpers";

const ov = {
  id: "a",
  field: "table.0.fort",
  value: 2,
  reason: "fuente errónea",
  evidence: "libro pg. 1",
};

describe("lib/overrides (R49, R98)", () => {
  it("aplica el valor sobre una copia y registra el valor parseado", () => {
    const parsed = [{ id: "a", table: [{ fort: 0 }] }];
    const result = applyOverrides(parsed, [ov]);
    expect(result.entries[0]).toEqual({ id: "a", table: [{ fort: 2 }] });
    expect(parsed[0]?.table[0]?.fort).toBe(0); // no muta la entrada
    expect(result.applied).toEqual([{ id: "a", field: "table.0.fort", parsedValue: 0 }]);
  });

  it("override obsoleto (el valor ya coincide) o con id desconocido se separan", () => {
    const parsed = [{ id: "a", table: [{ fort: 2 }] }];
    const result = applyOverrides(parsed, [ov, { ...ov, id: "zzz" }]);
    expect(result.obsolete).toHaveLength(1);
    expect(result.unknownTarget).toHaveLength(1);
    expect(result.applied).toEqual([]);
  });

  it("R49: parseOverrideParts rechaza reason o evidence ausentes nombrando el fichero", () => {
    const bad: Record<string, unknown> = { ...ov };
    delete bad["reason"];
    expect(() => parseOverrideParts([{ file: "overrides/feats.json", data: [bad] }])).toThrow(
      /overrides\/feats\.json/,
    );
    expect(parseOverrideParts([{ file: "x", data: [ov] }])).toEqual([ov]);
  });

  it("R98: lee <cat>.json y el directorio <cat>/<lote>.json como una sola unión", () => {
    const data = tempDir();
    writeFile(data, "overrides/spells/d-h.json", stableStringify([{ ...ov, id: "d" }]));
    writeFile(data, "overrides/spells/a-c.json", stableStringify([{ ...ov, id: "c" }]));
    writeFile(data, "overrides/spells.json", stableStringify([{ ...ov, id: "x" }]));
    const parts = readOverrideParts(data, "spells");
    expect(parts.map((p) => p.file)).toEqual([
      "overrides/spells.json",
      "overrides/spells/a-c.json",
      "overrides/spells/d-h.json",
    ]);
    expect(parseOverrideParts(parts).map((o) => o.id)).toEqual(["x", "c", "d"]);
    expect(readOverrideParts(data, "feats")).toEqual([]);
  });
});
