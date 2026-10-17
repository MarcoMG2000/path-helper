import type { z } from "zod";
import type {
  CastingTimeSchema,
  ComponentsSchema,
  DurationSchema,
  RangeSchema,
  SavingThrowSchema,
  SpellResistanceSchema,
  TargetingSchema,
} from "../schema/spell";

// R96: lectura estructurada de los campos de cabecera de un conjuro a partir de su texto `raw`.
// Funciones puras que usan por igual el parser y la regla de integridad. Lo que no se sabe clasificar
// sale como `kind: "other"` con `raw` intacto: nunca se inventa. No se calcula nada que dependa del
// nivel de lanzador (las fórmulas `25 ft. + 5 ft./2 levels` quedan en `raw`).

export type CastingTime = z.infer<typeof CastingTimeSchema>;
export type Components = z.infer<typeof ComponentsSchema>;
export type Range = z.infer<typeof RangeSchema>;
export type Targeting = z.infer<typeof TargetingSchema>;
export type Duration = z.infer<typeof DurationSchema>;
export type SavingThrow = z.infer<typeof SavingThrowSchema>;
export type SpellResistance = z.infer<typeof SpellResistanceSchema>;

export interface SpellRawFields {
  castingTime: string;
  components: string;
  range: string;
  /** `kind` viene de la etiqueta de la página (`Target`, `Area`, `Effect`); `raw` es su valor. */
  targeting: readonly Targeting[];
  duration: string;
  savingThrow: string;
  spellResistance: string;
}

export interface SpellStructuredFields {
  castingTime: CastingTime;
  components: Components;
  range: Range;
  targeting: Targeting[];
  duration: Duration;
  savingThrow: SavingThrow;
  spellResistance: SpellResistance;
}

function clean(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** Minúsculas, espacios colapsados y puntuación tipográfica a ASCII, solo para comparar. */
function norm(raw: string): string {
  return clean(raw).replace(/[‘’]/g, "'").replace(/[–—−]/g, "-").toLowerCase();
}

// --- Tiempo de lanzamiento ---------------------------------------------------------------------

const TIME_UNITS: Readonly<Record<string, CastingTime["unit"]>> = {
  round: "round",
  rounds: "round",
  minute: "minute",
  minutes: "minute",
  hour: "hour",
  hours: "hour",
};

export function classifyCastingTime(raw: string): CastingTime {
  const text = norm(raw);
  const action = /^(\d+) (free|immediate|swift|standard|full[- ]round) actions?$/.exec(text);
  if (action && Number(action[1]) > 0) {
    const unit = action[2]!.replace(" ", "-") as CastingTime["unit"];
    return { raw, unit, amount: Number(action[1]) };
  }
  const time = /^(\d+) (rounds?|minutes?|hours?)$/.exec(text);
  if (time && Number(time[1]) > 0) {
    return { raw, unit: TIME_UNITS[time[2]!]!, amount: Number(time[1]) };
  }
  return { raw, unit: "other", amount: null };
}

// --- Componentes -------------------------------------------------------------------------------

/** Divide por `separator` solo fuera de paréntesis. */
function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === separator && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

const COMPONENT_SYMBOLS = new Set(["V", "S", "M", "F", "DF", "XP"]);

interface ComponentToken {
  symbols: string[];
  detail: string | undefined;
}

function componentTokens(raw: string): { tokens: ComponentToken[]; unknown: string[] } {
  // Lo que sigue a un `;` de nivel superior ("V, S; see text") es una nota: no cambia las banderas.
  const list = splitTopLevel(clean(raw), ";")[0] ?? "";
  const tokens: ComponentToken[] = [];
  const unknown: string[] = [];
  for (const piece of splitTopLevel(list, ",")) {
    const text = piece.trim();
    if (text === "") continue;
    const match = /^([A-Za-z]+(?:\/[A-Za-z]+)*)\s*(?:\((.*)\))?$/.exec(text);
    if (!match) {
      unknown.push(text);
      continue;
    }
    const symbols = match[1]!.split("/");
    if (!symbols.every((s) => COMPONENT_SYMBOLS.has(s))) {
      unknown.push(text);
      continue;
    }
    tokens.push({ symbols, detail: match[2]?.trim() || undefined });
  }
  return { tokens, unknown };
}

/** Fragmentos de `components` que `classifyComponents` no reconoce (el parser los avisa). */
export function unrecognizedComponentTokens(raw: string): string[] {
  return componentTokens(raw).unknown;
}

export function classifyComponents(raw: string): Components {
  const { tokens } = componentTokens(raw);
  const flags = { V: false, S: false, M: false, F: false, DF: false, XP: false };
  const details: NonNullable<Components["details"]> = {};
  for (const { symbols, detail } of tokens) {
    for (const symbol of symbols) flags[symbol as keyof typeof flags] = true;
    // El paréntesis describe el primer símbolo del grupo (`M/DF (polvo de hierro)`: es el material).
    const first = symbols[0];
    if (detail !== undefined) {
      if (first === "M") details.material = detail;
      else if (first === "F") details.focus = detail;
      else if (first === "DF") details.divineFocus = detail;
    }
  }
  const result: Components = {
    verbal: flags.V,
    somatic: flags.S,
    material: flags.M,
    focus: flags.F,
    divineFocus: flags.DF,
    xp: flags.XP,
    raw,
  };
  if (Object.keys(details).length > 0) result.details = details;
  return result;
}

// --- Alcance -----------------------------------------------------------------------------------

export function classifyRange(raw: string): Range {
  const text = norm(raw);
  if (text === "personal" || text === "touch" || text === "unlimited") {
    return { raw, kind: text };
  }
  const named = /^(close|medium|long) \(.+\)$/.exec(text);
  if (named) return { raw, kind: named[1] as "close" | "medium" | "long" };
  const fixed = /^(\d+) ?(?:ft\.?|feet|foot)$/.exec(text);
  if (fixed && Number(fixed[1]) > 0) return { raw, kind: "fixed", fixedFt: Number(fixed[1]) };
  return { raw, kind: "other" };
}

// --- Objetivo, área, efecto -------------------------------------------------------------------

/** Tipo de una línea de objetivo a partir de su etiqueta (`Target`, `Targets`, `Area`, `Effect`). */
export function targetingKindFromLabel(label: string): Targeting["kind"] {
  switch (norm(label)) {
    case "target":
    case "targets":
      return "target";
    case "area":
      return "area";
    case "effect":
      return "effect";
    default:
      return "other"; // "Target or Area", "Target, Effect, or Area"...
  }
}

// --- Duración ----------------------------------------------------------------------------------

const DURATION_UNITS: Readonly<Record<string, NonNullable<Duration["unit"]>>> = {
  round: "round",
  rounds: "round",
  minute: "minute",
  minutes: "minute",
  "min.": "minute",
  hour: "hour",
  hours: "hour",
  day: "day",
  days: "day",
};

export function classifyDuration(raw: string): Duration {
  const dismissible = /\(d\)/i.test(raw);
  const text = norm(raw.replace(/\(\s*d\s*\)/gi, " "));
  if (text === "instantaneous") return { raw, kind: "instantaneous", dismissible };
  if (text === "permanent") return { raw, kind: "permanent", dismissible };
  if (text === "concentration" || /^concentration, up to \d+ \S+$/.test(text)) {
    return { raw, kind: "concentration", dismissible };
  }
  const timed = /^(\d+) (rounds?|minutes?|min\.|hours?|days?)(\/level| per level)?$/.exec(text);
  if (timed && Number(timed[1]) > 0) {
    return {
      raw,
      kind: "timed",
      dismissible,
      amount: Number(timed[1]),
      unit: DURATION_UNITS[timed[2]!]!,
      perLevel: timed[3] !== undefined,
    };
  }
  return { raw, kind: "other", dismissible };
}

// --- Tirada de salvación y resistencia a conjuros ------------------------------------------------

interface Qualifiers {
  base: string;
  harmless: boolean;
  object: boolean;
  /** Paréntesis que no son `harmless` ni `object`. */
  other: string[];
}

/** Separa los paréntesis (`harmless`, `object`) y la nota final `; see text` del núcleo. */
function qualifiers(raw: string): Qualifiers {
  let harmless = false;
  let object = false;
  const other: string[] = [];
  const stripped = norm(raw).replace(/\(([^)]*)\)/g, (_m, inner: string) => {
    for (const token of inner.split(",").map((t) => t.trim())) {
      if (token === "harmless") harmless = true;
      else if (token === "object") object = true;
      else if (token !== "") other.push(token);
    }
    return " ";
  });
  const base = clean(stripped)
    .replace(/\s*[;,]\s*see text$/, "")
    .trim();
  return { base, harmless, object, other };
}

const SAVE_CLAUSE = /^(fortitude|reflex|will) (negates|half|partial|disbelief)$/;

export function classifySavingThrow(raw: string): SavingThrow {
  const { base, harmless, object, other } = qualifiers(raw);
  const unknown: SavingThrow = { raw, kind: "other", harmless: false, object: false };
  if (base === "") return unknown; // la página no trae el campo (conjuros personales)
  if (base === "none") {
    return other.length === 0 ? { raw, kind: "none", harmless, object } : unknown;
  }
  const clause = SAVE_CLAUSE.exec(base);
  if (clause) {
    const effect = clause[2] as NonNullable<SavingThrow["effect"]>;
    const extra = other.filter((o) => !(effect === "disbelief" && o === "if interacted with"));
    if (extra.length === 0) {
      return { raw, kind: clause[1] as "fortitude" | "reflex" | "will", effect, harmless, object };
    }
    return unknown;
  }
  // Varias salvaciones distintas (p. ej. `Fortitude partial, Will negates`).
  const clauses = base.split(/\s*(?:,| and | or )\s*/);
  const parsed = clauses.map((c) => SAVE_CLAUSE.exec(c.trim()));
  if (clauses.length > 1 && parsed.every((p) => p !== null) && other.length === 0) {
    const kinds = new Set(parsed.map((p) => p![1]));
    if (kinds.size > 1) return { raw, kind: "multiple", harmless, object };
  }
  return unknown;
}

export function classifySpellResistance(raw: string): SpellResistance {
  const { base, harmless, object, other } = qualifiers(raw);
  if ((base === "yes" || base === "no") && other.length === 0) {
    return { raw, applies: base, harmless, object };
  }
  return { raw, applies: "other", harmless: false, object: false };
}

// --- Todos los campos --------------------------------------------------------------------------

export function classifySpellFields(raw: SpellRawFields): SpellStructuredFields {
  return {
    castingTime: classifyCastingTime(raw.castingTime),
    components: classifyComponents(raw.components),
    range: classifyRange(raw.range),
    targeting: raw.targeting.map((t) => ({ kind: t.kind, raw: t.raw })),
    duration: classifyDuration(raw.duration),
    savingThrow: classifySavingThrow(raw.savingThrow),
    spellResistance: classifySpellResistance(raw.spellResistance),
  };
}
