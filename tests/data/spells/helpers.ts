import {
  classifyCastingTime,
  classifyComponents,
  classifyDuration,
  classifyRange,
  classifySavingThrow,
  classifySpellResistance,
} from "../../../src/data/spells/fields";

/** Conjuro válido (Magic Missile) con los campos estructurados derivados de su `raw`. */
export function spellEntry(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "magic-missile",
    name: "Magic Missile",
    textEn: "A missile of magical energy darts forth from your fingertip.",
    source: "https://www.aonprd.com/SpellDisplay.aspx?ItemName=Magic Missile",
    sourceRef: "PRPG Core Rulebook pg. 309",
    book: "CRB",
    school: "evocation",
    descriptors: ["force"],
    levels: { sorcerer: 1, wizard: 1 },
    castingTime: classifyCastingTime("1 standard action"),
    components: classifyComponents("V, S"),
    range: classifyRange("medium (100 ft. + 10 ft./level)"),
    targeting: [{ kind: "target", raw: "up to five creatures" }],
    duration: classifyDuration("instantaneous"),
    savingThrow: classifySavingThrow("none"),
    spellResistance: classifySpellResistance("yes"),
    ...over,
  };
}
