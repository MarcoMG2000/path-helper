import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CATEGORIES, getCategory } from "../../src/data/categories";
import { loadDataset, loadIntegrityContext } from "../../scripts/srd/lib/load-dataset";
import { expectedIndex } from "../../scripts/srd/lib/shard-index";
import { runIntegrity } from "../../src/data/integrity";
import { CRB_CLASS_IDS, SpellSchema, type Spell } from "../../src/data/schema/spell";
import { CASTER_CLASS_IDS, SpellListsSchema } from "../../src/data/schema/spell-list";
import { mergeProvenance } from "../../src/data/schema/provenance";
import { spellsForClass } from "../../src/data/spells/query";
import { compareSpellToGolden, loadSpellGoldens } from "./spells/golden";

// Cierre del Lote D (TD.7): datos reales de TODOS los conjuros del CRB y de las listas por clase.
// R20 (goldens y campos), R21 (listas), R22 (coherencia `levels` <-> listas), R95 (sorcerer y wizard
// sin lista), R99 (recuento total = suma de lotes), R100 (`spellsForClass`). Solo lee `src/data`.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const { data } = loadDataset(ROOT, ["spells", "spell-lists", "classes"]);

const spells = (data.entries["spells"] ?? []).map((s) => SpellSchema.parse(s));
const byId = new Map<string, Spell>(spells.map((s) => [s.id, s]));
const lists = SpellListsSchema.parse(data.spellLists);

function listedIds(classId: (typeof CASTER_CLASS_IDS)[number]): string[] {
  const byLevel = lists[classId] ?? {};
  return Object.keys(byLevel)
    .sort((a, b) => Number(a) - Number(b))
    .flatMap((level) => [...(byLevel[level] ?? [])].sort());
}

describe("conjuros del CRB, datos reales (TD.7)", () => {
  it("R20 R99: los 623 conjuros del CRB, ids únicos, repartidos en los shards a-z", () => {
    expect(spells).toHaveLength(623);
    expect(byId.size).toBe(623);
    for (const spell of spells) expect(spell.book).toBe("CRB");
  });

  it("R26 R99: expectedCount total = suma de expectedCountByBatch = nº de conjuros", () => {
    const parts = data.provenanceParts["spells"] ?? [];
    const merged = mergeProvenance(parts);
    const byBatch = merged.expectedCountByBatch ?? {};
    const sum = Object.values(byBatch).reduce((a, b) => a + b, 0);
    expect(Object.keys(byBatch).sort()).toEqual(["a-d", "e-k", "l-r", "s-z"]);
    expect(merged.expectedCount).toBe(623);
    expect(sum).toBe(merged.expectedCount);
    expect(spells).toHaveLength(merged.expectedCount!);
    for (const part of parts) {
      expect((part.data as { license?: string }).license).toBe("OGL-1.0a");
    }
  });

  it("R20: los goldens de design.md §5 coinciden (también los de solo sorcerer/wizard)", () => {
    const goldens = loadSpellGoldens();
    expect(Object.keys(goldens).sort()).toEqual([
      "burning-hands",
      "cure-light-wounds",
      "magic-missile",
      "wish",
    ]);
    for (const [id, golden] of Object.entries(goldens)) {
      const spell = byId.get(id);
      expect(spell, id).toBeDefined();
      expect(compareSpellToGolden(spell, golden), id).toEqual([]);
    }
  });

  it("R20 R95: Magic Missile y Burning Hands solo tienen sorcerer y wizard; Wish es de nivel 9", () => {
    for (const id of ["magic-missile", "burning-hands"]) {
      expect(Object.keys(byId.get(id)!.levels).sort(), id).toEqual(["sorcerer", "wizard"]);
    }
    expect(byId.get("wish")!.levels).toEqual({ sorcerer: 9, wizard: 9 });
    expect(byId.get("cure-light-wounds")!.levels).toMatchObject({
      cleric: 1,
      bard: 1,
      druid: 1,
      paladin: 1,
      ranger: 2,
    });
  });
});

describe("spell-lists, datos reales (TD.7)", () => {
  it("R21: exactamente las 5 clases con lista y ni sorcerer ni wizard", () => {
    expect(Object.keys(lists).sort()).toEqual([...CASTER_CLASS_IDS].sort());
    expect(lists).not.toHaveProperty("sorcerer");
    expect(lists).not.toHaveProperty("wizard");
  });

  it("R21: todo id de una lista existe en spells y no se repite dentro de una clase", () => {
    for (const classId of CASTER_CLASS_IDS) {
      const ids = listedIds(classId);
      expect(ids.length, classId).toBeGreaterThan(0);
      expect(new Set(ids).size, `${classId}: ids repetidos`).toBe(ids.length);
      for (const id of ids) expect(byId.has(id), `${classId}:${id}`).toBe(true);
    }
  });

  it("R21: los niveles de cada lista son los que la tabla de la clase da acceso (spellsPerDay/spellsKnown)", () => {
    const classes = (data.entries["classes"] ?? []) as {
      id: string;
      table: { spellsPerDay?: (number | null)[]; spellsKnown?: (number | null)[] }[];
    }[];
    for (const classId of CASTER_CLASS_IDS) {
      const cls = classes.find((c) => c.id === classId);
      expect(cls, classId).toBeDefined();
      const accessible = new Set<number>();
      for (const row of cls!.table) {
        for (const slots of [row.spellsPerDay, row.spellsKnown]) {
          slots?.forEach((value, level) => {
            if (value !== null && value !== undefined) accessible.add(level);
          });
        }
      }
      const listed = Object.keys(lists[classId] ?? {})
        .map(Number)
        .sort((a, b) => a - b);
      expect(listed, classId).toEqual([...accessible].sort((a, b) => a - b));
      for (const level of listed) {
        expect(lists[classId]![String(level)]!.length, `${classId} nivel ${level}`).toBeGreaterThan(
          0,
        );
      }
    }
  });

  it("R22: la regla de integridad no halla incoherencias entre spells[].levels y las listas", () => {
    const found = runIntegrity(data, loadIntegrityContext(ROOT), {
      categories: ["spells", "spell-lists"],
    }).filter(
      (f) =>
        f.rule.startsWith("spell-lists.") ||
        f.rule === "spells.level-key" ||
        f.rule === "spells.structured-field",
    );
    expect(found).toEqual([]);
  });

  it("R22: los pares (conjuro, nivel) de cada lista son exactamente los de spells[].levels de la clase", () => {
    for (const classId of CASTER_CLASS_IDS) {
      const fromLists = new Set<string>();
      for (const [level, ids] of Object.entries(lists[classId] ?? {})) {
        for (const id of ids) fromLists.add(`${id}@${level}`);
      }
      const fromSpells = new Set<string>();
      for (const spell of spells) {
        const level = spell.levels[classId];
        if (level !== undefined) fromSpells.add(`${spell.id}@${level}`);
      }
      expect([...fromLists].sort(), classId).toEqual([...fromSpells].sort());
    }
  });
});

describe("spellsForClass sobre datos reales (R95, R100)", () => {
  it("R100: para las 5 clases con lista coincide con spell-lists (por clase y por nivel)", () => {
    for (const classId of CASTER_CLASS_IDS) {
      const all = spellsForClass(spells, classId);
      expect([...all].sort(), classId).toEqual(listedIds(classId).sort());
      for (const [level, ids] of Object.entries(lists[classId] ?? {})) {
        expect(spellsForClass(spells, classId, Number(level)), `${classId} ${level}`).toEqual(
          [...ids].sort(),
        );
      }
    }
  });

  it("R100: el resultado va ordenado por nivel y luego por id", () => {
    const ids = spellsForClass(spells, "cleric");
    const levels = ids.map((id) => byId.get(id)!.levels["cleric"]!);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    const wizard = spellsForClass(spells, "wizard", 1);
    expect(wizard).toEqual([...wizard].sort());
  });

  it("R95 R100: sorcerer y wizard devuelven resultados de todos los niveles 0-9 sin tener spell-lists", () => {
    for (const classId of ["sorcerer", "wizard"]) {
      expect(CRB_CLASS_IDS as readonly string[]).toContain(classId);
      expect(Object.keys(lists)).not.toContain(classId);
      const all = spellsForClass(spells, classId);
      expect(all.length, classId).toBeGreaterThan(0);
      for (let level = 0; level <= 9; level++) {
        expect(
          spellsForClass(spells, classId, level).length,
          `${classId} ${level}`,
        ).toBeGreaterThan(0);
      }
    }
    expect(spellsForClass(spells, "wizard")).toContain("magic-missile");
    expect(spellsForClass(spells, "sorcerer", 9)).toContain("wish");
  });
});

describe("índices generados (TD.6)", () => {
  it("spells/index.ts y spell-lists/index.ts coinciden con los ficheros en disco", () => {
    const dataDir = resolve(ROOT, "src/data");
    for (const id of ["spells", "spell-lists"] as const) {
      const def = getCategory(id);
      expect(CATEGORIES).toContain(def);
      const onDisk = readFileSync(resolve(dataDir, def.dir, "index.ts"), "utf8");
      expect(onDisk, id).toBe(expectedIndex(dataDir, def));
    }
  });

  it("spells/index.ts enumera un shard por inicial con conjuros, de los 4 rangos", () => {
    const initials = [...new Set(spells.map((s) => s.id[0]!))].sort();
    const source = readFileSync(resolve(ROOT, "src/data/spells/index.ts"), "utf8");
    const files = [...source.matchAll(/file: "spells\/([a-z])\.json"/g)].map((m) => m[1]!);
    expect(files).toEqual(initials);
    expect(source).not.toContain("lists.json");
    for (const range of [
      ["a", "d"],
      ["e", "k"],
      ["l", "r"],
      ["s", "z"],
    ] as const) {
      expect(initials.some((c) => c >= range[0] && c <= range[1])).toBe(true);
    }
  });

  it("spell-lists/index.ts enumera spells/lists.json", () => {
    const source = readFileSync(resolve(ROOT, "src/data/spell-lists/index.ts"), "utf8");
    expect(source).toContain('file: "spells/lists.json"');
  });
});
