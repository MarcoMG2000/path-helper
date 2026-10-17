import { describe, expect, it } from "vitest";
import { bookFilterRule } from "../../../src/data/integrity/book-filter";
import { baseEntry } from "../helpers/entries";
import { baseContext, dataset } from "../helpers/integrity";

describe("book-filter (R27)", () => {
  it("R27: una entrada de otro libro falla", () => {
    const data = dataset({
      entries: { feats: [baseEntry({ book: "APG", sourceRef: "Advanced Player's Guide pg. 9" })] },
    });
    const issues = bookFilterRule(data, baseContext());
    expect(issues.map((i) => i.rule).sort()).toEqual(["book.not-crb", "book.source-ref"]);
    expect(issues[0]).toMatchObject({ category: "feats", id: "power-attack" });
  });

  it("R27: caso verde (todas las categorías con entradas CRB)", () => {
    const data = dataset({
      entries: { feats: [baseEntry()], spells: [baseEntry({ id: "magic-missile" })] },
    });
    expect(bookFilterRule(data, baseContext())).toEqual([]);
  });

  it("R27: sourceRef ajeno con book CRB también falla", () => {
    const data = dataset({ entries: { gear: [baseEntry({ sourceRef: "Ultimate Equipment" })] } });
    expect(bookFilterRule(data, baseContext()).map((i) => i.rule)).toEqual(["book.source-ref"]);
  });
});
