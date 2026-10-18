import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadDataset } from "../../scripts/srd/lib/load-dataset";
import { SPELL_DESCRIPTORS, SPELL_SUBSCHOOLS } from "../../src/data/schema/spell";
import { ROOT } from "../project/helpers";

// Fidelidad del texto al Core Rulebook (R27). La fuente de verdad del texto es el PRD oficial de
// Paizo (https://paizo.com/pathfinderRPG/prd/coreRulebook/...); Archives of Nethys muestra a veces la
// versión reimpresa con contenido de otros libros y se corrige con overrides (R49). Estos valores
// se copiaron del PRD a mano (no del módulo bajo prueba), con la cita en el `evidence` de cada override.
const { data } = loadDataset(ROOT);

type Entry = Record<string, unknown> & { id: string; textEn: string };
const entriesOf = (category: keyof typeof data.entries): Entry[] =>
  (data.entries[category] ?? []) as Entry[];
const get = (category: keyof typeof data.entries, id: string): Entry => {
  const found = entriesOf(category).find((e) => e.id === id);
  if (!found) throw new Error(`falta ${category}/${id}`);
  return found;
};

describe("capacidades de clase: listas y reglas del CRB, no las de otros libros (R27)", () => {
  it("Hunter's Bond: los diez compañeros del CRB y el tiburón acuático", () => {
    const text = get("class-features", "ranger.hunters-bond").textEn;
    expect(text).toContain(
      "A ranger who selects an animal companion can choose from the following list: badger, bird, camel, cat (small), dire rat, dog, horse, pony, snake (viper or constrictor), or wolf. If the campaign takes place wholly or partly in an aquatic environment, the ranger may choose a shark instead.",
    );
    expect(text).not.toMatch(/Antelope|Armorfish|Hobbe Hound|Marsupial Devil|Wolfdog|Stingray/);
    expect(text).toContain("ranger level – 3");
  });

  it("Divine Bond: caballo pesado (Medium) o poni (Small), también boar, camel o dog", () => {
    const text = get("class-features", "paladin.divine-bond").textEn;
    expect(text).toContain(
      "This mount is usually a heavy horse (for a Medium paladin) or a pony (for a Small paladin), although more exotic mounts, such as a boar, camel, or dog are also suitable.",
    );
    expect(text).not.toMatch(/Medium Paladins|Small Paladins|Eohippus|Giraffe|Wolfdog/);
    expect(text).toContain("a total of four times per day at 17th level");
  });

  it("Nature Bond: solo dos formas (dominio o compañero animal), sin «druidic herbalism»", () => {
    const text = get("class-features", "druid.nature-bond").textEn;
    expect(text).toContain("This bond can take one of two forms.");
    expect(text).not.toMatch(/third form|herbalism/i);
  });

  it("Archery: Improved Precise Shot y Manyshot a nivel 6 (sin Crossbow Mastery)", () => {
    const text = get("class-features", "ranger.combat-style.archery").textEn;
    expect(text).toContain("At 6th level, he adds Improved Precise Shot and Manyshot to the list.");
    expect(text).not.toContain("Crossbow Mastery");
  });

  it("Lore Master: tomar 10 en Knowledge sin la cláusula «even when threatened or distracted»", () => {
    const text = get("class-features", "bard.lore-master").textEn;
    expect(text).toContain(
      "can take 10 on any Knowledge skill check that he has ranks in. A bard can choose not to take 10",
    );
    expect(text).not.toMatch(/threatened|distracted/);
  });

  it("sin frases de navegación de la web de la fuente en las capacidades de clase", () => {
    for (const e of entriesOf("class-features")) {
      expect(e.textEn, e.id).not.toMatch(/\*\*here\*\*|from all sources/);
    }
  });
});

describe("dotes: el texto del CRB, no el reimpreso de otros libros (R27)", () => {
  it("Rapid Reload: solo ballestas (hand, light, heavy), sin armas de fuego", () => {
    const feat = get("feats", "rapid-reload");
    expect(feat.textEn).toBe(
      [
        "Choose a type of crossbow (hand, light, or heavy). You can reload such weapons quickly.",
        "**Prerequisites**: Weapon Proficiency (crossbow type chosen).",
        "**Benefit**: The time required for you to reload your chosen type of crossbow is reduced to a free action (for a hand or light crossbow) or a move action (for a heavy crossbow). Reloading a crossbow still provokes an attack of opportunity.\n\nIf you have selected this feat for hand crossbow or light crossbow, you may fire that weapon as many times in a full-attack action as you could attack if you were using a bow.",
        "**Normal**: A character without this feat needs a move action to reload a hand or light crossbow, or a full-round action to reload a heavy crossbow.",
        "**Special**: You can gain Rapid Reload multiple times. Each time you take the feat, it applies to a new type of crossbow.",
      ].join("\n\n"),
    );
    expect(feat["prerequisites"]).toEqual({
      raw: "Weapon Proficiency (crossbow type chosen).",
      featIds: [],
      skills: [],
      other: ["Weapon Proficiency (crossbow type chosen)"],
    });
    expect(feat["needsReview"]).toBe(false);
    expect(JSON.stringify(feat)).not.toMatch(/firearm/i);
  });

  it("Extra Channel: la nota especial solo habla del paladín (sin warpriest)", () => {
    const feat = get("feats", "extra-channel");
    expect(feat["special"]).toBe(
      "If a paladin with the ability to channel positive energy takes this feat, she can use lay on hands four additional times per day, but only to channel positive energy.",
    );
    expect(JSON.stringify(feat)).not.toMatch(/warpriest|fervor/i);
    expect(feat["needsReview"]).toBe(false);
  });

  it("Improved Familiar: la tabla del CRB con las 10 criaturas (no un enlace colgante)", () => {
    const text = get("feats", "improved-familiar").textEn;
    const rows = text.split("\n").filter((l) => l.startsWith("| ") && !l.includes("---"));
    expect(rows.map((r) => r.split("|")[1]!.trim())).toEqual([
      "**Familiar**",
      "Celestial hawk¹",
      "Dire rat",
      "Fiendish viper²",
      "Elemental, Small (any type)",
      "Stirge",
      "Homunculus³",
      "Imp",
      "Mephit (any type)",
      "Pseudodragon",
      "Quasit",
    ]);
    expect(text).toContain("| Quasit | Chaotic evil | 7th |");
    expect(text).not.toMatch(/\bhere\b/);
  });
});

describe("conjuros y razas: sin contenido de otros libros (R27)", () => {
  it("Summon Monster 1 empieza por la descripción del CRB (sin notas de antipaladines ni de Nethys)", () => {
    const text = get("spells", "summon-monster-1").textEn;
    expect(text.startsWith("This spell summons an extraplanar creature")).toBe(true);
    expect(text).not.toMatch(/Antipaladin|Nethys/);
  });

  it("Planar Ally, Lesser termina en la nota del CRB (sin «outsider subdomain»)", () => {
    const text = get("spells", "planar-ally-lesser").textEn;
    expect(
      text.endsWith(
        "Note: When you use a calling spell that calls an air, chaotic, earth, evil, fire, good, lawful, or water creature, it is a spell of that type.",
      ),
    ).toBe(true);
    expect(text).not.toMatch(/subdomain/i);
  });

  it("razas: descripción del PRD (cinco apartados, sin listas de nombres) y sin ambientación de Golarion", () => {
    for (const race of entriesOf("races")) {
      const headings = [...race.textEn.matchAll(/^\*\*([^*]+)\*\*:/gm)].map((m) => m[1]);
      expect(headings.slice(0, 5), race.id).toEqual([
        "Physical Description",
        "Society",
        "Relations",
        race.id === "half-orc" ? "Alignment & Religion" : "Alignment and Religion",
        "Adventurers",
      ]);
      expect(race.textEn, race.id).not.toMatch(/Names?\*\*|Taldane|Chelax|inquisitor|alchemist/i);
    }
    const human = get("races", "human");
    const languages = (human["traits"] as { name: string; textEn: string }[]).find(
      (t) => t.name === "Languages",
    );
    expect(languages?.textEn).toBe(
      "Humans begin play speaking Common. Humans with high Intelligence scores can choose any languages they want (except secret languages, such as Druidic).",
    );
    expect(human.textEn).toContain(languages!.textEn);
  });
});

describe("conjuros: descriptores y subescuelas válidos, `raw` literal (R96, R101)", () => {
  const spells = entriesOf("spells") as (Entry & {
    subschool?: string;
    additionalSubschools?: string[];
    descriptors: string[];
  })[];

  it("todo descriptor y subescuela pertenece al catálogo del CRB (nada de «see-text»)", () => {
    for (const s of spells) {
      for (const d of s.descriptors)
        expect(SPELL_DESCRIPTORS as readonly string[], s.id).toContain(d);
      for (const sub of [s.subschool, ...(s.additionalSubschools ?? [])]) {
        if (sub !== undefined) expect(SPELL_SUBSCHOOLS as readonly string[], s.id).toContain(sub);
      }
    }
  });

  it("«[see text]» no deja descriptor; «[fire or cold]» deja los dos; subescuelas dobles", () => {
    const by = (id: string) => spells.find((s) => s.id === id)!;
    for (const id of ["summon-monster-1", "align-weapon", "planar-ally-lesser", "planar-binding"]) {
      expect(by(id).descriptors, id).toEqual([]);
    }
    expect(by("fire-shield").descriptors).toEqual(["fire", "cold"]);
    expect([by("gate").subschool, by("gate").additionalSubschools]).toEqual([
      "creation",
      ["calling"],
    ]);
    expect([by("mislead").subschool, by("mislead").additionalSubschools]).toEqual([
      "figment",
      ["glamer"],
    ]);
    expect(by("cure-light-wounds").subschool).toBe("healing");
    expect(by("cure-light-wounds").additionalSubschools).toBeUndefined();
  });

  it("ningún `raw` de los campos estructurados lleva marcas de cursiva", () => {
    const raws: [string, string][] = [];
    const walk = (value: unknown, id: string, path: string): void => {
      if (Array.isArray(value)) value.forEach((v, i) => walk(v, id, `${path}.${i}`));
      else if (value && typeof value === "object") {
        for (const [k, v] of Object.entries(value)) {
          if (k === "textEn") continue;
          if (k === "raw" && typeof v === "string") raws.push([`${id}${path}`, v]);
          else walk(v, id, `${path}.${k}`);
        }
      }
    };
    for (const s of spells) walk(s, s.id, "");
    expect(raws.length).toBeGreaterThan(2000);
    expect(raws.filter(([, raw]) => raw.includes("*"))).toEqual([]);
  });
});

describe("overrides de fidelidad: cada uno cita el PRD oficial (R49)", () => {
  const read = (file: string): { id: string; field: string; evidence: string; reason: string }[] =>
    JSON.parse(readFileSync(resolve(ROOT, "src/data/overrides", file), "utf8"));

  it("los overrides de class-features, feats, races y spells traen el PRD como evidencia", () => {
    const files = [
      "class-features.json",
      "feats.json",
      "races.json",
      "spells/l-r.json",
      "spells/s-z.json",
    ];
    for (const file of files) {
      const overrides = read(file);
      expect(overrides.length, file).toBeGreaterThan(0);
      for (const o of overrides) {
        expect(o.evidence, `${file} ${o.id}.${o.field}`).toMatch(
          /paizo\.com\/pathfinderRPG\/prd\//,
        );
        expect(o.reason.length, `${file} ${o.id}.${o.field}`).toBeGreaterThan(40);
      }
    }
  });
});
