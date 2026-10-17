import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createPrng } from "../../../scripts/srd/lib/prng";
import { loadSlugAliases, resolveEntryId, slugify } from "../../../scripts/srd/lib/slug";
import {
  collapseWhitespace,
  jaccard,
  normalizePunctuation,
  tokenize,
} from "../../../scripts/srd/lib/text";
import { tempDir, writeFile } from "../helpers";

describe("prng (R54)", () => {
  it("misma semilla, misma secuencia; semillas distintas difieren", () => {
    const a = createPrng(42);
    const b = createPrng(42);
    const seqA = Array.from({ length: 5 }, () => a.next());
    expect(seqA).toEqual(Array.from({ length: 5 }, () => b.next()));
    expect(seqA.every((n) => n >= 0 && n < 1)).toBe(true);
    expect(Array.from({ length: 5 }, () => createPrng(43).next())).not.toEqual(seqA);
  });

  it("shuffle es una permutación determinista que no muta la entrada", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const one = createPrng(7).shuffle(input);
    expect(one).toEqual(createPrng(7).shuffle(input));
    expect([...one].sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe("text", () => {
  it("collapseWhitespace y normalizePunctuation", () => {
    expect(collapseWhitespace("  a \n\t b c ")).toBe("a b c");
    expect(normalizePunctuation("“hola” – it’s…")).toBe('"hola" - it\'s...');
  });

  it("R56: jaccard 1 para textos equivalentes y bajo para distintos", () => {
    expect(tokenize("Power-Attack, again!")).toEqual(["power", "attack", "again"]);
    expect(jaccard("You can  make attacks.", "you can make ATTACKS")).toBe(1);
    expect(jaccard("a b c d", "c d e f")).toBeCloseTo(1 / 3);
    expect(jaccard("", "")).toBe(1);
    expect(jaccard("a", "")).toBe(0);
  });
});

describe("slug (R4)", () => {
  it("slugify y resolveEntryId con alias por kind", () => {
    expect(slugify("Cloak of Resistance")).toBe("cloak-of-resistance");
    const aliases = { "magic-items": { "weapon-ability.keen": "keen-weapon", ring: "x" } };
    expect(resolveEntryId("magic-items", "Keen", aliases, "weapon-ability")).toBe("keen-weapon");
    expect(resolveEntryId("magic-items", "Keen", aliases)).toBe("keen");
    expect(resolveEntryId("feats", "Keen", aliases)).toBe("keen");
  });

  it("loadSlugAliases lee el fichero y valida su forma", () => {
    const dir = tempDir();
    mkdirSync(dir, { recursive: true });
    writeFile(dir, "ok.json", JSON.stringify({ feats: { cleave: "cleave-feat" } }));
    expect(loadSlugAliases(join(dir, "ok.json"))).toEqual({ feats: { cleave: "cleave-feat" } });
    writeFile(dir, "bad.json", JSON.stringify({ feats: { cleave: "Cleave Feat" } }));
    expect(() => loadSlugAliases(join(dir, "bad.json"))).toThrow(/kebab/);
    writeFile(dir, "arr.json", "[]");
    expect(() => loadSlugAliases(join(dir, "arr.json"))).toThrow(/objeto/);
  });
});
