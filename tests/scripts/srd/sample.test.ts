import { describe, expect, it } from "vitest";
import {
  CROSSCHECK_THRESHOLD,
  applyCrosscheck,
  buildSample,
  crosscheckUrl,
  renderSample,
  type SampleSource,
} from "../../../scripts/srd/lib/sample";

type Rec = Record<string, unknown>;

function entry(id: string, extra: Rec = {}): Rec {
  return {
    id,
    name: id.toUpperCase(),
    textEn: `Text of ${id}.`,
    source: `https://www.aonprd.com/x?ItemName=${id}`,
    sourceRef: "PRPG Core Rulebook pg. 1",
    book: "CRB",
    ...extra,
  };
}

const range = (n: number, make: (i: number) => Rec): Rec[] =>
  Array.from({ length: n }, (_, i) => make(i));

function source(extra: Partial<SampleSource> = {}): SampleSource {
  const schools = ["abjuration", "evocation", "necromancy"];
  return {
    entries: {
      classes: [entry("druid"), entry("rogue")],
      feats: range(20, (i) => entry(`feat-${String(i).padStart(2, "0")}`)),
      skills: range(6, (i) => entry(`skill-${i}`)),
      spells: [
        ...range(9, (i) =>
          entry(`spell-${i}`, {
            school: schools[i % 3],
            levels: i === 4 ? { sorcerer: 1, wizard: 1 } : { cleric: 1, sorcerer: 2 },
            castingTime: { unit: i === 2 ? "other" : "standard" },
          }),
        ),
      ],
      "magic-items": [
        entry("keen", { kind: "weapon-ability", reprintedIn: ["Ultimate Equipment pg. 1"] }),
        entry("flaming", { kind: "weapon-ability", reprintedIn: [] }),
        entry("ring-of-protection", { kind: "ring", reprintedIn: [] }),
        entry("wand-of-x", { kind: "wand", reprintedIn: ["UE"] }),
      ],
    },
    summaries: {
      feats: {
        "feat-00": { summaryEs: "x", status: "draft" },
        "feat-01": { summaryEs: "y", status: "reviewed" },
      },
    },
    glossary: {
      "feats:feat-00": { es: "Dote 0", verified: false },
      "classes:druid": { es: "Druida", verified: true },
      "term:a": { es: "A", verified: false },
    },
    overridesApplied: { skills: [{ id: "skill-3", field: "name" }] },
    ...extra,
  };
}

const ids = (set: ReturnType<typeof buildSample>, category: string) =>
  set.items.filter((i) => i.category === category).map((i) => i.id);

describe("buildSample (R53, R54)", () => {
  it("R53: todas las clases, las entradas con override/needsReview y k aleatorias por categoría", () => {
    const withReview = source();
    (withReview.entries.feats as Rec[])[7] = entry("feat-07", { needsReview: true });
    const set = buildSample(withReview, { seed: 42, perCategory: 3 });
    expect(ids(set, "classes")).toEqual(["druid", "rogue"]);
    expect(ids(set, "skills")).toContain("skill-3"); // override
    expect(ids(set, "feats")).toContain("feat-07"); // needsReview
    const featReasons = set.items.filter((i) => i.category === "feats").map((i) => i.reasons);
    expect(featReasons.flat().filter((r) => r === "aleatoria")).toHaveLength(3);
    expect(ids(set, "feats")).toHaveLength(4);
    expect(set.items.find((i) => i.id === "druid")?.reasons).toEqual(["clase"]);
  });

  it("R54: misma semilla y datos -> informe idéntico; otra semilla -> distinto", () => {
    const a = renderSample(buildSample(source(), { seed: 42, perCategory: 3 }));
    expect(renderSample(buildSample(source(), { seed: 42, perCategory: 3 }))).toBe(a);
    expect(renderSample(buildSample(source(), { seed: 43, perCategory: 3 }))).not.toBe(a);
  });

  it("R54: el resultado no depende del orden de las entradas de entrada", () => {
    const reversed = source();
    reversed.entries.feats = [...(reversed.entries.feats as Rec[])].reverse();
    expect(renderSample(buildSample(reversed, { seed: 5, perCategory: 4 }))).toBe(
      renderSample(buildSample(source(), { seed: 5, perCategory: 4 })),
    );
  });

  it("k mayor que las entradas disponibles toma todas sin repetir", () => {
    const set = buildSample(source(), { seed: 1, perCategory: 100 });
    expect(ids(set, "skills")).toHaveLength(6);
    expect(new Set(set.items.map((i) => `${i.category}:${i.id}`)).size).toBe(set.items.length);
  });
});

describe("estratos fijos y contadores", () => {
  const set = buildSample(source(), { seed: 42, perCategory: 0 });

  it("R89: al menos una entrada de cada kind de magic-items aunque k sea 0", () => {
    const kinds = set.items.filter((i) => i.category === "magic-items").map((i) => i.entry["kind"]);
    expect(new Set(kinds)).toEqual(new Set(["weapon-ability", "ring", "wand"]));
  });

  it("R103: un conjuro de cada escuela y uno solo sorcerer/wizard", () => {
    const spells = set.items.filter((i) => i.category === "spells");
    expect(new Set(spells.map((s) => s.entry["school"]))).toEqual(
      new Set(["abjuration", "evocation", "necromancy"]),
    );
    expect(spells.some((s) => s.reasons.includes("solo sorcerer/wizard"))).toBe(true);
    expect(spells.find((s) => s.reasons.includes("solo sorcerer/wizard"))?.id).toBe("spell-4");
  });

  it("R103: sin conjuros solo sorcerer/wizard no hay ese estrato", () => {
    const src = source();
    src.entries.spells = (src.entries.spells as Rec[]).map((s) => ({
      ...s,
      levels: { cleric: 1 },
    }));
    const noOnly = buildSample(src, { seed: 1, perCategory: 0 });
    expect(noOnly.items.some((i) => i.reasons.includes("solo sorcerer/wizard"))).toBe(false);
    expect(noOnly.counters.spells?.onlySorcererWizard).toBe(0);
  });

  it("R57: recuentos por categoría, resúmenes draft, glosario sin verificar y overrides", () => {
    expect(set.counters.entriesByCategory).toMatchObject({ classes: 2, feats: 20, spells: 9 });
    expect(set.counters.summariesDraft).toBe(1);
    expect(set.counters.glossaryUnverified).toBe(2);
    expect(set.counters.overridesApplied).toBe(1);
  });

  it("R90: magic-items por kind, con reprintedIn y huecos de efectos (R88, inyectado)", () => {
    const gaps = buildSample(
      source({
        effectGaps: (e) => e.filter((x) => x["id"] === "keen").map((x) => x["id"] as string),
      }),
      {
        seed: 1,
        perCategory: 0,
      },
    );
    expect(gaps.counters.magicItems).toEqual({
      byKind: { ring: 1, wand: 1, "weapon-ability": 2 },
      reprinted: 2,
      effectGaps: ["keen"],
    });
    expect(set.counters.magicItems?.effectGaps).toEqual([]);
  });

  it("R103: spells por clave de nivel, por escuela y con campos kind other", () => {
    expect(set.counters.spells).toEqual({
      byLevelKey: { cleric: 8, sorcerer: 9, wizard: 1 },
      bySchool: { abjuration: 3, evocation: 3, necromancy: 3 },
      withOtherFields: 1,
      onlySorcererWizard: 1,
    });
  });
});

describe("renderSample (R55, R57)", () => {
  const src = source();
  (src.entries.feats as Rec[])[0] = entry("feat-00", { needsReview: true }); // siempre en la muestra
  const text = renderSample(buildSample(src, { seed: 42, perCategory: 1 }));

  it("R55: cada entrada muestra id, nombres EN/ES con verificado, URL, campos, resumen y textEn", () => {
    expect(text).toContain("### feats / feat-00");
    expect(text).toContain("- Nombre EN: FEAT-00");
    expect(text).toContain("- Nombre ES: Dote 0 (sin verificar)");
    expect(text).toContain("- Nombre ES: Druida (verificado)");
    expect(text).toContain("- Fuente: https://www.aonprd.com/x?ItemName=druid");
    expect(text).toContain('"sourceRef": "PRPG Core Rulebook pg. 1"');
    expect(text).not.toContain('"textEn"');
    expect(text).toContain("> Text of druid.");
    expect(text).toContain("Resumen ES (draft): x");
    expect(text).toContain("(sin resumen)");
    expect(text).toContain("- [ ] OK  - [ ] Error");
  });

  it("R57: el resumen inicial lleva los contadores", () => {
    expect(text).toContain("| classes | 2 |");
    expect(text).toContain("Resúmenes ES en estado draft: 1");
    expect(text).toContain("Claves de glosario con verified: false: 2");
    expect(text).toContain("Overrides aplicados: 1");
    expect(text).toContain("Por kind: ring: 1, wand: 1, weapon-ability: 2");
    expect(text).toContain("Por escuela: abjuration: 3");
  });
});

describe("applyCrosscheck (R56)", () => {
  it("construye la URL con {id}, {slug} y {name}", () => {
    const item = buildSample(source(), { seed: 1, perCategory: 0 }).items[0]!;
    expect(crosscheckUrl("https://x/{id}/{slug}/{name}", item)).toBe("https://x/druid/druid/DRUID");
  });

  it("R56: similitud alta pasa, < 0,9 es sospechosa y sin plantilla o con fallo = sin contraste", async () => {
    const set = buildSample(source(), { seed: 42, perCategory: 0 });
    const fetched: string[] = [];
    const result = await applyCrosscheck(set, {
      templates: { classes: "https://www.d20pfsrd.com/classes/{id}" },
      fetchText: async (url) => {
        fetched.push(url);
        if (url.endsWith("druid")) return "text of DRUID"; // mismo texto normalizado
        throw new Error("404");
      },
    });
    const druid = result.items.find((i) => i.id === "druid")!;
    expect(druid.crosscheck).toMatchObject({ similarity: 1, suspicious: false });
    const rogue = result.items.find((i) => i.id === "rogue")!;
    expect(rogue.crosscheck).toEqual({ url: "https://www.d20pfsrd.com/classes/rogue" });
    expect(result.items.find((i) => i.category === "magic-items")?.crosscheck).toEqual({});
    expect(fetched).toEqual([
      "https://www.d20pfsrd.com/classes/druid",
      "https://www.d20pfsrd.com/classes/rogue",
    ]);

    const different = await applyCrosscheck(set, {
      templates: { classes: "https://www.d20pfsrd.com/classes/{id}" },
      fetchText: async () => "completely different content here",
    });
    const flagged = different.items.find((i) => i.id === "druid")!;
    expect(flagged.crosscheck?.suspicious).toBe(true);
    expect(flagged.crosscheck?.similarity).toBeLessThan(CROSSCHECK_THRESHOLD);
    const md = renderSample(different);
    expect(md).toContain("SOSPECHOSA");
    expect(renderSample(result)).toContain("sin contraste");
  });
});
