import { describe, expect, it } from "vitest";
import { INTEGRITY_RULES, runIntegrity } from "../../../src/data/integrity";
import { baseEntry } from "../helpers/entries";
import { baseContext, dataset } from "../helpers/integrity";

describe("runIntegrity (R52, R3-R8)", () => {
  it("registra todas las reglas del design en orden", () => {
    expect(INTEGRITY_RULES.map((r) => r.name)).toEqual([
      "schema",
      "ids",
      "book-filter",
      "class-tables",
      "class-refs",
      "feat-prereqs",
      "spell-lists",
      "domain-refs",
      "magic-refs",
      "counts",
      "summaries",
      "glossary",
      "overrides",
    ]);
  });

  it("R52: un dataset vacío no produce hallazgos", () => {
    expect(runIntegrity(dataset(), baseContext())).toEqual([]);
  });

  it("R52: agrega los errores de varias categorías y reglas sin detenerse en el primero", () => {
    const data = dataset({
      entries: {
        feats: [baseEntry({ book: "APG", id: "wrong" }), baseEntry({ textEn: "<b>x</b>" })],
        skills: [baseEntry({ source: "https://example.com/x" })],
      },
    });
    const issues = runIntegrity(data, baseContext());
    const rules = new Set(issues.map((i) => i.rule));
    expect(rules).toContain("schema.book");
    expect(rules).toContain("schema.textEn");
    expect(rules).toContain("schema.source");
    expect(rules).toContain("ids.slug");
    expect(rules).toContain("book.not-crb");
    expect(new Set(issues.map((i) => i.category))).toEqual(new Set(["feats", "skills"]));
  });

  it("R3/R6/R7/R8: la regla schema informa cada campo con su regla", () => {
    const data = dataset({
      entries: {
        feats: [
          baseEntry({ book: "BEST" }),
          baseEntry({ id: "b", source: "https://x.org/a" }),
          baseEntry({ id: "c", sourceRef: "Other 1" }),
          baseEntry({ id: "d", textEn: "<p>x</p>" }),
        ],
      },
    });
    const rules = runIntegrity(data, baseContext())
      .filter((i) => i.rule.startsWith("schema"))
      .map((i) => i.rule);
    expect(rules).toEqual(["schema.book", "schema.source", "schema.sourceRef", "schema.textEn"]);
  });

  it("opción categories: filtra hallazgos de otras categorías y los globales", () => {
    const data = dataset({
      entries: { feats: [baseEntry({ id: "wrong" })], skills: [baseEntry({ id: "wrong" })] },
    });
    const issues = runIntegrity(data, baseContext(), { categories: ["skills"] });
    expect(issues.every((i) => i.category === "skills")).toBe(true);
    expect(issues.length).toBeGreaterThan(0);
  });

  it("una regla que lanza se convierte en hallazgo y el resto sigue", () => {
    const data = dataset({ entries: { feats: [baseEntry({ id: "wrong" })] } });
    // un schema roto en el contexto hace lanzar a la regla schema
    const ctx = baseContext({
      schemas: {
        feats: {
          safeParse() {
            throw new Error("boom");
          },
        } as never,
      },
    });
    const issues = runIntegrity(data, ctx);
    expect(issues.some((i) => i.rule === "integrity.crashed" && /boom/.test(i.message))).toBe(true);
    expect(issues.some((i) => i.rule === "ids.slug")).toBe(true);
  });
});
