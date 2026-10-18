import { describe, expect, it } from "vitest";
import { loadDataset } from "../../../scripts/srd/lib/load-dataset";
import {
  FOREIGN_PATTERNS,
  FOREIGN_TEXT_ALLOWLIST,
  createForeignTextRule,
  foreignTextRule,
  scanForeignText,
  type ForeignTextException,
} from "../../../src/data/integrity/foreign-text";
import { CATEGORY_IDS, type EntryCategory } from "../../../src/data/schema/common";
import { ROOT } from "../../project/helpers";
import { baseEntry } from "../helpers/entries";
import { baseContext, dataset } from "../helpers/integrity";

const ctx = baseContext();
const ruleIds = (issues: { rule: string }[]) => issues.map((i) => i.rule);

describe("foreign-text (R27: sin texto de otros libros en ninguna categoría)", () => {
  it("R27: una inyección sintética de texto no-CRB falla en CADA categoría de entradas", () => {
    const categories = CATEGORY_IDS.filter((c) => c !== "spell-lists") as EntryCategory[];
    for (const category of categories) {
      const data = dataset({
        entries: {
          [category]: [
            baseEntry({
              id: "injected",
              textEn:
                "Choose a one-handed firearm. If a warpriest takes this feat, see Ultimate Combat.",
            }),
          ],
        },
      });
      const issues = foreignTextRule(data, ctx);
      expect(ruleIds(issues).sort(), category).toEqual([
        "foreign-text.firearms",
        "foreign-text.other-book",
        "foreign-text.other-class",
      ]);
      expect(issues.every((i) => i.category === category && i.id === "injected")).toBe(true);
    }
  });

  it("R27: cada palabra guía detecta su ejemplo (y el mensaje cita la coincidencia)", () => {
    const cases: [string, string, string][] = [
      [
        "other-book",
        "As described in the Advanced Player's Guide, a witch",
        "Advanced Player's Guide",
      ],
      ["other-book", "See Ultimate Magic pg. 12.", "Ultimate Magic"],
      [
        "other-book",
        "Nethys Note: according to the Monster Summoner's Handbook pg. 18",
        "Monster Summoner's Handbook",
      ],
      ["other-book-abbreviation", "Source APG pg. 9.", "APG"],
      ["other-class", "Antipaladins may only summon evil creatures.", "Antipaladins"],
      ["other-class", "an inquisitor or paladin", "inquisitor"],
      ["other-rule", "Instead, a druid may choose a subdomain.", "subdomain"],
      ["other-rule", "Add your archetype features.", "archetype"],
      ["firearms", "A musket deals 1d12 damage.", "musket"],
      ["aon-editorial", "The full list can be found **here**.", "**here**"],
      ["aon-editorial", "Nethys Note: something", "Nethys"],
      [
        "aon-editorial",
        "You can find the full list of available Improved Familiars here.",
        "full list",
      ],
      [
        "other-book-content",
        "At 6th level, he adds Crossbow Mastery to the list.",
        "Crossbow Mastery",
      ],
      ["other-book-content", "access to druidic herbalism", "druidic herbalism"],
      ["setting", "Humans (or Taldane, in the case of Chelaxians)", "Taldane"],
    ];
    for (const [pattern, text, shown] of cases) {
      const found = scanForeignText({ textEn: text });
      expect(
        found.some((f) => f.pattern === pattern),
        `${pattern}: ${text}`,
      ).toBe(true);
      const issues = foreignTextRule(
        dataset({ entries: { feats: [baseEntry({ textEn: text })] } }),
        ctx,
      );
      const issue = issues.find((i) => i.rule === `foreign-text.${pattern}`);
      expect(issue?.message, `${pattern}: ${text}`).toContain(shown);
    }
  });

  it("R27: mira también las variantes y los rasgos (cualquier `textEn` anidado)", () => {
    const entry = baseEntry({
      id: "feather-token",
      textEn: "A token.",
      variants: [{ id: "x", textEn: "Works as in Ultimate Combat." }],
      traits: [{ name: "Languages", textEn: "Common, or Taldane." }],
    });
    const found = scanForeignText(entry);
    expect(found.map((f) => `${f.field}:${f.pattern}`).sort()).toEqual([
      "traits.0.textEn:setting",
      "variants.0.textEn:other-book",
    ]);
  });

  it("R27: caso verde, menciones normales del CRB que NO son contenido de otros libros", () => {
    const text = [
      "A djinni (see the Pathfinder RPG Bestiary) can be called from the Plane of Air.",
      "Throw a flask of alchemist's fire. Religion (gods and goddesses, mythic history).",
      "Treasure hunters and miners; fortune-tellers, so-called oracles; the staff of the magi.",
      "He may switch targets; the tribe's shaman. Use the *summon monster* spell.",
    ].join(" ");
    expect(scanForeignText({ textEn: text })).toEqual([]);
    const data = dataset({ entries: { spells: [baseEntry({ textEn: text })] } });
    expect(foreignTextRule(data, ctx)).toEqual([]);
  });

  it("la lista de excepciones deja pasar una mención legítima, solo la indicada", () => {
    const entries = {
      feats: [baseEntry({ id: "a", textEn: "Mentions an inquisitor and a witch." })],
    };
    const exceptions: ForeignTextException[] = [
      { category: "feats", id: "a", pattern: "other-class", match: "witch", reason: "motivo" },
    ];
    const rule = createForeignTextRule(FOREIGN_PATTERNS, exceptions);
    const issues = rule(dataset({ entries }), ctx);
    expect(ruleIds(issues)).toEqual(["foreign-text.other-class"]);
    expect(issues[0]?.message).toContain("«inquisitor»");
    expect(issues[0]?.message).not.toContain("«witch»");
    // sin `match` la excepción cubre todas las coincidencias del patrón en esa entrada
    const all = createForeignTextRule(FOREIGN_PATTERNS, [
      { category: "feats", id: "a", pattern: "other-class", reason: "motivo" },
    ]);
    expect(all(dataset({ entries }), ctx)).toEqual([]);
  });

  it("una excepción que ya no hace falta, o sin motivo, es un hallazgo", () => {
    const entries = { feats: [baseEntry({ id: "a", textEn: "A clean text." })] };
    const stale = createForeignTextRule(FOREIGN_PATTERNS, [
      { category: "feats", id: "a", pattern: "other-class", reason: "motivo" },
    ]);
    expect(ruleIds(stale(dataset({ entries }), ctx))).toEqual(["foreign-text.allowlist-stale"]);
    // si la categoría no está cargada no se puede saber: no se informa
    expect(stale(dataset(), ctx)).toEqual([]);
    const noReason = createForeignTextRule(FOREIGN_PATTERNS, [
      { category: "feats", id: "a", pattern: "other-class", reason: " " },
      { category: "feats", id: "a", pattern: "no-such-pattern", reason: "motivo" },
    ]);
    expect(
      ruleIds(noReason(dataset({ entries }), ctx)).filter((r) => r === "foreign-text.allowlist"),
    ).toHaveLength(2);
  });

  it("la lista de excepciones real está justificada (motivo y patrón existentes)", () => {
    const ids = new Set(FOREIGN_PATTERNS.map((p) => p.id));
    for (const exception of FOREIGN_TEXT_ALLOWLIST) {
      expect(exception.reason.trim().length).toBeGreaterThan(20);
      expect(ids.has(exception.pattern)).toBe(true);
    }
  });
});

describe("foreign-text sobre los datos reales (R27)", () => {
  const { data } = loadDataset(ROOT);

  it("R27: ninguna categoría contiene texto de otros libros en su textEn", () => {
    expect(foreignTextRule(data, ctx)).toEqual([]);
  });

  it("R27: la regla detecta la inyección sobre una entrada REAL de cada categoría con shards", () => {
    for (const category of CATEGORY_IDS.filter((c) => c !== "spell-lists") as EntryCategory[]) {
      const entries = data.entries[category];
      expect(entries?.length ?? 0, category).toBeGreaterThan(0);
      const first = entries![0] as Record<string, unknown>;
      const injected = {
        ...data,
        entries: {
          [category]: [{ ...first, textEn: `${String(first["textEn"])} Antipaladins may apply.` }],
        },
      };
      const issues = foreignTextRule(injected, ctx);
      expect(ruleIds(issues), category).toEqual(["foreign-text.other-class"]);
    }
  });
});
