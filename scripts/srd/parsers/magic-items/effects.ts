import { slugify } from "../../../../src/data/schema/common";
import type {
  CritMultiplier,
  ExtraDamage,
  MagicEffect,
  MagicItemKind,
} from "../../../../src/data/schema/magic-item";
import { splitSentences } from "./legal-for";

// Extracción determinista de efectos numéricos (R72-R78, design §14.4). Patrón único sobre `textEn`:
// `[+-]N <tipo> bonus|penalty (on|to) <objetivo>` con el tipo del catálogo de f2 y el objetivo del
// vocabulario de R74. Cada efecto guarda como `evidence` la frase literal; lo que no encaja queda sin
// estructurar y lo recoge `findEffectGaps` (R88). Nunca se infiere un valor que el texto no diga.

const TYPE_WORDS: Readonly<Record<string, MagicEffect["bonusType"]>> = {
  enhancement: "enhancement",
  resistance: "resistance",
  deflection: "deflection",
  "natural armor": "naturalArmor",
  competence: "competence",
  luck: "luck",
  morale: "morale",
  insight: "insight",
  sacred: "sacred",
  profane: "profane",
  armor: "armor",
  shield: "shield",
  dodge: "dodge",
  circumstance: "circumstance",
  alchemical: "alchemical",
  racial: "racial",
  size: "size",
  inherent: "inherent",
};
const TYPE_ALT = Object.keys(TYPE_WORDS)
  .sort((a, b) => b.length - a.length)
  .join("|");

/** Habilidades del CRB (ids = slug del nombre, igual que la categoría `skills`, R84). */
const SKILL_NAMES = [
  "Acrobatics",
  "Appraise",
  "Bluff",
  "Climb",
  "Diplomacy",
  "Disable Device",
  "Disguise",
  "Escape Artist",
  "Fly",
  "Handle Animal",
  "Heal",
  "Intimidate",
  "Linguistics",
  "Perception",
  "Ride",
  "Sense Motive",
  "Sleight of Hand",
  "Spellcraft",
  "Stealth",
  "Survival",
  "Swim",
  "Use Magic Device",
] as const;
const SKILL_ALT = [...SKILL_NAMES].sort((a, b) => b.length - a.length).join("|");

const ABILITY_TARGET: Readonly<Record<string, MagicEffect["target"]>> = {
  strength: "ability.str",
  dexterity: "ability.dex",
  constitution: "ability.con",
  intelligence: "ability.int",
  wisdom: "ability.wis",
  charisma: "ability.cha",
};

const SIGN = "[+\\-–−]";
const NUM = `${SIGN}\\s?\\d+`;
const SPEC = `${NUM}(?:\\s*(?:to|or)\\s*${SIGN}?\\s?\\d+|(?:,\\s*${NUM})+,?\\s*(?:or|and)\\s*${NUM})?`;

// Resto de la frase tras «on|to»: no cruza puntos, saltos de línea ni una segunda cláusula «and a +N».
const REST = `(?:(?!\\s+and\\s+(?:an?\\s+)?${NUM})[^.;\\n])*`;

const FORM_A = new RegExp(
  `(?<spec>${SPEC})\\s+(?<type>${TYPE_ALT})\\s+(?<kind>bonus|penalty)(?:\\s+(?<prep>on|to)\\s+(?<rest>${REST}))?`,
  "gi",
);
const FORM_B = new RegExp(
  `(?<type>${TYPE_ALT})\\s+(?<kind>bonus|penalty)\\s+(?<of>of|from)\\s+(?<spec>${SPEC})(?:\\s+(?<prep>on|to)\\s+(?<rest>${REST}))?`,
  "gi",
);
const FORM_C = new RegExp(
  `(?<type>${TYPE_ALT})\\s+(?<kind>bonus)\\s+to\\s+(?:(?:his|her|its|their|your)\\s+)?(?<ability>Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)(?:\\s+score)?\\s+of\\s+(?<spec>${SPEC})`,
  "gi",
);
const FORM_D = new RegExp(
  `(?<type>enhancement)\\s+(?<kind>bonus)\\s+to\\s+(?:(?:his|her|its|their|your)\\s+)?natural armor(?:\\s+bonus)?\\s+(?:of|from)\\s+(?<spec>${SPEC})`,
  "gi",
);
// «an enhancement bonus to all physical ability scores (Strength, Dexterity, and Constitution) of +2, +4, or +6»
const FORM_E = new RegExp(
  `(?<type>${TYPE_ALT})\\s+(?<kind>bonus)\\s+to\\s+all\\s+(?:physical|mental)\\s+ability\\s+scores\\s+\\((?<abilities>[^)]*)\\)\\s+of\\s+(?<spec>${SPEC})`,
  "gi",
);

/** Cualquier mención de un bonificador/penalizador tipado con número (R88, detección de huecos). */
const TYPED_MENTION = new RegExp(
  `(?:${NUM}\\s+(?:${TYPE_ALT})\\s+(?:bonus|penalty))|(?:(?:${TYPE_ALT})\\s+(?:bonus|penalty)\\s+(?:of|from|to [a-z' ]{1,30}? of)\\s+${NUM})`,
  "i",
);

const CONDITIONAL_MARKER =
  /\b(against|when|while|if|only|once per day|per day|times per day|for \d+|on command|as a (?:standard|move|swift|free)|made to|related to|relate|whenever|until|activate[sd]?|command word|unarmed|natural weapons|sneak attack|as if|as per|including|in (?:animal|natural|rod|staff|alternate|true) form)\b/i;

/** Beneficiarios que no son el portador: el efecto no se asigna al objeto (queda como hueco, R88). */
const FOREIGN_SUBJECT =
  /\b(troops|those who|creatures?|allies|friendly|enemies|unfriendly|foes?|familiar|animals?|targets?|opponents?|ammunition|arrows?|bolts?|spine|imp|cougar|the weapon|the whip|animated|golem|construct)\b/i;

interface Plain {
  /** Texto sin marcas `*`. */
  text: string;
  /** Posición en el original de cada carácter de `text`. */
  map: number[];
}

function toPlain(original: string): Plain {
  let text = "";
  const map: number[] = [];
  for (let i = 0; i < original.length; i++) {
    if (original[i] === "*") continue;
    text += original[i];
    map.push(i);
  }
  return { text, map };
}

function slice(original: string, plain: Plain, from: number, to: number): string {
  // `to` es exclusivo en `plain.text`
  if (to <= from) return "";
  return original.slice(plain.map[from]!, plain.map[to - 1]! + 1);
}

function signed(token: string): number {
  const negative = /^[-–−]/.test(token.trim());
  const n = Number(token.replace(/[^\d]/g, ""));
  return negative ? -n : n;
}

/** Valores admitidos por la especificación: un valor, un rango «+1 to +5» o una lista. */
function specValues(spec: string): { kind: "single" | "set"; values: number[] } {
  const nums = spec.match(new RegExp(NUM, "g")) ?? [];
  const values = nums.map(signed);
  const range = new RegExp(`^(${NUM})\\s*to\\s*(${SIGN}?\\s?\\d+)$`, "i").exec(spec.trim());
  if (range) {
    const a = signed(range[1]!);
    const bToken = range[2]!;
    const b = signed(/^[+\-–−]/.test(bToken) ? bToken : `${a < 0 ? "-" : "+"}${bToken}`);
    const out: number[] = [];
    for (let v = Math.min(a, b); v <= Math.max(a, b); v++) out.push(v);
    return { kind: "set", values: out };
  }
  if (values.length > 1) return { kind: "set", values };
  return { kind: "single", values };
}

interface TargetResolution {
  targets: MagicEffect["target"][];
  /** Caracteres consumidos de `rest`. */
  consumed: number;
  foldInto?: MagicEffect["foldInto"];
}

const DETERMINER =
  /^(?:(?:(?:the|its|his|her) (?:wearer|wielder|possessor|owner|bearer)[’']s|all|his|her|its|their|your|the|other|any|such|each)\s+)+/i;

function skillTarget(name: string): MagicEffect["target"] {
  return `skill.${slugify(name)}` as MagicEffect["target"];
}

function resolveTargets(rest: string): TargetResolution | undefined {
  const lead = DETERMINER.exec(rest)?.[0] ?? "";
  const s = rest.slice(lead.length);
  const at = (
    m: RegExpExecArray | null,
    targets: MagicEffect["target"][],
  ): TargetResolution | undefined =>
    m ? { targets, consumed: lead.length + m[0].length } : undefined;

  let m: RegExpExecArray | null;
  if ((m = /^(?:AC|Armor Class)\b/.exec(s))) return at(m, ["ac"]);
  if (
    (m =
      /^(?:Fortitude|Reflex|Will)(?:(?:,\s*|\s+and\s+|,\s*and\s+|\s+or\s+)(?:Fortitude|Reflex|Will))*\s+(?:saves|saving throws)\b/i.exec(
        s,
      ))
  ) {
    const targets = (["fortitude", "reflex", "will"] as const)
      .filter((w) => new RegExp(`\\b${w}\\b`, "i").test(m![0]))
      .map((w) => `save.${w}` as MagicEffect["target"]);
    return at(m, targets.length === 3 ? ["save.all"] : targets);
  }
  if ((m = /^(?:saving throws|saves)\b/i.exec(s))) return at(m, ["save.all"]);
  if ((m = /^attack and damage rolls\b/i.exec(s))) return at(m, ["attack", "damage"]);
  if ((m = /^attack rolls\b/i.exec(s))) return at(m, ["attack"]);
  if ((m = /^damage rolls\b/i.exec(s))) return at(m, ["damage"]);
  if ((m = /^initiative checks?\b/i.exec(s))) return at(m, ["initiative"]);
  if ((m = /^natural armor\b/i.exec(s))) return at(m, ["ac"]);
  if (
    (m =
      /^(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\b(?!-based| checks)(?: score)?/i.exec(
        s,
      ))
  ) {
    return at(m, [ABILITY_TARGET[m[1]!.toLowerCase()]!]);
  }
  // «Perception and Sense Motive checks», «Swim checks and Climb checks», «Stealth checks»
  const skills = new RegExp(
    `^((?:${SKILL_ALT})(?:(?:\\s+checks?)?(?:,\\s*|\\s+and\\s+|,\\s*and\\s+|\\s+or\\s+)(?:${SKILL_ALT}))*)(?:\\s+skill)?\\s+checks?\\b`,
    "i",
  ).exec(s);
  if (skills) {
    const names = [...skills[1]!.matchAll(new RegExp(SKILL_ALT, "gi"))].map((x) => x[0]);
    return at(skills, [...new Set(names.map(skillTarget))]);
  }
  return undefined;
}

const LIST_SEPARATOR = /^(?:\s*,\s*(?:and\s+|or\s+)?|\s+(?:and|or)\s+)(?:(?:on|to)\s+)?/i;
const LOOKS_LIKE_TARGET = /^[^,.;]{1,45}?\b(?:checks?|rolls?|saves|saving throws)\b/i;

/**
 * Objetivos de la frase, con listas («Fortitude saves and AC», «on AC and on saving throws»). Si tras
 * un objetivo sigue otro elemento de lista que parece un objetivo pero no se sabe resolver
 * («attack rolls, saves, skill checks, and ability checks»), se omite el efecto entero: un efecto
 * parcial sería peor que ninguno (queda como hueco, R88).
 */
function resolveTargetList(rest: string): TargetResolution | undefined {
  const first = resolveTargets(rest);
  if (!first) return undefined;
  let consumed = first.consumed;
  const targets = [...first.targets];
  for (;;) {
    const sep = LIST_SEPARATOR.exec(rest.slice(consumed));
    if (!sep) break;
    const after = rest.slice(consumed + sep[0].length);
    if (new RegExp(`^(?:an?\\s+)?${NUM}`).test(after)) break; // otra cláusula con su propio bonificador
    const next = resolveTargets(after);
    if (next) {
      consumed += sep[0].length + next.consumed;
      targets.push(...next.targets);
    } else if (LOOKS_LIKE_TARGET.test(after)) {
      return undefined;
    } else {
      break;
    }
  }
  return {
    targets: [...new Set(targets)],
    consumed,
    ...(first.foldInto === undefined ? {} : { foldInto: first.foldInto }),
  };
}

export interface EffectVariantInput {
  variantId: string;
  label: string;
}

export interface ExtractedEffects {
  perVariant: Map<string, MagicEffect[]>;
  /** Menciones con tipo que se resolvieron (para el informe). */
  resolved: number;
}

/** Región de descripción: tras la línea de cabecera y antes de `**Construction**`. */
export function descriptionRegion(textEn: string): string {
  const start = textEn.indexOf("\n\n");
  const end = textEn.indexOf("\n\n**Construction**");
  return textEn.slice(start < 0 ? 0 : start + 2, end < 0 ? undefined : end);
}

/** Descripción sin cabeceras de sección ni marcas de énfasis, en una sola línea (para las frases). */
export function descriptionPlain(textEn: string): string {
  return descriptionRegion(textEn)
    .split("\n")
    .filter((line) => !/^\*\*[^*]+\*\*$/.test(line.trim()))
    .join(" ")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Variantes con etiqueta `+N`: el valor del bono de cada una. */
function variantBonus(v: EffectVariantInput): number | undefined {
  const m = /^\+\s*(\d+)$/.exec(v.label.trim());
  return m ? Number(m[1]) : undefined;
}

function appliesToFor(kind: MagicItemKind, target: MagicEffect["target"]): "wearer" | "item" {
  return (kind === "weapon-ability" || kind === "specific-weapon") &&
    (target === "attack" || target === "damage")
    ? "item"
    : "wearer";
}

/**
 * Efectos estructurados de cada variante a partir de `textEn`. Los valores con rango o lista se
 * resuelven con la etiqueta `+N` de cada variante; si las variantes no la traen, se omiten (hueco).
 */
export function extractEffects(
  kind: MagicItemKind,
  textEn: string,
  variants: readonly EffectVariantInput[],
  options: { skipItemEnhancement?: boolean } = {},
): ExtractedEffects {
  const region = descriptionRegion(textEn);
  const plain = toPlain(region);
  const perVariant = new Map<string, MagicEffect[]>(variants.map((v) => [v.variantId, []]));
  let resolved = 0;

  // Frases (en el texto plano) para el contexto condicional.
  const sentenceBounds: [number, number][] = [];
  {
    let pos = 0;
    for (const line of plain.text.split("\n")) {
      for (const sentence of splitSentences(line)) {
        const from = plain.text.indexOf(sentence, pos);
        sentenceBounds.push([from, from + sentence.length]);
        pos = from + sentence.length;
      }
      pos += 1;
    }
  }
  const sentenceAt = (index: number): [number, number] =>
    sentenceBounds.find(([a, b]) => index >= a && index < b) ?? [0, plain.text.length];

  interface Mention {
    start: number;
    end: number;
    spec: string;
    type: string;
    kindWord: string;
    targets: TargetResolution | undefined;
    implicitAc: boolean;
  }
  const mentions: Mention[] = [];
  const taken: [number, number][] = [];
  const overlaps = (a: number, b: number): boolean => taken.some(([x, y]) => a < y && b > x);

  const addMention = (
    m: RegExpExecArray,
    resolver: (g: Record<string, string | undefined>) => TargetResolution | undefined,
  ): void => {
    const g = m.groups!;
    const start = m.index;
    const targets = resolver(g);
    const end =
      start + (targets ? m[0].length - ((g["rest"] ?? "").length - targets.consumed) : m[0].length);
    if (overlaps(start, end)) return;
    taken.push([start, end]);
    mentions.push({
      start,
      end,
      spec: g["spec"]!,
      type: g["type"]!.toLowerCase(),
      kindWord: g["kind"]!.toLowerCase(),
      targets,
      implicitAc: targets !== undefined && g["rest"] === undefined,
    });
  };

  for (const m of plain.text.matchAll(FORM_E)) {
    addMention(m, (g) => {
      const names = (g["abilities"] ?? "")
        .split(/,\s*(?:and\s+)?|\s+and\s+/)
        .map((n) => n.trim().toLowerCase())
        .filter((n) => n !== "");
      const targets = names.map((n) => ABILITY_TARGET[n]);
      if (targets.length === 0 || targets.some((t) => t === undefined)) return undefined;
      return { targets: targets as MagicEffect["target"][], consumed: 0 };
    });
  }
  for (const m of plain.text.matchAll(FORM_D)) {
    addMention(m, () => ({ targets: ["ac"], consumed: 0, foldInto: "naturalArmor" }));
  }
  for (const m of plain.text.matchAll(FORM_C)) {
    addMention(m, (g) => ({
      targets: [ABILITY_TARGET[g["ability"]!.toLowerCase()]!],
      consumed: 0,
    }));
  }
  for (const m of plain.text.matchAll(FORM_B)) {
    addMention(m, (g) => {
      if (g["rest"] !== undefined) return resolveTargetList(g["rest"]);
      // «an armor bonus of +1 to +8, just as though he were wearing armor»: el bono de armadura es a la CA
      return g["type"]!.toLowerCase() === "armor" ? { targets: ["ac"], consumed: 0 } : undefined;
    });
  }
  for (const m of plain.text.matchAll(FORM_A)) {
    addMention(m, (g) => (g["rest"] !== undefined ? resolveTargetList(g["rest"]) : undefined));
  }
  mentions.sort((a, b) => a.start - b.start);

  for (const mention of mentions) {
    if (!mention.targets) continue;
    const bonusType = TYPE_WORDS[mention.type.replace(/\s+/g, " ")];
    if (bonusType === undefined) continue;
    const spec = specValues(mention.spec);
    const [sFrom, sTo] = sentenceAt(mention.start);
    if (FOREIGN_SUBJECT.test(plain.text.slice(sFrom, sTo))) continue;
    const evidenceOriginal = slice(region, plain, mention.start, mention.end);
    const tailStart = mention.end;
    const tail = plain.text.slice(tailStart, sTo);
    const head = plain.text.slice(sFrom, mention.start);
    const conditional = CONDITIONAL_MARKER.test(head + " " + tail);
    const conditionText = conditional ? slice(region, plain, sFrom, sTo) : undefined;

    for (const variant of variants) {
      let value: number | undefined;
      if (spec.kind === "single") {
        value = spec.values[0];
      } else {
        const wanted = variantBonus(variant);
        if (wanted !== undefined && spec.values.includes(wanted)) value = wanted;
      }
      if (value === undefined || value === 0) continue;
      if (mention.kindWord === "penalty" && value > 0) value = -value;
      for (const target of mention.targets.targets) {
        if (
          options.skipItemEnhancement === true &&
          bonusType === "enhancement" &&
          (target === "ac" || target === "attack" || target === "damage")
        ) {
          continue; // la mejora del objeto está en `enhancement` (getEnhancementEffects)
        }
        const effect: MagicEffect = {
          target,
          bonusType,
          value,
          appliesTo: appliesToFor(kind, target),
          conditional,
          ...(conditionText === undefined ? {} : { conditionText }),
          ...(mention.targets.foldInto === undefined ? {} : { foldInto: mention.targets.foldInto }),
          evidence: evidenceOriginal,
        };
        perVariant.get(variant.variantId)!.push(effect);
      }
    }
    resolved++;
  }
  return { perVariant, resolved };
}

// --- daño adicional (R78) -----------------------------------------------------------------------

const EXTRA_DAMAGE =
  /(?:an?\s+)?(?:extra|additional)\s+(?<dice>\d+d\d+)(?:\s+points?\s+of\s+(?:(?<type>fire|cold|electricity|acid|sonic|holy|unholy|force)\s+)?damage|\s+points?(?=[\s.,;])|\s+(?:(?<type2>fire|cold|electricity|acid|sonic|holy|unholy|force)\s+)?damage)(?<tail>[^.,;]*)/gi;

const CONDITIONAL_DAMAGE = /\b(against|when|while|if|only|once per day|outdoors)\b/i;

/** Último «×N» (multiplicador de crítico) mencionado en `text`; `undefined` si no hay. */
function lastMultiplier(text: string): CritMultiplier | undefined {
  let found: CritMultiplier | undefined;
  for (const m of text.matchAll(/×\s?([234])\b/g)) found = Number(m[1]) as CritMultiplier;
  return found;
}

/**
 * Daño adicional por dados de una habilidad o arma (R78); [] si no hay. Sin tipo en el texto =
 * "untyped" (los «×3/×4» heredan el tipo anterior). Cuando el daño crítico depende del
 * multiplicador del arma («If the weapon's critical multiplier is ×3, add an extra 2d10 ...
 * instead, and if the multiplier is ×4, add an extra 3d10»), cada alternativa lleva su
 * `critMultiplier` y la primera (la que no menciona multiplicador) es la de ×2.
 */
export function extractExtraDamage(textEn: string): ExtraDamage[] {
  const region = descriptionRegion(textEn);
  const plain = toPlain(region);
  const out: ExtraDamage[] = [];
  let lastType: string | undefined;
  for (const m of plain.text.matchAll(EXTRA_DAMAGE)) {
    const tail = m.groups!["tail"]!;
    const start = m.index;
    const end = start + m[0].length;
    const evidence = slice(region, plain, start, end).trim();
    // Contexto: la frase completa en la que está la mención (desde el punto anterior).
    const sentenceStart = Math.max(
      plain.text.lastIndexOf(".", start - 1),
      plain.text.lastIndexOf("\n", start - 1),
    );
    const sentence = plain.text.slice(sentenceStart + 1, end);
    const multiplier = /critical multiplier/i.test(sentence);
    let type = (m.groups!["type"] ?? m.groups!["type2"])?.toLowerCase();
    if (type === undefined && multiplier) type = lastType;
    if (type !== undefined) lastType = type;
    let trigger: ExtraDamage["trigger"] = "always";
    let conditionText: string | undefined;
    let critMultiplier: CritMultiplier | undefined;
    if (multiplier) {
      trigger = "onCritical";
      critMultiplier = lastMultiplier(plain.text.slice(sentenceStart + 1, start));
    } else if (
      CONDITIONAL_DAMAGE.test(
        sentence.replace(/\bwhen an? [a-z ]+? (?:strikes|hits)\b[^,]*,/i, "") + tail,
      )
    ) {
      trigger = "conditional";
      conditionText = evidence;
    } else if (/critical hit/i.test(sentence + tail)) {
      trigger = "onCritical";
    }
    out.push({
      dice: m.groups!["dice"]!,
      damageType: type ?? "untyped",
      trigger,
      ...(conditionText === undefined ? {} : { conditionText }),
      ...(critMultiplier === undefined ? {} : { critMultiplier }),
      evidence,
    });
  }
  // La alternativa base («an extra 1d10 ... on a successful critical hit», sin multiplicador) es
  // la de ×2: las demás la sustituyen («instead»). Solo si el texto distingue multiplicadores.
  for (const base of out) {
    if (base.trigger !== "onCritical" || base.critMultiplier !== undefined) continue;
    if (
      out.some(
        (o) => o !== base && o.damageType === base.damageType && o.critMultiplier !== undefined,
      )
    ) {
      base.critMultiplier = 2;
    }
  }
  return out.map((d) => (d.critMultiplier === undefined ? d : orderKeys(d)));
}

/** Claves en el orden canónico del schema (la salida JSON es estable, R44). */
function orderKeys(d: ExtraDamage): ExtraDamage {
  return {
    dice: d.dice,
    damageType: d.damageType,
    trigger: d.trigger,
    ...(d.conditionText === undefined ? {} : { conditionText: d.conditionText }),
    ...(d.critMultiplier === undefined ? {} : { critMultiplier: d.critMultiplier }),
    evidence: d.evidence,
  };
}

// --- huecos (R88, R90) --------------------------------------------------------------------------

export interface GapEntry {
  id: string;
  kind: string;
  textEn: string;
  enhancement?: unknown;
  variants: readonly { effects: readonly unknown[] }[];
}

/**
 * Entradas con un bonificador tipado numérico en el texto y ningún efecto estructurado, para
 * revisión humana (R88). Los objetos específicos con `enhancement` declarado y las secciones
 * `general` no cuentan: su mejora ya está estructurada o es texto de reglas.
 */
export function findEffectGaps(entries: readonly Record<string, unknown>[]): string[] {
  const out: string[] = [];
  for (const raw of entries) {
    const entry = raw as unknown as GapEntry;
    if (typeof entry.id !== "string" || typeof entry.textEn !== "string") continue;
    if (entry.kind === "general") continue;
    const variants = Array.isArray(entry.variants) ? entry.variants : [];
    const hasEffects = variants.some((v) => Array.isArray(v.effects) && v.effects.length > 0);
    if (hasEffects) continue;
    if (entry.enhancement !== undefined && /^specific-/.test(entry.kind)) continue;
    const region = descriptionRegion(entry.textEn).replace(/\*/g, "");
    if (TYPED_MENTION.test(region)) out.push(entry.id);
  }
  return out.sort();
}
