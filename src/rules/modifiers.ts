// CRB: Chapter 9 Magic, "Combining Magic Effects" (Bonus Types, Stacking Effects) y la tabla
// "Bonus Types and Effects" del SRD.
//   - Dos bonificadores del mismo tipo no se apilan: solo cuenta el mejor. Excepciones que sí se
//     apilan: dodge, circumstance y racial. Los bonificadores sin tipo siempre se apilan.
//   - "The same principle applies to penalties": de varios penalizadores del mismo tipo solo cuenta
//     el peor; la mayoría de los penalizadores no tiene tipo y por eso siempre se apilan.
//   - Un bonificador y un penalizador (aunque sean del mismo tipo) se suman entre sí.
// Fuentes: https://www.d20pfsrd.com/magic/ ("Bonus Types", "Stacking Effects"),
//          https://www.d20pfsrd.com/basics-ability-scores/glossary/ ("Bonus", "Penalty").
import { err, ok, type Result } from "./result";
import {
  BONUS_TYPES,
  type Breakdown,
  type BreakdownLine,
  type ExcludedReason,
  type Modifier,
  type ModifierType,
} from "./types";

export interface ResolveOptions {
  readonly excluded?: ReadonlyMap<string, ExcludedReason>;
}

const VALID_TYPES: ReadonlySet<string> = new Set<string>([...BONUS_TYPES, "base", "ability"]);

// Tipos que siempre suman (R9/R12). "racial" es una excepción del SRD (ver informe, desviación D1).
const ALWAYS_STACK: ReadonlySet<ModifierType> = new Set<ModifierType>([
  "base",
  "ability",
  "dodge",
  "circumstance",
  "racial",
  "untyped",
]);

function validate(modifiers: readonly Modifier[]): Result<true> {
  const seen = new Set<string>();
  for (const m of modifiers) {
    if (!VALID_TYPES.has(m.type)) {
      return err("invalid_modifier_type", `Unknown modifier type "${String(m.type)}"`, m.id);
    }
    if (!Number.isInteger(m.value)) {
      return err("invalid_modifier_value", `Modifier "${m.id}" must have an integer value`, m.id);
    }
    if (seen.has(m.id)) {
      return err("duplicate_modifier_id", `Duplicate modifier id "${m.id}"`, m.id);
    }
    seen.add(m.id);
  }
  return ok(true);
}

function baseLine(m: Modifier): Omit<BreakdownLine, "status"> {
  return {
    id: m.id,
    name: m.name,
    type: m.type,
    value: m.value,
    ...(m.adjustment === undefined ? {} : { adjustment: m.adjustment }),
  };
}

export function resolveModifiers(
  stat: string,
  modifiers: readonly Modifier[],
  options: ResolveOptions = {},
): Result<Breakdown> {
  const valid = validate(modifiers);
  if (!valid.ok) return valid;

  const excluded = options.excluded;
  // Ganador por (tipo, signo): bonificadores (>= 0) y penalizadores (< 0) compiten por separado.
  const bonusWinner = new Map<string, Modifier>();
  const penaltyWinner = new Map<string, Modifier>();
  for (const m of modifiers) {
    if (excluded?.has(m.id) || ALWAYS_STACK.has(m.type)) continue;
    if (m.value >= 0) {
      const w = bonusWinner.get(m.type);
      // CRB: solo el mayor; empate -> el primero en el orden de entrada (R13).
      if (w === undefined || m.value > w.value) bonusWinner.set(m.type, m);
    } else {
      const w = penaltyWinner.get(m.type);
      if (w === undefined || m.value < w.value) penaltyWinner.set(m.type, m);
    }
  }

  const lines: BreakdownLine[] = modifiers.map((m): BreakdownLine => {
    const reason = excluded?.get(m.id);
    if (reason !== undefined) {
      return { ...baseLine(m), status: "excluded", excludedReason: reason };
    }
    if (ALWAYS_STACK.has(m.type)) return { ...baseLine(m), status: "applied" };
    const winner = m.value >= 0 ? bonusWinner.get(m.type) : penaltyWinner.get(m.type);
    if (winner === undefined || winner.id === m.id) return { ...baseLine(m), status: "applied" };
    return { ...baseLine(m), status: "suppressed", suppressedBy: winner.id };
  });

  const total = lines.reduce((sum, l) => (l.status === "applied" ? sum + l.value : sum), 0);
  return ok({ stat, total, lines });
}
