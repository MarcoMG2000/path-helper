import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../../scripts/srd/cli";
import { loadDataset, loadIntegrityContext } from "../../scripts/srd/lib/load-dataset";
import { JsonRulesDataSource } from "../../src/data/json-rules-data-source";
import { runIntegrity } from "../../src/data/integrity";
import { CATEGORY_IDS, type EntryCategory } from "../../src/data/schema/common";
import { ROOT } from "../project/helpers";

// TZ.3 (R51, R52, R36): `data:validate` sobre los datos REALES de las 13 categorías. Es un test
// normal (offline, sin red: lee solo `src/data` y `scripts/srd/config`), por eso este fichero NO se
// llama `*.int.test.ts` (esa convención lo excluiría de `npm test` y de `init.sh`).

describe("data:validate sobre los datos reales (R51)", () => {
  it("la CLI termina con código 0 y sin hallazgos", async () => {
    const out: string[] = [];
    const err: string[] = [];
    const code = await runCli(["validate"], {
      root: ROOT,
      log: (line) => out.push(line),
      error: (line) => err.push(line),
    });
    expect({ code, out, err }).toEqual({ code: 0, out: ["data:validate: sin errores."], err: [] });
  });

  it("runIntegrity sobre las 13 categorías no devuelve ningún hallazgo", () => {
    const { data, issues: loadIssues } = loadDataset(ROOT);
    expect(loadIssues).toEqual([]);
    expect(Object.keys(data.entries).length + 1).toBe(CATEGORY_IDS.length); // spell-lists es un record
    expect(runIntegrity(data, loadIntegrityContext(ROOT))).toEqual([]);
  });

  it("R51: init.sh ejecuta data:validate y package.json lo registra", () => {
    const init = readFileSync(resolve(ROOT, "init.sh"), "utf8");
    expect(init).toContain("npm run data:validate");
    const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["data:validate"]).toBe("tsx scripts/srd/cli.ts validate");
  });

  it("R35/R58/R60: JsonRulesDataSource carga y valida las 12 categorías reales y las localiza", async () => {
    const source = new JsonRulesDataSource();
    const expected: Record<EntryCategory, number> = {
      classes: 7,
      "class-features": 240,
      domains: 33,
      races: 7,
      skills: 35,
      feats: 176,
      spells: 623,
      weapons: 87,
      armor: 12,
      shields: 6,
      gear: 164,
      "magic-items": 442,
    };
    for (const [category, count] of Object.entries(expected) as [EntryCategory, number][]) {
      const all = await source.list(category);
      expect(all.length, category).toBe(count);
      for (const localized of all) {
        // Todas las entradas tienen glosario y resumen ES en borrador (R29, R33).
        expect(localized.nameEs, `${category}:${localized.entry.id}`).not.toBeNull();
        expect(localized.summaryEs, `${category}:${localized.entry.id}`).not.toBeNull();
      }
    }
    expect((await source.get("spells", "wish"))?.entry.name).toBe("Wish");
    expect(await source.get("spells", "no-existe")).toBeUndefined();
    expect(Object.keys((await source.getSpellList("cleric")) ?? {})).toHaveLength(10);
    expect(await source.getSpellList("wizard")).toBeUndefined();
  });
});
