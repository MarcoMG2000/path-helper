import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ALLOWED_SOURCE_HOSTS, CATEGORY_IDS } from "../../../src/data/schema/common";
import { loadConfig, parseCategoryArg } from "../../../scripts/srd/lib/config";
import {
  PARSER_MODULES,
  ParserNotImplementedError,
  createParserLoader,
} from "../../../scripts/srd/lib/parser-registry";
import { pathsFor } from "../../../scripts/srd/lib/paths";
import { ROOT } from "../../project/helpers";
import { tempDir, writeFile } from "../helpers";

describe("config real de scripts/srd/config", () => {
  const config = loadConfig(pathsFor(ROOT).config);

  it("T0.6: seeds.json y section-allowlist.json tienen una clave por categoría registrada", () => {
    const raw = JSON.parse(
      readFileSync(resolve(ROOT, "scripts/srd/config/section-allowlist.json"), "utf8"),
    ) as Record<string, unknown>;
    // Los lotes rellenan sus claves; ninguna categoría puede faltar ni sobrar.
    expect(Object.keys(raw).sort()).toEqual([...CATEGORY_IDS].sort());
    const seeds = JSON.parse(
      readFileSync(resolve(ROOT, "scripts/srd/config/seeds.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(Object.keys(seeds).sort()).toEqual(["crosscheck", ...CATEGORY_IDS].sort());
  });

  it("R4: slug-aliases.json es válido y las semillas son URLs https de hosts permitidos", () => {
    expect(typeof config.slugAliases).toBe("object");
    for (const id of CATEGORY_IDS) {
      const seeds = config.seeds[id];
      const urls = [...(seeds?.urls ?? []), ...Object.values(seeds?.subsets ?? {}).flat()];
      for (const url of urls) {
        expect(new URL(url).protocol).toBe("https:");
        expect(ALLOWED_SOURCE_HOSTS as readonly string[]).toContain(new URL(url).hostname);
      }
    }
  });
});

describe("loadConfig", () => {
  it("lee el resto de config/*.json como extra en camelCase y valida el formato", () => {
    const dir = tempDir();
    writeFile(dir, "seeds.json", JSON.stringify({ crosscheck: {}, feats: { urls: [] } }));
    writeFile(dir, "slug-aliases.json", "{}");
    writeFile(dir, "section-allowlist.json", "{}");
    writeFile(dir, "spell-batches.json", JSON.stringify({ batches: [] }));
    expect(loadConfig(dir).extra).toEqual({ spellBatches: { batches: [] } });

    writeFile(dir, "seeds.json", JSON.stringify({ feats: { urls: ["not a url"] } }));
    expect(() => loadConfig(dir)).toThrow(/seeds\.json/);
    writeFile(dir, "seeds.json", JSON.stringify({ unknown: { urls: [] } }));
    expect(() => loadConfig(dir)).toThrow(/seeds\.json/);
    writeFile(dir, "seeds.json", "{ roto");
    expect(() => loadConfig(dir)).toThrow(/JSON inválido/);
  });
});

describe("parseCategoryArg (T0.6)", () => {
  it("acepta categoría, categoría:subconjunto y listas separadas por comas", () => {
    expect(parseCategoryArg(undefined)).toEqual([]);
    expect(parseCategoryArg("magic-items:ring")).toEqual([
      { category: "magic-items", subset: "ring" },
    ]);
    expect(parseCategoryArg("spells:a-c, feats")).toEqual([
      { category: "spells", subset: "a-c" },
      { category: "feats", subset: undefined },
    ]);
    expect(() => parseCategoryArg("potions")).toThrow(/categoría desconocida/);
  });
});

describe("parser-registry (T0.14)", () => {
  it("hay un módulo de parser para cada categoría y el equipo comparte módulo", () => {
    expect(Object.keys(PARSER_MODULES).sort()).toEqual([...CATEGORY_IDS].sort());
    expect(PARSER_MODULES.weapons).toBe(PARSER_MODULES.shields);
    expect(PARSER_MODULES["magic-items"]).toBe("magic-items/index.ts");
  });

  it("un parser que aún no existe lanza ParserNotImplementedError con el fichero esperado", async () => {
    const dir = tempDir();
    const loader = createParserLoader(dir);
    await expect(loader("domains")).rejects.toBeInstanceOf(ParserNotImplementedError);
    await expect(loader("domains")).rejects.toThrow(/scripts\/srd\/parsers\/domains\.ts/);
  });

  it("carga un módulo que exporta parse y rechaza uno que no", async () => {
    const dir = tempDir();
    writeFile(
      dir,
      "parsers/domains.ts",
      "export function parse() { return { entries: [], needsReview: [], excluded: [] }; }",
    );
    const mod = await createParserLoader(dir)("domains");
    expect(mod.parse({} as never).entries).toEqual([]);
    writeFile(dir, "parsers/races.ts", "export const x = 1;");
    await expect(createParserLoader(dir)("races")).rejects.toThrow(/exportar "parse"/);
  });
});
