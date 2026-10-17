import {
  expectedAttacks,
  expectedBab,
  expectedSave,
} from "../../../src/data/integrity/class-tables";
import type { ClassEntry } from "../../../src/data/schema/class";
import type { ClassFeature } from "../../../src/data/schema/class-feature";
import type { Domain } from "../../../src/data/schema/domain";
import { baseEntry } from "./entries";

// Entradas sintéticas VÁLIDAS (no son datos del CRB): tabla generada con las fórmulas de R11.

type Progression = ClassEntry["progression"];

export function makeClass(
  id = "rogue",
  progression: Progression = { bab: "threeQuarters", fort: "poor", ref: "good", will: "poor" },
  overrides: Partial<ClassEntry> = {},
): ClassEntry {
  const table = Array.from({ length: 20 }, (_, i) => {
    const level = i + 1;
    const bab = expectedBab(progression.bab, level);
    return {
      level,
      bab: expectedAttacks(bab),
      fort: expectedSave(progression.fort, level),
      ref: expectedSave(progression.ref, level),
      will: expectedSave(progression.will, level),
      special: level === 1 ? ["Sneak attack +1d6"] : [],
      specialIds: level === 1 ? [`${id}.sneak-attack`] : [],
    };
  });
  return {
    ...baseEntry({
      id,
      name: id[0]!.toUpperCase() + id.slice(1),
      source: `https://www.aonprd.com/ClassDisplay.aspx?ItemName=${id}`,
      sourceRef: "PRPG Core Rulebook pg. 67",
    }),
    hitDie: 8,
    skillRanksPerLevel: 8,
    classSkills: ["acrobatics", "knowledge-local"],
    alignment: "Any",
    startingWealthDice: "4d6",
    proficiencies: { weapons: ["simple"], armor: ["light"], shields: [] },
    progression,
    table,
    ...overrides,
  } as ClassEntry;
}

export function makeFeature(
  id = "rogue.sneak-attack",
  overrides: Partial<ClassFeature> = {},
): ClassFeature {
  return {
    ...baseEntry({
      id,
      name: "Sneak Attack",
      source: "https://www.aonprd.com/ClassDisplay.aspx?ItemName=Rogue",
      sourceRef: "PRPG Core Rulebook pg. 67",
    }),
    classId: id.split(".")[0]!,
    level: 1,
    abilityType: null,
    kind: "feature",
    ...overrides,
  } as ClassFeature;
}

export function makeDomain(overrides: Partial<Domain> = {}): Domain {
  return {
    ...baseEntry({
      id: "air",
      name: "Air",
      source: "https://www.aonprd.com/DomainDisplay.aspx?ItemName=Air",
      sourceRef: "PRPG Core Rulebook pg. 41",
    }),
    grantedPowers: [
      { name: "Lightning Arc", abilityType: "Sp", level: 1, textEn: "Arc of electricity." },
    ],
    spells: [
      "obscuring mist",
      "wind wall",
      "gaseous form",
      "air walk",
      "control winds",
      "chain lightning",
      "elemental body iv",
      "whirlwind",
      "elemental swarm",
    ].map((name, i) => ({ level: i + 1, spellId: name.replace(/ /g, "-"), name })),
    ...overrides,
  } as Domain;
}
