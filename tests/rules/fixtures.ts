// Casos de llamada a TODAS las funciones públicas de src/rules (entradas válidas e inválidas),
// compartidos por los tests transversales (R1, R2, R3, R5). No es un test.
import * as rules from "../../src/rules";
import type { ClassLevel, Modifier } from "../../src/rules";

export interface Case {
  readonly name: string;
  // Construye entradas nuevas en cada llamada y devuelve el resultado de la función pública.
  readonly run: (prepare?: <T>(input: T) => T) => unknown;
}

export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

const id = <T>(x: T): T => x;

const mods = (): Modifier[] => [
  { id: "a", name: "A", value: 2, type: "enhancement" },
  { id: "b", name: "B", value: 4, type: "enhancement" },
  { id: "c", name: "C", value: -2, type: "morale" },
  { id: "d", name: "D", value: 1, type: "dodge" },
];
const paladin = (): ClassLevel => ({
  classId: "paladin",
  level: 5,
  bab: "good",
  saves: { fortitude: "good", reflex: "poor", will: "good" },
});
const cleric = (): ClassLevel => ({
  classId: "cleric",
  level: 2,
  bab: "medium",
  saves: { fortitude: "good", reflex: "poor", will: "good" },
});
const abilityMods = () => ({ str: 1, dex: 2, con: 3, int: 0, wis: -1, cha: 4 });

export const VALID_CASES: readonly Case[] = [
  { name: "resolveModifiers", run: (p = id) => rules.resolveModifiers("t", p(mods())) },
  {
    name: "resolveModifiers(excluded)",
    run: (p = id) =>
      rules.resolveModifiers("t", p(mods()), { excluded: new Map([["a", "touch" as const]]) }),
  },
  { name: "abilityModifier", run: (p = id) => rules.abilityModifier(p(17)) },
  {
    name: "abilityModifiers",
    run: (p = id) =>
      rules.abilityModifiers(p({ str: 10, dex: 14, con: 12, int: 8, wis: 16, cha: 7 })),
  },
  { name: "effectiveAbility", run: (p = id) => rules.effectiveAbility("str", 14, p(mods())) },
  { name: "sizeModifier", run: (p = id) => rules.sizeModifier(p("large" as const)) },
  { name: "baseAttackBonusFor", run: (p = id) => rules.baseAttackBonusFor("medium", p(9)) },
  { name: "baseSaveFor", run: (p = id) => rules.baseSaveFor("poor", p(9)) },
  {
    name: "characterBaseAttackBonus",
    run: (p = id) => rules.characterBaseAttackBonus(p([paladin(), cleric()])),
  },
  {
    name: "characterBaseSave",
    run: (p = id) => rules.characterBaseSave("fortitude", p([paladin(), cleric()])),
  },
  {
    name: "savingThrow",
    run: (p = id) =>
      rules.savingThrow(
        p({
          save: "will" as const,
          classes: [paladin()],
          abilityModifiers: abilityMods(),
          modifiers: mods(),
        }),
      ),
  },
  {
    name: "armorClass",
    run: (p = id) =>
      rules.armorClass(
        p({
          size: "medium" as const,
          dexModifier: 4,
          maxDexCaps: [{ id: "armor:chainmail", name: "Chainmail", value: 2 }],
          modifiers: [
            { id: "armor:chainmail", name: "Chainmail", value: 6, type: "armor" as const },
            ...mods(),
          ],
        }),
      ),
  },
  {
    name: "initiativeModifier",
    run: (p = id) =>
      rules.initiativeModifier(
        p({
          dexModifier: 2,
          modifiers: [
            { id: "feat:ii", name: "Improved Initiative", value: 4, type: "untyped" as const },
          ],
        }),
      ),
  },
  {
    name: "applyD20",
    run: (p = id) => {
      const bd = rules.initiativeModifier({ dexModifier: 2 });
      if (!bd.ok) throw new Error("fixture");
      return rules.applyD20(p(bd.value), 13);
    },
  },
  {
    name: "skillModifier",
    run: (p = id) =>
      rules.skillModifier(
        p({
          skill: {
            id: "stealth",
            ability: "dex" as const,
            trainedOnly: false,
            armorCheckPenalty: true,
          },
          ranks: 4,
          classSkill: true,
          abilityModifiers: abilityMods(),
          armorCheckPenalties: [{ id: "armor:x", name: "x", value: 0 }],
          characterLevel: 5,
          modifiers: mods(),
        }),
      ),
  },
  {
    name: "skillModifier(trainedOnly)",
    run: (p = id) =>
      rules.skillModifier(
        p({
          skill: { id: "k", ability: "int" as const, trainedOnly: true, armorCheckPenalty: false },
          ranks: 0,
          classSkill: true,
          abilityModifiers: abilityMods(),
        }),
      ),
  },
  { name: "maxSkillRanks", run: (p = id) => rules.maxSkillRanks(p(5)) },
];

// Una entrada inválida por módulo (R1).
export const INVALID_CASES: readonly Case[] = [
  {
    name: "modifiers",
    run: () => rules.resolveModifiers("t", [{ id: "a", name: "A", value: 1.5, type: "armor" }]),
  },
  { name: "ability", run: () => rules.abilityModifier(0) },
  {
    name: "ability(effective)",
    run: () =>
      rules.effectiveAbility("str", 8, [{ id: "x", name: "x", value: -8, type: "untyped" }]),
  },
  { name: "progression", run: () => rules.baseAttackBonusFor("good", 21) },
  {
    name: "progression(duplicate)",
    run: () => rules.characterBaseSave("will", [paladin(), paladin()]),
  },
  {
    name: "saves",
    run: () =>
      rules.savingThrow({
        save: "will",
        classes: [{ ...paladin(), level: 0 }],
        abilityModifiers: abilityMods(),
      }),
  },
  {
    name: "armor-class",
    run: () =>
      rules.armorClass({
        size: "medium",
        dexModifier: 0,
        maxDexCaps: [{ id: "x", name: "x", value: -1 }],
      }),
  },
  {
    name: "check",
    run: () => {
      const bd = rules.initiativeModifier({ dexModifier: 0 });
      if (!bd.ok) throw new Error("fixture");
      return rules.applyD20(bd.value, 21);
    },
  },
  {
    name: "initiative",
    run: () => rules.initiativeModifier({ dexModifier: Number.NaN }),
  },
  {
    name: "skills",
    run: () =>
      rules.skillModifier({
        skill: { id: "s", ability: "dex", trainedOnly: false, armorCheckPenalty: true },
        ranks: -1,
        classSkill: false,
        abilityModifiers: abilityMods(),
      }),
  },
  { name: "skills(maxSkillRanks)", run: () => rules.maxSkillRanks(0) },
];
