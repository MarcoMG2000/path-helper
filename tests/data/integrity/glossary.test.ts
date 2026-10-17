import { describe, expect, it } from "vitest";
import { glossaryRule } from "../../../src/data/integrity/glossary";
import { mergeGlossaryShards, serializeGlossary } from "../../../src/data/schema/glossary";
import { baseEntry } from "../helpers/entries";
import { baseContext, dataset } from "../helpers/integrity";

const g = (kind: "entry" | "term" = "entry", extra: Record<string, unknown> = {}) => ({
  es: "x",
  verified: false,
  origin: "draft",
  kind,
  ...extra,
});

function withShards(shards: Record<string, unknown>, extra = {}) {
  const list = [{ file: "glossary/feats.es.json", data: shards }];
  return dataset({
    entries: { feats: [baseEntry()] },
    glossary: {
      shards: list,
      committedText: serializeGlossary(mergeGlossaryShards(list)),
    },
    ...extra,
  });
}

describe("glossary (R31-R36)", () => {
  it("caso verde: clave de entrada + término y fichero al día", () => {
    const data = withShards({ "feats:power-attack": g(), "term:flat-footed": g("term") });
    expect(glossaryRule(data, baseContext())).toEqual([]);
  });

  it("R33: una entrada sin clave de glosario falla", () => {
    const data = withShards({ "term:flat-footed": g("term") });
    expect(glossaryRule(data, baseContext())).toEqual([
      expect.objectContaining({ category: "feats", id: "power-attack", rule: "glossary.missing" }),
    ]);
  });

  it("R33: una clave entry sin entrada falla; las de categorías no cargadas se ignoran", () => {
    const data = withShards({
      "feats:power-attack": g(),
      "feats:ghost": g(),
      "spells:magic-missile": g(), // spells no está cargada: no se puede juzgar
    });
    const issues = glossaryRule(data, baseContext());
    expect(issues.map((i) => [i.rule, i.id])).toEqual([["glossary.orphan", "feats:ghost"]]);
  });

  it("R33: kind term con prefijo de categoría y kind entry con prefijo desconocido fallan", () => {
    const data = withShards({
      "feats:power-attack": g(),
      "feats:other": g("term"),
      "term:x": g("entry"),
    });
    const rules = glossaryRule(data, baseContext()).map((i) => i.rule);
    expect(rules).toContain("glossary.kind");
    expect(rules).toContain("glossary.orphan");
  });

  it("R32: verified:true con origin draft falla", () => {
    const data = withShards({ "feats:power-attack": g("entry", { verified: true }) });
    expect(glossaryRule(data, baseContext()).map((i) => i.rule)).toContain(
      "glossary.verified-origin",
    );
    const ok = withShards({
      "feats:power-attack": g("entry", { verified: true, origin: "human" }),
    });
    expect(glossaryRule(ok, baseContext())).toEqual([]);
  });

  it("R36: glossary.es.json distinto del generado o ausente falla", () => {
    const shards = { "feats:power-attack": g() };
    const list = [{ file: "glossary/feats.es.json", data: shards }];
    const stale = dataset({
      entries: { feats: [baseEntry()] },
      glossary: { shards: list, committedText: "{}\n" },
    });
    expect(glossaryRule(stale, baseContext()).map((i) => i.rule)).toEqual(["glossary.stale"]);
    const absent = dataset({ entries: { feats: [baseEntry()] }, glossary: { shards: list } });
    expect(glossaryRule(absent, baseContext()).map((i) => i.rule)).toEqual(["glossary.stale"]);
  });

  it("R36: claves repetidas entre shards fallan", () => {
    const data = dataset({
      glossary: {
        shards: [
          { file: "a.json", data: { "term:x": g("term") } },
          { file: "b.json", data: { "term:x": g("term") } },
        ],
      },
    });
    expect(glossaryRule(data, baseContext()).map((i) => i.rule)).toEqual(["glossary.duplicate"]);
  });

  it("R31: valor de glosario con formato inválido falla", () => {
    const data = withShards({ "feats:power-attack": { es: "", verified: false } });
    expect(glossaryRule(data, baseContext()).map((i) => i.rule)).toContain("glossary.format");
  });
});
