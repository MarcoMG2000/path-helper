import { describe, expect, it } from "vitest";
import { countsRule } from "../../../src/data/integrity/counts";
import type { LoadedDataset } from "../../../src/data/integrity/types";
import type { ProvenancePart } from "../../../src/data/schema/provenance";
import { baseEntry } from "../helpers/entries";
import { baseContext, dataset } from "../helpers/integrity";

// R26 (recuentos congelados), R98 (unión de la procedencia por lotes) y R99 (lotes de conjuros),
// con datasets sintéticos. El contraste con los datos reales está en cross-categories.test.ts.

const part = (
  category: string,
  extra: Record<string, unknown> = {},
  file = `provenance/${category}.json`,
): ProvenancePart => ({
  file,
  data: {
    license: "OGL-1.0a",
    category,
    importerVersion: "1",
    humanReviewed: false,
    pages: [],
    ...extra,
  },
});

const entry = (id: string): ReturnType<typeof baseEntry> => baseEntry({ id, name: id });

const batches = {
  batches: [
    { id: "a-m", from: "a", to: "m" },
    { id: "n-z", from: "n", to: "z" },
  ],
  expectedCountByBatch: { "a-m": 2, "n-z": 1 },
};

function spellsDataset(
  ids: string[],
  frozen: Record<string, number> = { "a-m": 2, "n-z": 1 },
  total: number | undefined = 3,
  files: { batch: string; extra?: Record<string, unknown> }[] = [
    { batch: "a-m" },
    { batch: "n-z" },
  ],
): LoadedDataset {
  return dataset({
    entries: { spells: ids.map(entry) },
    provenanceParts: {
      spells: [
        part(
          "spells",
          total === undefined ? {} : { expectedCount: total },
          "provenance/spells/index.json",
        ),
        ...files.map((f) =>
          part(
            "spells",
            {
              batch: f.batch,
              expectedCountByBatch: { [f.batch]: frozen[f.batch] ?? 0 },
              ...f.extra,
            },
            `provenance/spells/${f.batch}.json`,
          ),
        ),
      ],
    },
  });
}

const run = (data: LoadedDataset, spellBatches: unknown = batches): string[] =>
  countsRule(data, baseContext({ config: { spellBatches } })).map((i) => i.rule);

describe("counts: R26", () => {
  it("caso verde: el recuento coincide con el congelado", () => {
    const data = dataset({
      entries: { feats: [entry("a"), entry("b")] },
      provenanceParts: { feats: [part("feats", { expectedCount: 2 })] },
    });
    expect(countsRule(data, baseContext())).toEqual([]);
  });

  it("R26: un recuento distinto del congelado falla nombrando categoría y cifras", () => {
    const data = dataset({
      entries: { feats: [entry("a")] },
      provenanceParts: { feats: [part("feats", { expectedCount: 2 })] },
    });
    const [found, ...rest] = countsRule(data, baseContext());
    expect(rest).toEqual([]);
    expect(found).toMatchObject({ category: "feats", rule: "counts.count" });
    expect(found!.message).toContain("1");
    expect(found!.message).toContain("2");
  });

  it("R26: una categoría cargada y vacía con expectedCount > 0 falla", () => {
    const data = dataset({
      entries: { races: [] },
      provenanceParts: { races: [part("races", { expectedCount: 7 })] },
    });
    expect(countsRule(data, baseContext()).map((i) => i.rule)).toEqual(["counts.count"]);
  });

  it("una categoría con datos y sin procedencia falla (todas las categorías presentes en provenance)", () => {
    const data = dataset({ entries: { skills: [entry("a")] } });
    const [found] = countsRule(data, baseContext());
    expect(found).toMatchObject({ category: "skills", rule: "counts.no-provenance" });
  });

  it("spell-lists con datos y sin procedencia falla", () => {
    const data = dataset({ spellLists: { cleric: {} } });
    expect(countsRule(data, baseContext()).map((i) => [i.category, i.rule])).toEqual([
      ["spell-lists", "counts.no-provenance"],
    ]);
  });

  it("una procedencia sin expectedCount falla", () => {
    const data = dataset({
      entries: { feats: [entry("a")] },
      provenanceParts: { feats: [part("feats")] },
    });
    expect(countsRule(data, baseContext()).map((i) => i.rule)).toEqual(["counts.no-expected"]);
  });

  it("R98: un fichero de procedencia sin license se informa", () => {
    const broken = part("feats", { expectedCount: 1 });
    delete (broken.data as Record<string, unknown>)["license"];
    const data = dataset({
      entries: { feats: [entry("a")] },
      provenanceParts: { feats: [broken] },
    });
    const [found] = countsRule(data, baseContext());
    expect(found).toMatchObject({ category: "feats", rule: "counts.provenance" });
    expect(found!.message).toContain("license");
  });

  it("magic-items se delega en R66/R67: con procedencia no produce hallazgos aquí", () => {
    const data = dataset({
      entries: { "magic-items": [entry("a")] },
      provenanceParts: {
        "magic-items": [part("magic-items", { expectedCountByKind: { ring: 5 } })],
      },
    });
    expect(countsRule(data, baseContext())).toEqual([]);
  });

  it("magic-items con datos y sin procedencia sí falla", () => {
    const data = dataset({ entries: { "magic-items": [entry("a")] } });
    expect(countsRule(data, baseContext()).map((i) => i.rule)).toEqual(["counts.no-provenance"]);
  });

  it("un dataset vacío no produce hallazgos", () => {
    expect(countsRule(dataset(), baseContext())).toEqual([]);
  });
});

describe("counts: R98 y R99 (lotes de conjuros)", () => {
  it("caso verde: unión de la procedencia por lotes, recuentos y suma", () => {
    expect(run(spellsDataset(["acid-arrow", "bless", "pit"]))).toEqual([]);
  });

  it("R99: el recuento real de un lote difiere del congelado", () => {
    const data = spellsDataset(["acid-arrow", "pit", "zone"], { "a-m": 2, "n-z": 1 });
    expect(run(data)).toEqual(["counts.batch-count", "counts.batch-count"]);
  });

  it("R99: la suma de expectedCountByBatch difiere del expectedCount total", () => {
    const data = spellsDataset(["acid-arrow", "bless", "pit"], { "a-m": 2, "n-z": 1 }, 4);
    expect(run(data)).toContain("counts.batch-sum");
    expect(run(data)).toContain("counts.count");
  });

  it("R99: un lote del config sin recuento congelado, y viceversa", () => {
    const missing = spellsDataset(["acid-arrow", "bless", "pit"], { "a-m": 2 }, 3, [
      { batch: "a-m" },
    ]);
    expect(run(missing)).toContain("counts.batch-count");
    const extra = spellsDataset(
      ["acid-arrow", "bless", "pit"],
      { "a-m": 2, "n-z": 1, "x-y": 0 },
      3,
      [{ batch: "a-m" }, { batch: "n-z" }, { batch: "x-y" }],
    );
    const found = countsRule(extra, baseContext({ config: { spellBatches: batches } }));
    expect(found.some((i) => i.id === "x-y" && i.rule === "counts.batch-count")).toBe(true);
  });

  it("R99: rangos solapados en spell-batches.json", () => {
    const overlapped = {
      batches: [
        { id: "a-m", from: "a", to: "m" },
        { id: "m-z", from: "m", to: "z" },
      ],
      expectedCountByBatch: { "a-m": 2, "m-z": 1 },
    };
    expect(run(spellsDataset(["acid-arrow", "bless", "pit"]), overlapped)).toContain(
      "counts.batch-ranges",
    );
  });

  it("R99: hueco entre rangos o rango que no cubre a-z", () => {
    const gap = {
      batches: [
        { id: "a-k", from: "a", to: "k" },
        { id: "n-z", from: "n", to: "z" },
      ],
      expectedCountByBatch: { "a-k": 2, "n-z": 1 },
    };
    const gapIssues = countsRule(
      spellsDataset(["acid-arrow", "bless", "pit"]),
      baseContext({ config: { spellBatches: gap } }),
    );
    expect(gapIssues.map((i) => i.rule)).toContain("counts.batch-ranges");
    expect(gapIssues.map((i) => i.message).join(" ")).toContain("hueco");
    const short = {
      batches: [{ id: "b-m", from: "b", to: "m" }],
      expectedCountByBatch: { "b-m": 3 },
    };
    expect(run(spellsDataset(["bless"]), short)).toContain("counts.batch-ranges");
  });

  it("R99: un conjuro cuyo id empieza por un carácter fuera de los lotes falla nombrándolo", () => {
    const data = spellsDataset(["acid-arrow", "bless", "pit", "3d-spell"]);
    const found = countsRule(data, baseContext({ config: { spellBatches: batches } }));
    expect(found.find((i) => i.rule === "counts.batch-membership")?.id).toBe("3d-spell");
  });

  it("R99: la configuración inválida o ausente se informa", () => {
    expect(
      countsRule(spellsDataset(["acid-arrow", "bless", "pit"]), baseContext()).map((i) => i.rule),
    ).toEqual(["counts.batch-config"]);
    expect(run(spellsDataset(["acid-arrow", "bless", "pit"]), { batches: [] })).toEqual([
      "counts.batch-config",
    ]);
  });

  it("R99: el config que declara un recuento distinto del congelado se detecta", () => {
    const stale = { ...batches, expectedCountByBatch: { "a-m": 9, "n-z": 1 } };
    expect(run(spellsDataset(["acid-arrow", "bless", "pit"]), stale)).toEqual([
      "counts.batch-config-drift",
    ]);
  });

  it("R98: un lote duplicado, una página repetida o un fichero sin license invalidan la unión", () => {
    const duplicated = spellsDataset(["acid-arrow", "bless", "pit"], { "a-m": 2, "n-z": 1 }, 3, [
      { batch: "a-m" },
      { batch: "a-m" },
    ]);
    const [dup] = countsRule(duplicated, baseContext({ config: { spellBatches: batches } }));
    expect(dup).toMatchObject({ category: "spells", rule: "counts.provenance" });
    expect(dup!.message).toContain("duplicado");

    const noLicense = spellsDataset(["acid-arrow", "bless", "pit"]);
    delete (noLicense.provenanceParts.spells![1]!.data as Record<string, unknown>)["license"];
    const [lic] = countsRule(noLicense, baseContext({ config: { spellBatches: batches } }));
    expect(lic).toMatchObject({ rule: "counts.provenance" });
    expect(lic!.message).toContain("license");
  });
});
