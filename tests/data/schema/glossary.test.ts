import { describe, expect, it } from "vitest";
import {
  GlossaryEntrySchema,
  GlossaryFileSchema,
  GlossaryMergeError,
  glossaryKey,
  mergeGlossaryShards,
  parseGlossaryKey,
  serializeGlossary,
} from "../../../src/data/schema/glossary";

const draft = { es: "Ataque poderoso", verified: false, origin: "draft", kind: "entry" } as const;

describe("GlossaryEntrySchema", () => {
  it("R31: acepta una entrada con es, verified, origin y kind", () => {
    expect(GlossaryEntrySchema.safeParse(draft).success).toBe(true);
    expect(GlossaryEntrySchema.safeParse({ ...draft, note: "n" }).success).toBe(true);
  });

  it("R32: verified:true con origin distinto de human es rechazado", () => {
    expect(GlossaryEntrySchema.safeParse({ ...draft, verified: true }).success).toBe(false);
    expect(
      GlossaryEntrySchema.safeParse({ ...draft, verified: true, origin: "human" }).success,
    ).toBe(true);
  });

  it("R31: rechaza kind desconocido, es vacío y campos extra", () => {
    expect(GlossaryEntrySchema.safeParse({ ...draft, kind: "x" }).success).toBe(false);
    expect(GlossaryEntrySchema.safeParse({ ...draft, es: "" }).success).toBe(false);
    expect(GlossaryEntrySchema.safeParse({ ...draft, extra: 1 }).success).toBe(false);
  });
});

describe("claves del glosario", () => {
  it("R31: formatos de clave <categoría>:<id>, con puntos y term:<id>", () => {
    const ok = {
      "feats:power-attack": draft,
      "class-features:paladin.smite-evil": draft,
      "term:flat-footed": { ...draft, kind: "term" },
    };
    expect(GlossaryFileSchema.safeParse(ok).success).toBe(true);
    expect(GlossaryFileSchema.safeParse({ "Feats:Power": draft }).success).toBe(false);
    expect(GlossaryFileSchema.safeParse({ nocolon: draft }).success).toBe(false);
    expect(glossaryKey("feats", "power-attack")).toBe("feats:power-attack");
    expect(parseGlossaryKey("class-features:paladin.smite-evil")).toEqual({
      prefix: "class-features",
      id: "paladin.smite-evil",
    });
  });
});

describe("mergeGlossaryShards", () => {
  it("R36: fusión determinista independiente del orden de shards y con claves ordenadas", () => {
    const a = { file: "glossary/a.es.json", data: { "feats:b": draft, "feats:a": draft } };
    const b = { file: "glossary/b.es.json", data: { "term:z": draft, "feats:c": draft } };
    const one = serializeGlossary(mergeGlossaryShards([a, b]));
    const two = serializeGlossary(mergeGlossaryShards([b, a]));
    expect(one).toBe(two);
    expect(Object.keys(JSON.parse(one))).toEqual(["feats:a", "feats:b", "feats:c", "term:z"]);
    expect(one.endsWith("}\n")).toBe(true);
  });

  it("R36: una clave repetida entre shards es un error que nombra ambos ficheros", () => {
    const shards = [
      { file: "a.json", data: { "feats:a": draft } },
      { file: "b.json", data: { "feats:a": draft } },
    ];
    expect(() => mergeGlossaryShards(shards)).toThrow(GlossaryMergeError);
    expect(() => mergeGlossaryShards(shards)).toThrow(/a\.json.*b\.json/);
  });

  it("un shard que no es objeto es un error", () => {
    expect(() => mergeGlossaryShards([{ file: "x.json", data: [] }])).toThrow(/objeto/);
  });
});
