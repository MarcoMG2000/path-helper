import { describe, expect, it } from "vitest";
import { loadDataset, loadIntegrityContext } from "../../scripts/srd/lib/load-dataset";
import { runIntegrity } from "../../src/data/integrity";
import { mergeProvenance } from "../../src/data/schema/provenance";
import { RaceSchema, type Race } from "../../src/data/schema/race";
import { ROOT } from "../project/helpers";

// Datos reales de `races` (Lote B). Los valores de referencia salen de la propia fuente (AoN, página
// de cada raza y «Races [7]» de la página de fuente PRPG Core Rulebook), contrastados a mano.
const { data, issues: loadIssues } = loadDataset(ROOT, ["races"]);
const races = (data.entries.races ?? []).map((e) => RaceSchema.parse(e));
const byId = new Map<string, Race>(races.map((r) => [r.id, r]));
const get = (id: string): Race => {
  const race = byId.get(id);
  if (!race) throw new Error(`falta la raza ${id}`);
  return race;
};

describe("races reales: recuento, ids y procedencia (R15, R26, R27)", () => {
  it("R15: exactamente las 7 razas del CRB", () => {
    expect(races.map((r) => r.id).sort()).toEqual([
      "dwarf",
      "elf",
      "gnome",
      "half-elf",
      "half-orc",
      "halfling",
      "human",
    ]);
  });

  it("R26: el recuento coincide con el expectedCount congelado (7, «Races [7]» de AoN)", () => {
    const provenance = mergeProvenance(data.provenanceParts.races ?? []);
    expect(provenance.expectedCount).toBe(7);
    expect(races).toHaveLength(7);
    expect(provenance.license).toBe("OGL-1.0a");
  });

  it("R27/R3/R7: todas son del CRB y apuntan a la página de la raza en AoN", () => {
    for (const race of races) {
      expect(race.book).toBe("CRB");
      expect(race.sourceRef).toMatch(/^PRPG Core Rulebook pg\. \d+$/);
      expect(race.source).toMatch(/^https:\/\/aonprd\.com\/RacesDisplay\.aspx\?ItemName=/);
    }
  });

  it("R2-R8/R28-R31/R33: la integridad de la categoría no tiene hallazgos", () => {
    const found = runIntegrity(data, loadIntegrityContext(ROOT), { categories: ["races"] });
    expect([...loadIssues, ...found]).toEqual([]);
  });

  it("Q13: las 7 declaran varias etiquetas Source (ISR, ARG, CRB) y quedan needsReview", () => {
    expect(races.filter((r) => r.needsReview).map((r) => r.id)).toHaveLength(7);
  });
});

describe("races reales: goldens de la fuente (R15)", () => {
  it("Dwarf: +2 Con, +2 Wis, -2 Cha; Medium; 20 ft; Common y Dwarven (CRB pg. 21)", () => {
    const dwarf = get("dwarf");
    expect(dwarf.name).toBe("Dwarf");
    expect(dwarf.sourceRef).toBe("PRPG Core Rulebook pg. 21");
    expect(dwarf.abilityModifiers).toEqual({ con: 2, wis: 2, cha: -2 });
    expect(dwarf.abilityChoice).toBeUndefined();
    expect(dwarf.size).toBe("Medium");
    expect(dwarf.baseSpeedFt).toBe(20);
    expect(dwarf.languages.automatic).toEqual(["Common", "Dwarven"]);
    expect(dwarf.languages.bonus).toEqual([
      "Giant",
      "Gnome",
      "Goblin",
      "Orc",
      "Terran",
      "Undercommon",
    ]);
    expect(dwarf.traits.map((t) => t.name)).toEqual([
      "+2 Constitution, +2 Wisdom, –2 Charisma",
      "Medium",
      "Slow and Steady",
      "Darkvision",
      "Defensive Training",
      "Greed",
      "Hatred",
      "Hardy",
      "Stability",
      "Stonecunning",
      "Weapon Familiarity",
      "Languages",
    ]);
  });

  it("Human: +2 a una característica elegida, sin modificadores fijos; Medium; 30 ft; dote y rango extra", () => {
    const human = get("human");
    expect(human.sourceRef).toBe("PRPG Core Rulebook pg. 27");
    expect(human.abilityModifiers).toEqual({});
    expect(human.abilityChoice).toEqual({ amount: 2 });
    expect(human.size).toBe("Medium");
    expect(human.baseSpeedFt).toBe(30);
    expect(human.languages).toEqual({ automatic: ["Common"], bonus: [], bonusAny: true });
    expect(human.traits.map((t) => t.name)).toEqual([
      "+2 to One Ability Score",
      "Medium",
      "Normal Speed",
      "Bonus Feat",
      "Skilled",
      "Languages",
    ]);
  });

  it("Half-Elf y Half-Orc: la fuente también les da el +2 a elegir (el spec solo cita humano y semielfo)", () => {
    const choosers = races.filter((r) => r.abilityChoice !== undefined).map((r) => r.id);
    expect(choosers.sort()).toEqual(["half-elf", "half-orc", "human"]);
    expect(get("half-orc").abilityModifiers).toEqual({});
  });

  it("Gnome y Halfling son Small con 20 ft; el resto Medium (30 ft salvo Dwarf)", () => {
    expect(
      races
        .filter((r) => r.size === "Small")
        .map((r) => r.id)
        .sort(),
    ).toEqual(["gnome", "halfling"]);
    expect(
      races
        .filter((r) => r.baseSpeedFt === 20)
        .map((r) => r.id)
        .sort(),
    ).toEqual(["dwarf", "gnome", "halfling"]);
    expect(get("elf").abilityModifiers).toEqual({ dex: 2, int: 2, con: -2 });
    expect(get("halfling").abilityModifiers).toEqual({ dex: 2, cha: 2, str: -2 });
    expect(get("gnome").abilityModifiers).toEqual({ con: 2, cha: 2, str: -2 });
  });
});

describe("races reales: coherencia entre campos estructurados y texto (R15, R8)", () => {
  it("los modificadores estructurados reproducen la etiqueta del primer rasgo", () => {
    const names: Record<string, string> = {
      strength: "str",
      dexterity: "dex",
      constitution: "con",
      intelligence: "int",
      wisdom: "wis",
      charisma: "cha",
    };
    for (const race of races) {
      const label = race.traits[0]!.name;
      if (/to One Ability Score/.test(label)) {
        expect(race.abilityChoice, race.id).toEqual({ amount: 2 });
        continue;
      }
      const expected: Record<string, number> = {};
      for (const part of label.split(", ")) {
        const m = /^([+–-])(\d+) (\w+)$/.exec(part)!;
        expected[names[m[3]!.toLowerCase()]!] = (m[1] === "+" ? 1 : -1) * Number(m[2]);
      }
      expect(race.abilityModifiers, race.id).toEqual(expected);
    }
  });

  it("el textEn contiene la descripción y todos los rasgos, sin etiquetas HTML", () => {
    for (const race of races) {
      expect(race.textEn, race.id).toContain("**Racial Traits**");
      expect(race.textEn, race.id).not.toMatch(/<[a-z]/i);
      for (const trait of race.traits) {
        expect(race.textEn, `${race.id}/${trait.name}`).toContain(
          `**${trait.name}**: ${trait.textEn}`,
        );
      }
    }
  });

  it("R27: nada de otros libros (subrazas, rasgos alternativos, clase predilecta)", () => {
    for (const race of races) {
      expect(race.textEn, race.id).not.toMatch(/Alternate Racial|Favored Class|Subrace|Replaces /);
      expect(race.textEn, race.id).not.toContain("Advanced Race Guide");
    }
  });
});

describe("races reales: capa ES (R28-R31, R33)", () => {
  it("R28/R29: 7 resúmenes draft, uno por raza", () => {
    const merged: Record<string, { status: string }> = {};
    for (const part of data.summaryParts.races ?? []) Object.assign(merged, part.data);
    expect(Object.keys(merged).sort()).toEqual(races.map((r) => r.id).sort());
    for (const summary of Object.values(merged)) expect(summary.status).toBe("draft");
  });

  it("R31/R33: 7 claves de glosario `races:*`, todas draft sin verificar", () => {
    const keys: Record<string, { verified: boolean; origin: string; kind: string }> = {};
    for (const shard of data.glossary.shards) {
      for (const [k, v] of Object.entries(shard.data as typeof keys)) {
        if (k.startsWith("races:")) keys[k] = v;
      }
    }
    expect(Object.keys(keys).sort()).toEqual(races.map((r) => `races:${r.id}`).sort());
    for (const value of Object.values(keys)) {
      expect(value.verified).toBe(false);
      expect(value.origin).toBe("draft");
      expect(value.kind).toBe("entry");
    }
  });
});
