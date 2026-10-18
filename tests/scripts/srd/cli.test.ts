import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BaseEntrySchema, CATEGORY_IDS } from "../../../src/data/schema/common";
import { runCli, type CliDeps } from "../../../scripts/srd/cli";
import { cachePathFor } from "../../../scripts/srd/lib/fetch-cache";
import { writeCategoryIndexes } from "../../../scripts/srd/lib/shard-index";
import { stableStringify } from "../../../scripts/srd/lib/json";
import type {
  DiscoverInput,
  ParserInput,
  ParserModule,
  ParserOutput,
} from "../../../scripts/srd/lib/parser-contract";
import { fakeClock, fakeFetch, tempDir, writeFile } from "../helpers";

const INDEX = "https://www.aonprd.com/Feats.aspx";
const PAGE_A = "https://www.aonprd.com/FeatDisplay.aspx?ItemName=Cleave";
const PAGE_B = "https://www.aonprd.com/FeatDisplay.aspx?ItemName=Alertness";
const PAGE_X = "https://www.aonprd.com/FeatDisplay.aspx?ItemName=Foreign";

const BODIES: Record<string, string> = {
  [INDEX]: "<html>index</html>",
  [PAGE_A]: "<html>cleave</html>",
  [PAGE_B]: "<html>alertness</html>",
  [PAGE_X]: "<html>foreign</html>",
};

function entry(id: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name,
    textEn: `${name} text`,
    source: `https://www.aonprd.com/FeatDisplay.aspx?ItemName=${name}`,
    sourceRef: "PRPG Core Rulebook pg. 1",
    book: "CRB",
    ...extra,
  };
}

interface Env {
  root: string;
  deps: CliDeps;
  out: string[];
  err: string[];
  calls: { url: string }[];
  parserCalls: ParserInput[];
}

/** Raíz temporal con la config mínima y un parser falso de `feats` (no toca el repo). */
function env(
  options: { parse?: (input: ParserInput) => ParserOutput; throwingFetch?: boolean } = {},
): Env {
  const root = tempDir();
  writeFile(
    root,
    "scripts/srd/config/seeds.json",
    stableStringify({
      crosscheck: { feats: "https://www.d20pfsrd.com/feats/{slug}" },
      feats: { urls: [INDEX], subsets: { extra: [PAGE_X] } },
    }),
  );
  writeFile(root, "scripts/srd/config/slug-aliases.json", "{}\n");
  writeFile(
    root,
    "scripts/srd/config/section-allowlist.json",
    stableStringify({ feats: ["Benefit"] }),
  );
  const clock = fakeClock();
  const ff = fakeFetch((url) => ({ status: 200, body: BODIES[url] ?? "" }), clock);
  const out: string[] = [];
  const err: string[] = [];
  const parserCalls: ParserInput[] = [];
  const module: ParserModule = {
    discover: (input: DiscoverInput) => ({
      urls: [PAGE_A, PAGE_B],
      expectations: { expectedCount: input.seedPages.length + 1 },
    }),
    parse:
      options.parse ??
      ((input) => {
        parserCalls.push(input);
        return {
          entries: [entry("cleave", "Cleave"), entry("alertness", "Alertness")],
          shardOf: (en) => `feats/${en.id.slice(0, 1)}.json`,
          needsReview: [{ id: "cleave", reason: "dudoso" }],
          excluded: [{ url: PAGE_X, book: "APG", reason: "otro libro" }],
          counters: { "clases descartadas": 2 },
          provenancePatch: { importedKinds: ["feat"] },
        };
      }),
  };
  const deps: CliDeps = {
    root,
    clock,
    fetch: options.throwingFetch
      ? ((() => {
          throw new Error("red prohibida");
        }) as typeof fetch)
      : ff.fetch,
    log: (l) => out.push(l),
    error: (l) => err.push(l),
    parserLoader: async () => module,
    schemas: Object.fromEntries(CATEGORY_IDS.map((c) => [c, BaseEntrySchema])),
  };
  return { root, deps, out, err, calls: ff.calls, parserCalls };
}

const read = (root: string, rel: string) => readFileSync(join(root, ...rel.split("/")), "utf8");
const json = (root: string, rel: string) => JSON.parse(read(root, rel));

describe("cli: uso y argumentos", () => {
  it("sin subcomando o con subcomando desconocido muestra el uso", async () => {
    const e = env();
    expect(await runCli([], e.deps)).toBe(0);
    expect(await runCli(["bogus"], e.deps)).toBe(1);
    expect(e.err.join("\n")).toContain("Uso:");
  });

  it("R46/T0.6: --category con subconjunto desconocido de categoría falla", async () => {
    const e = env();
    expect(await runCli(["import", "--category", "nope"], e.deps)).toBe(1);
    expect(e.err.join("\n")).toContain("categoría desconocida");
  });

  it("opción desconocida falla", async () => {
    const e = env();
    expect(await runCli(["import", "--wat"], e.deps)).toBe(1);
  });
});

describe("cli import (R41, R42, R48)", () => {
  it("R41/R42: descarga semillas y descubiertas, escribe procedencia y congela el recuento", async () => {
    const e = env();
    expect(await runCli(["import", "--category", "feats"], e.deps)).toBe(0);
    expect(e.calls.map((c) => c.url)).toEqual([INDEX, PAGE_X, PAGE_A, PAGE_B]);
    const prov = json(e.root, "src/data/provenance/feats.json");
    expect(prov.license).toBe("OGL-1.0a");
    expect(prov.expectedCount).toBe(3); // 2 semillas + 1 (parser falso)
    expect(prov.pages.map((p: { url: string }) => p.url).sort()).toEqual(
      [INDEX, PAGE_X, PAGE_B, PAGE_A].sort(),
    );
    expect(existsSync(cachePathFor(join(e.root, ".cache", "srd-raw"), PAGE_A))).toBe(true);
    expect(readdirSync(join(e.root, "reports")).some((f) => f.startsWith("import-"))).toBe(true);
  });

  it("R41: una segunda pasada usa la caché (sin nuevas peticiones)", async () => {
    const e = env();
    await runCli(["import", "--category", "feats"], e.deps);
    const calls = e.calls.length;
    expect(await runCli(["import", "--category", "feats"], e.deps)).toBe(0);
    expect(e.calls).toHaveLength(calls);
  });

  it("subconjunto: añade las semillas del subconjunto (feats:extra)", async () => {
    const e = env();
    await runCli(["import", "--category", "feats:extra"], e.deps);
    expect(e.calls.map((c) => c.url)).toContain(PAGE_X);
  });

  it("sin --category procesa las categorías con semillas", async () => {
    const e = env();
    expect(await runCli(["import"], e.deps)).toBe(0);
    expect(e.out.join("\n")).toContain("feats:");
  });

  it("categoría sin semillas falla con mensaje", async () => {
    const e = env();
    expect(await runCli(["import", "--category", "skills"], e.deps)).toBe(1);
    expect(e.err.join("\n")).toContain("seeds.json");
  });

  it("R48: --verify lista las páginas que difieren y no modifica src/data", async () => {
    const e = env();
    await runCli(["import", "--category", "feats"], e.deps);
    const before = read(e.root, "src/data/provenance/feats.json");
    BODIES[PAGE_A] = "<html>cleave CAMBIADO</html>";
    try {
      const code = await runCli(["import", "--category", "feats", "--verify"], e.deps);
      expect(code).toBe(1);
      expect(e.out.join("\n")).toContain(`DIFIERE ${PAGE_A}`);
    } finally {
      BODIES[PAGE_A] = "<html>cleave</html>";
    }
    expect(read(e.root, "src/data/provenance/feats.json")).toBe(before);
    expect(existsSync(join(e.root, "src/data/feats"))).toBe(false);
  });
});

describe("cli parse (R43-R47, R49)", () => {
  async function imported(opts: Parameters<typeof env>[0] = {}) {
    const e = env(opts);
    await runCli(["import", "--category", "feats"], e.deps);
    // a partir de aquí no hay red
    e.deps.fetch = (() => {
      throw new Error("red prohibida");
    }) as typeof fetch;
    return e;
  }

  it("R43: parsea solo desde la caché (sin red), escribe ficheros ordenados y el índice", async () => {
    const e = await imported({
      parse: (input) => {
        void input;
        return {
          entries: [entry("cleave", "Cleave"), entry("alertness", "Alertness")],
          shardOf: (en) => `feats/${en.id.slice(0, 1)}.json`,
          needsReview: [{ id: "cleave", reason: "dudoso" }],
          excluded: [{ url: PAGE_X, book: "APG", reason: "otro libro" }],
          provenancePatch: { importedKinds: ["feat"] },
        };
      },
    });
    expect(await runCli(["parse", "--category", "feats"], e.deps)).toBe(0);
    expect(json(e.root, "src/data/feats/a.json")).toEqual([entry("alertness", "Alertness")]);
    expect(json(e.root, "src/data/feats/c.json")).toEqual([
      entry("cleave", "Cleave", { needsReview: true }),
    ]);
    const index = read(e.root, "src/data/feats/index.ts");
    expect(index).toContain('file: "feats/a.json"');
    expect(index).toContain('import("./c.json")');
    expect(json(e.root, "src/data/provenance/feats.json").importedKinds).toEqual(["feat"]);
  });

  it("R44: dos parseos con la misma caché dan ficheros idénticos byte a byte", async () => {
    const e = await imported();
    await runCli(["parse", "--category", "feats"], e.deps);
    const first = [
      "src/data/feats/a.json",
      "src/data/feats/c.json",
      "src/data/provenance/feats.json",
      "src/data/feats/index.ts",
    ];
    const snapshot = Object.fromEntries(first.map((f) => [f, read(e.root, f)]));
    expect(await runCli(["parse", "--category", "feats"], e.deps)).toBe(0);
    for (const f of first) expect(read(e.root, f)).toBe(snapshot[f]);
  });

  it("R46: las páginas de otro libro se listan en el informe de importación", async () => {
    const e = await imported();
    await runCli(["parse", "--category", "feats"], e.deps);
    const report = readdirSync(join(e.root, "reports")).find((f) => f.startsWith("import-"))!;
    const text = read(e.root, `reports/${report}`);
    expect(text).toContain(PAGE_X);
    expect(text).toContain("APG");
    expect(text).toContain("clases descartadas: 2");
    expect(text).toContain("cleave: dudoso");
  });

  it("R47: sha256 distinto al registrado falla salvo --accept-drift", async () => {
    const e = await imported();
    writeFileSync(cachePathFor(join(e.root, ".cache", "srd-raw"), PAGE_A), "<html>otro</html>");
    expect(await runCli(["parse", "--category", "feats"], e.deps)).toBe(1);
    expect(e.err.join("\n")).toContain(PAGE_A);
    expect(existsSync(join(e.root, "src/data/feats/a.json"))).toBe(false);
    expect(await runCli(["parse", "--category", "feats", "--accept-drift"], e.deps)).toBe(0);
  });

  it("T0.6: el subconjunto llega al parser y sin subconjunto es undefined", async () => {
    const e = await imported();
    await runCli(["parse", "--category", "feats"], e.deps);
    await runCli(["parse", "--category", "feats:combat"], e.deps);
    expect(e.parserCalls.map((c) => c.subset)).toEqual([undefined, "combat"]);
    expect(e.parserCalls[0]?.config.allowedSections).toEqual(["Benefit"]);
    expect(e.parserCalls[0]?.pages.every((p) => p.html.length > 0)).toBe(true);
  });

  it("sin procedencia o sin caché falla con mensaje accionable", async () => {
    const e = env();
    expect(await runCli(["parse", "--category", "feats"], e.deps)).toBe(1);
    expect(e.err.join("\n")).toContain("data:import");
  });

  it("entrada que no supera el schema: falla agregando errores y no escribe nada", async () => {
    const e = await imported({
      parse: () => ({
        entries: [entry("a", "A", { book: "APG" }), entry("b", "B", { textEn: "<b>x</b>" })],
        shardOf: () => "feats/x.json",
        needsReview: [],
        excluded: [],
      }),
    });
    expect(await runCli(["parse", "--category", "feats"], e.deps)).toBe(1);
    const msg = e.err.join("\n");
    expect(msg).toContain('a: campo "book"');
    expect(msg).toContain('b: campo "textEn"');
    expect(existsSync(join(e.root, "src/data/feats/x.json"))).toBe(false);
  });

  it("R49: aplica overrides tras el parseo y falla si un override es obsoleto", async () => {
    const e = await imported();
    writeFile(
      e.root,
      "src/data/overrides/feats.json",
      stableStringify([
        { id: "cleave", field: "name", value: "Cleave!", reason: "r", evidence: "e" },
      ]),
    );
    expect(await runCli(["parse", "--category", "feats"], e.deps)).toBe(0);
    const [cleave] = (
      json(e.root, "src/data/feats/c.json") as { id: string; name: string }[]
    ).filter((x) => x.id === "cleave");
    expect(cleave?.name).toBe("Cleave!");
    const applied = json(e.root, "src/data/provenance/feats.json").overridesApplied;
    expect(applied).toEqual([{ id: "cleave", field: "name", parsedValue: "Cleave" }]);

    writeFile(
      e.root,
      "src/data/overrides/feats.json",
      stableStringify([
        { id: "cleave", field: "name", value: "Cleave", reason: "r", evidence: "e" },
      ]),
    );
    expect(await runCli(["parse", "--category", "feats"], e.deps)).toBe(1);
    expect(e.err.join("\n")).toContain("obsoleto");
  });

  it("R49: override sin reason falla el parseo", async () => {
    const e = await imported();
    writeFile(
      e.root,
      "src/data/overrides/feats.json",
      stableStringify([{ id: "cleave", field: "name", value: "X", evidence: "e" }]),
    );
    expect(await runCli(["parse", "--category", "feats"], e.deps)).toBe(1);
    expect(e.err.join("\n")).toContain("overrides/feats.json");
  });

  it("categoría sin parser del lote: mensaje claro", async () => {
    const e = await imported();
    e.deps.parserLoader = async () => {
      const { ParserNotImplementedError } =
        await import("../../../scripts/srd/lib/parser-registry");
      throw new ParserNotImplementedError("feats", "scripts/srd/parsers/feats.ts");
    };
    expect(await runCli(["parse", "--category", "feats"], e.deps)).toBe(1);
    expect(e.err.join("\n")).toContain("falta scripts/srd/parsers/feats.ts");
  });
});

describe("cli parse de una categoría por lotes sin subconjunto (R98, R49)", () => {
  /** `spells` es la categoría por lotes: un lote con procedencia (a-d) y un override. */
  async function batched(
    overrideFile: string,
    parse?: (input: ParserInput) => ParserOutput,
  ): Promise<Env> {
    const e = env({
      parse:
        parse ??
        (() => ({
          entries: [entry("acid-arrow", "Acid Arrow"), entry("zone-of-truth", "Zone of Truth")],
          shardOf: (en) => `spells/${en.id.slice(0, 1)}.json`,
          needsReview: [],
          excluded: [],
        })),
    });
    writeFile(
      e.root,
      "scripts/srd/config/seeds.json",
      stableStringify({
        crosscheck: {},
        spells: { urls: [], subsets: { "a-d": [PAGE_A] } },
      }),
    );
    await runCli(["import", "--category", "spells:a-d"], e.deps);
    e.deps.fetch = (() => {
      throw new Error("red prohibida");
    }) as typeof fetch;
    writeFile(
      e.root,
      overrideFile,
      stableStringify([
        { id: "acid-arrow", field: "name", value: "Acid Arrow!", reason: "r", evidence: "e" },
      ]),
    );
    return e;
  }

  it("R98: anota el override en la procedencia de su lote y no crea provenance/spells.json", async () => {
    const e = await batched("src/data/overrides/spells/a-d.json");
    expect(await runCli(["parse", "--category", "spells"], e.deps)).toBe(0);
    expect(existsSync(join(e.root, "src/data/provenance/spells.json"))).toBe(false);
    expect(json(e.root, "src/data/provenance/spells/a-d.json").overridesApplied).toEqual([
      { id: "acid-arrow", field: "name", parsedValue: "Acid Arrow" },
    ]);
    expect(json(e.root, "src/data/spells/a.json")[0].name).toBe("Acid Arrow!");
  });

  it("R98: un override fuera de overrides/spells/<lote>.json falla en vez de perderse", async () => {
    const e = await batched("src/data/overrides/spells.json");
    expect(await runCli(["parse", "--category", "spells"], e.deps)).toBe(1);
    expect(e.err.join("\n")).toContain("overrides/spells/<lote>.json");
  });

  it("R98: importedKinds en un parseo completo por lotes falla con mensaje claro", async () => {
    const e = await batched("src/data/overrides/spells/a-d.json", () => ({
      entries: [entry("acid-arrow", "Acid Arrow")],
      shardOf: () => "spells/a.json",
      needsReview: [],
      excluded: [],
      provenancePatch: { importedKinds: ["spell"] },
    }));
    expect(await runCli(["parse", "--category", "spells"], e.deps)).toBe(1);
    expect(e.err.join("\n")).toContain("importedKinds");
  });
});

describe("cli validate (R51, R52)", () => {
  it("R51: sin datos termina con código 0", async () => {
    const e = env();
    writeCategoryIndexes(e.root);
    expect(await runCli(["validate"], e.deps)).toBe(0);
  });

  it("R51/R52: con errores devuelve != 0 y agrupa todos por categoría, regla e id", async () => {
    const e = env();
    writeFile(
      e.root,
      "src/data/feats/f.json",
      stableStringify([entry("wrong", "Cleave", { book: "APG" }), entry("ok", "Ok")]),
    );
    writeFile(
      e.root,
      "src/data/skills.json",
      stableStringify([entry("x", "Y", { source: "https://e.com" })]),
    );
    writeCategoryIndexes(e.root);
    expect(await runCli(["validate"], e.deps)).toBe(1);
    const text = e.err.join("\n");
    expect(text).toContain("[feats]");
    expect(text).toContain("[skills]");
    expect(text).toContain("schema.book");
    expect(text).toContain("ids.slug");
    expect(text).toContain("schema.source");
    expect(text).toContain("wrong:");
  });

  it("un JSON roto se informa como hallazgo y no detiene la validación", async () => {
    const e = env();
    writeFile(e.root, "src/data/feats/f.json", "{no json");
    writeFile(e.root, "src/data/skills.json", stableStringify([entry("x", "Y", { book: "APG" })]));
    writeCategoryIndexes(e.root);
    expect(await runCli(["validate"], e.deps)).toBe(1);
    const text = e.err.join("\n");
    expect(text).toContain("load.json");
    expect(text).toContain("[skills]");
  });

  it("un index.ts desactualizado es un error (index.stale)", async () => {
    const e = env();
    writeCategoryIndexes(e.root);
    writeFile(e.root, "src/data/feats/f.json", stableStringify([entry("ok", "Ok")]));
    expect(await runCli(["validate"], e.deps)).toBe(1);
    expect(e.err.join("\n")).toContain("index.stale");
  });
});

describe("cli glossary (R36)", () => {
  it("genera glossary.es.json desde los shards, idéntico byte a byte si no cambian", async () => {
    const e = env();
    const g = (es: string) => ({ es, verified: false, origin: "draft", kind: "term" });
    writeFile(
      e.root,
      "src/data/glossary/terms.es.json",
      stableStringify({ "term:b": g("B"), "term:a": g("A") }),
    );
    writeFile(e.root, "src/data/glossary/spells/a.es.json", stableStringify({ "term:c": g("C") }));
    expect(await runCli(["glossary"], e.deps)).toBe(0);
    const first = read(e.root, "src/data/glossary.es.json");
    expect(Object.keys(JSON.parse(first))).toEqual(["term:a", "term:b", "term:c"]);
    expect(first.endsWith("\n")).toBe(true);
    expect(await runCli(["glossary"], e.deps)).toBe(0);
    expect(read(e.root, "src/data/glossary.es.json")).toBe(first);
  });

  it("una clave repetida entre shards falla", async () => {
    const e = env();
    const g = { es: "A", verified: false, origin: "draft", kind: "term" };
    writeFile(e.root, "src/data/glossary/a.es.json", stableStringify({ "term:a": g }));
    writeFile(e.root, "src/data/glossary/b.es.json", stableStringify({ "term:a": g }));
    expect(await runCli(["glossary"], e.deps)).toBe(1);
    expect(e.err.join("\n")).toContain("duplicada");
  });

  it("R36: validate falla si el glossary.es.json commiteado difiere del generado", async () => {
    const e = env();
    const g = { es: "A", verified: false, origin: "draft", kind: "term" };
    writeFile(e.root, "src/data/glossary/terms.es.json", stableStringify({ "term:a": g }));
    writeFile(e.root, "src/data/glossary.es.json", "{}\n");
    writeCategoryIndexes(e.root);
    expect(await runCli(["validate"], e.deps)).toBe(1);
    expect(e.err.join("\n")).toContain("glossary.stale");
    await runCli(["glossary"], e.deps);
    e.err.length = 0;
    expect(await runCli(["validate"], e.deps)).toBe(0);
  });
});

describe("cli sample (R53, R54)", () => {
  it("escribe reports/srd-sample-<seed>.md y es idéntico con la misma semilla", async () => {
    const e = env();
    const feats = Array.from({ length: 20 }, (_, i) => entry(`feat-${i}`, `Feat ${i}`));
    writeFile(e.root, "src/data/feats/f.json", stableStringify(feats));
    writeCategoryIndexes(e.root);
    expect(await runCli(["sample", "--seed", "7", "--per-category", "3"], e.deps)).toBe(0);
    const first = read(e.root, "reports/srd-sample-7.md");
    expect(first).toContain("semilla 7");
    expect((first.match(/^### feats \//gm) ?? []).length).toBe(3);
    await runCli(["sample", "--seed", "7", "--per-category", "3"], e.deps);
    expect(read(e.root, "reports/srd-sample-7.md")).toBe(first);
    await runCli(["sample", "--seed", "8", "--per-category", "3"], e.deps);
    expect(read(e.root, "reports/srd-sample-8.md")).not.toBe(first);
  });

  it("--crosscheck descarga la página de contraste con el fetch inyectado", async () => {
    const e = env();
    writeFile(e.root, "src/data/feats/f.json", stableStringify([entry("cleave", "Cleave")]));
    writeCategoryIndexes(e.root);
    BODIES["https://www.d20pfsrd.com/feats/cleave"] =
      "<html><body><p>Cleave text</p></body></html>";
    try {
      expect(
        await runCli(["sample", "--seed", "1", "--per-category", "5", "--crosscheck"], e.deps),
      ).toBe(0);
    } finally {
      delete BODIES["https://www.d20pfsrd.com/feats/cleave"];
    }
    expect(read(e.root, "reports/srd-sample-1.md")).toContain("similitud 1.00");
  });

  it("parámetros inválidos fallan", async () => {
    const e = env();
    expect(await runCli(["sample", "--seed", "x"], e.deps)).toBe(1);
  });
});
