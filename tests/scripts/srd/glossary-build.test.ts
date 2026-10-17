import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildGlossary,
  listGlossaryShards,
  writeGlossary,
} from "../../../scripts/srd/lib/glossary-build";
import { stableStringify } from "../../../scripts/srd/lib/json";
import { tempDir, writeFile } from "../helpers";

const g = (es: string) => ({ es, verified: false, origin: "draft", kind: "entry" });

describe("glossary-build (R31, R36)", () => {
  it("R31: lista shards recursivamente (solo *.es.json) con rutas relativas a src/data", () => {
    const data = tempDir();
    writeFile(data, "glossary/spells/a.es.json", "{}");
    writeFile(data, "glossary/classes.es.json", "{}");
    writeFile(data, "glossary/notes.txt", "x");
    writeFile(data, "glossary/other.json", "{}");
    expect(listGlossaryShards(data).map((s) => s.file)).toEqual([
      "glossary/classes.es.json",
      "glossary/spells/a.es.json",
    ]);
  });

  it("R36: la fusión es determinista y no depende del orden de los shards", () => {
    const a = { file: "glossary/a.es.json", data: { "feats:b": g("B"), "feats:a": g("A") } };
    const b = { file: "glossary/b.es.json", data: { "feats:c": g("C") } };
    expect(buildGlossary([a, b]).text).toBe(buildGlossary([b, a]).text);
    expect(buildGlossary([a, b]).keys).toBe(3);
  });

  it("R36: writeGlossary produce el mismo fichero byte a byte si los shards no cambian", () => {
    const data = tempDir();
    writeFile(
      data,
      "glossary/a.es.json",
      stableStringify({ "feats:z": g("Z"), "feats:a": g("A") }),
    );
    const first = writeGlossary(data);
    const text = readFileSync(join(data, "glossary.es.json"), "utf8");
    const second = writeGlossary(data);
    expect(second.path).toBe(first.path);
    expect(readFileSync(join(data, "glossary.es.json"), "utf8")).toBe(text);
    expect(text).toBe(first.text);
  });

  it("sin shards genera un objeto vacío", () => {
    const data = tempDir();
    writeGlossary(data);
    expect(readFileSync(join(data, "glossary.es.json"), "utf8")).toBe("{}\n");
  });
});
