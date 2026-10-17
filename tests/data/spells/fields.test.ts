import { describe, expect, it } from "vitest";
import {
  classifyCastingTime,
  classifyComponents,
  classifyDuration,
  classifyRange,
  classifySavingThrow,
  classifySpellFields,
  classifySpellResistance,
  targetingKindFromLabel,
  unrecognizedComponentTokens,
} from "../../../src/data/spells/fields";

// R96: tabla de casos de `classifySpellFields`. Los textos `raw` salen de páginas reales de
// Archives of Nethys (fixtures de tests/fixtures/srd-html/spells y páginas de muestra del Lote D0).

describe("classifyCastingTime (R96)", () => {
  const cases: [string, string, number | null][] = [
    ["1 standard action", "standard", 1],
    ["1 free action", "free", 1],
    ["1 immediate action", "immediate", 1],
    ["1 swift action", "swift", 1],
    ["1 full-round action", "full-round", 1],
    ["1 round", "round", 1],
    ["2 rounds", "round", 2],
    ["1 minute", "minute", 1],
    ["10 minutes", "minute", 10],
    ["1 hour", "hour", 1],
    ["24 hours", "hour", 24],
    ["at least 10 minutes; see text", "other", null],
    ["1 standard action; see text", "other", null],
    ["", "other", null],
  ];
  it.each(cases)("%s", (raw, unit, amount) => {
    expect(classifyCastingTime(raw)).toEqual({ raw, unit, amount });
  });
});

describe("classifyRange (R96)", () => {
  it.each([
    ["personal", { kind: "personal" }],
    ["touch", { kind: "touch" }],
    ["Touch", { kind: "touch" }],
    ["unlimited", { kind: "unlimited" }],
    ["close (25 ft. + 5 ft./2 levels)", { kind: "close" }],
    ["medium (100 ft. + 10 ft./level)", { kind: "medium" }],
    ["long (400 ft. + 40 ft./level)", { kind: "long" }],
    ["10 ft.", { kind: "fixed", fixedFt: 10 }],
    ["60 ft.", { kind: "fixed", fixedFt: 60 }],
    ["see text", { kind: "other" }],
    ["personal and touch", { kind: "other" }],
    ["0 ft.", { kind: "other" }],
  ])("%s", (raw, expected) => {
    expect(classifyRange(raw)).toEqual({ raw, ...expected });
  });
});

describe("classifyDuration (R96)", () => {
  it.each([
    ["instantaneous", { kind: "instantaneous", dismissible: false }],
    ["permanent (D)", { kind: "permanent", dismissible: true }],
    ["concentration", { kind: "concentration", dismissible: false }],
    ["concentration, up to 10 min./level (D)", { kind: "concentration", dismissible: true }],
    [
      "1 round/level",
      { kind: "timed", dismissible: false, amount: 1, unit: "round", perLevel: true },
    ],
    [
      "10 min./level (D)",
      { kind: "timed", dismissible: true, amount: 10, unit: "minute", perLevel: true },
    ],
    [
      "2 hours/level",
      { kind: "timed", dismissible: false, amount: 2, unit: "hour", perLevel: true },
    ],
    ["1 hour", { kind: "timed", dismissible: false, amount: 1, unit: "hour", perLevel: false }],
    ["24 hours", { kind: "timed", dismissible: false, amount: 24, unit: "hour", perLevel: false }],
    ["1 minute", { kind: "timed", dismissible: false, amount: 1, unit: "minute", perLevel: false }],
    ["permanent; see text", { kind: "other", dismissible: false }],
    ["concentration + 1 round/level", { kind: "other", dismissible: false }],
    ["1d4+1 rounds (apparent time); see text", { kind: "other", dismissible: false }],
    ["1 day/level (D) or until discharged", { kind: "other", dismissible: true }],
    ["1 minute or until discharged", { kind: "other", dismissible: false }],
    ["see text", { kind: "other", dismissible: false }],
  ])("%s", (raw, expected) => {
    expect(classifyDuration(raw)).toEqual({ raw, ...expected });
  });
});

describe("classifySavingThrow (R96)", () => {
  const flags = (harmless = false, object = false) => ({ harmless, object });
  it.each([
    ["none", { kind: "none", ...flags() }],
    ["none, see text", { kind: "none", ...flags() }],
    ["Will negates", { kind: "will", effect: "negates", ...flags() }],
    ["Will half (harmless)", { kind: "will", effect: "half", ...flags(true) }],
    ["Will negates (harmless, object)", { kind: "will", effect: "negates", ...flags(true, true) }],
    ["Fortitude negates (object)", { kind: "fortitude", effect: "negates", ...flags(false, true) }],
    ["Reflex half", { kind: "reflex", effect: "half", ...flags() }],
    ["Fortitude partial", { kind: "fortitude", effect: "partial", ...flags() }],
    ["Fortitude negates; see text", { kind: "fortitude", effect: "negates", ...flags() }],
    ["Will disbelief (if interacted with)", { kind: "will", effect: "disbelief", ...flags() }],
    ["Fortitude partial, Will negates", { kind: "multiple", ...flags() }],
    ["Will negates (blinding only)", { kind: "other", ...flags() }],
    ["Will half (harmless) or Will half; see text", { kind: "other", ...flags() }],
    ["none or Will negates; see text", { kind: "other", ...flags() }],
    ["none and Will negates (object)", { kind: "other", ...flags() }],
    ["see text", { kind: "other", ...flags() }],
    ["", { kind: "other", ...flags() }],
  ])("%s", (raw, expected) => {
    expect(classifySavingThrow(raw)).toEqual({ raw, ...expected });
  });
});

describe("classifySpellResistance (R96)", () => {
  it.each([
    ["yes", { applies: "yes", harmless: false, object: false }],
    ["no", { applies: "no", harmless: false, object: false }],
    ["yes (harmless)", { applies: "yes", harmless: true, object: false }],
    ["yes (harmless); see text", { applies: "yes", harmless: true, object: false }],
    ["yes (object)", { applies: "yes", harmless: false, object: true }],
    ["yes (harmless, object)", { applies: "yes", harmless: true, object: true }],
    ["see text", { applies: "other", harmless: false, object: false }],
    ["no and yes (object)", { applies: "other", harmless: false, object: false }],
    ["yes (harmless) or yes; see text", { applies: "other", harmless: false, object: false }],
    ["", { applies: "other", harmless: false, object: false }],
  ])("%s", (raw, expected) => {
    expect(classifySpellResistance(raw)).toEqual({ raw, ...expected });
  });
});

describe("classifyComponents (R96)", () => {
  const none = {
    verbal: false,
    somatic: false,
    material: false,
    focus: false,
    divineFocus: false,
    xp: false,
  };
  it("V, S", () => {
    expect(classifyComponents("V, S")).toEqual({
      ...none,
      verbal: true,
      somatic: true,
      raw: "V, S",
    });
  });
  it("solo verbal", () => {
    expect(classifyComponents("V")).toEqual({ ...none, verbal: true, raw: "V" });
  });
  it("material con coste: el texto del paréntesis queda en details y en raw (Wish)", () => {
    const raw = "V, S, M (diamond worth 25,000 gp)";
    expect(classifyComponents(raw)).toEqual({
      ...none,
      verbal: true,
      somatic: true,
      material: true,
      raw,
      details: { material: "diamond worth 25,000 gp" },
    });
  });
  it("foco con coste (Analyze Dweomer)", () => {
    const raw = "V, S, F (a ruby and gold lens worth 1,500 gp)";
    expect(classifyComponents(raw)).toMatchObject({
      verbal: true,
      somatic: true,
      focus: true,
      material: false,
      details: { focus: "a ruby and gold lens worth 1,500 gp" },
    });
  });
  it("foco divino (Bless)", () => {
    expect(classifyComponents("V, S, DF")).toMatchObject({ divineFocus: true, focus: false });
    expect(classifyComponents("V, S, DF").details).toBeUndefined();
  });
  it("M/DF: ambos a true y el paréntesis describe el material", () => {
    const c = classifyComponents("V, S, M/DF (a small pulley)");
    expect(c).toMatchObject({
      material: true,
      divineFocus: true,
      details: { material: "a small pulley" },
    });
  });
  it("F/DF (Locate Object)", () => {
    const c = classifyComponents("V, S, F/DF (a forked twig)");
    expect(c).toMatchObject({
      focus: true,
      divineFocus: true,
      details: { focus: "a forked twig" },
    });
  });
  it("M y F juntos, con comas dentro de los paréntesis", () => {
    const c = classifyComponents(
      "V, S, M (herbs, oils, and incense worth at least 1,000 gp), F (a silver mirror), DF",
    );
    expect(c).toMatchObject({ material: true, focus: true, divineFocus: true });
    expect(c.details).toEqual({
      material: "herbs, oils, and incense worth at least 1,000 gp",
      focus: "a silver mirror",
    });
  });
  it("XP", () => {
    expect(classifyComponents("V, S, M (a pearl), XP")).toMatchObject({ xp: true, material: true });
  });
  it("la nota tras ';' no cambia las banderas", () => {
    expect(classifyComponents("V, S; see text")).toMatchObject({
      verbal: true,
      somatic: true,
      material: false,
    });
  });
  it("tokens desconocidos: se ignoran en las banderas y se avisan aparte", () => {
    expect(classifyComponents("V, X, S")).toMatchObject({ verbal: true, somatic: true });
    expect(unrecognizedComponentTokens("V, X, S")).toEqual(["X"]);
    expect(unrecognizedComponentTokens("V, S, M (a pearl), DF")).toEqual([]);
  });
});

describe("targetingKindFromLabel (R96)", () => {
  it.each([
    ["Target", "target"],
    ["Targets", "target"],
    ["Area", "area"],
    ["Effect", "effect"],
    ["Target or Area", "other"],
    ["Target, Effect, or Area", "other"],
  ])("%s", (label, kind) => {
    expect(targetingKindFromLabel(label)).toBe(kind);
  });
});

describe("classifySpellFields (R96)", () => {
  it("clasifica todos los campos de Magic Missile", () => {
    const fields = classifySpellFields({
      castingTime: "1 standard action",
      components: "V, S",
      range: "medium (100 ft. + 10 ft./level)",
      targeting: [
        {
          kind: "target",
          raw: "up to five creatures, no two of which can be more than 15 ft. apart",
        },
      ],
      duration: "instantaneous",
      savingThrow: "none",
      spellResistance: "yes",
    });
    expect(fields.castingTime).toMatchObject({ unit: "standard", amount: 1 });
    expect(fields.range.kind).toBe("medium");
    expect(fields.targeting).toHaveLength(1);
    expect(fields.duration.kind).toBe("instantaneous");
    expect(fields.savingThrow.kind).toBe("none");
    expect(fields.spellResistance.applies).toBe("yes");
  });
  it("es pura: dos llamadas dan el mismo resultado", () => {
    const raw = {
      castingTime: "10 minutes",
      components: "V, S, M (holy or unholy water and incense worth 500 gp), DF",
      range: "personal",
      targeting: [],
      duration: "1 round/level",
      savingThrow: "",
      spellResistance: "",
    };
    expect(classifySpellFields(raw)).toEqual(classifySpellFields(raw));
  });
});
