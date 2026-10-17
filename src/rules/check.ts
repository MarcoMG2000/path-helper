// CRB: Chapter 8 Combat / Chapter 4 Skills, "Skill Checks": se tira 1d20 y se suma el modificador.
// Este módulo no interpreta 1 y 20 naturales (eso corresponde a la feature que resuelva ataques y
// salvaciones con dado).
import { err, ok, type Result } from "./result";
import type { Breakdown } from "./types";

export interface CheckResult {
  readonly d20: number;
  readonly modifier: number;
  readonly total: number;
  readonly breakdown: Breakdown;
}

export function applyD20(breakdown: Breakdown, d20: number): Result<CheckResult> {
  if (!Number.isInteger(d20) || d20 < 1 || d20 > 20) {
    return err("invalid_d20", "The d20 result must be an integer between 1 and 20", "d20");
  }
  return ok({ d20, modifier: breakdown.total, total: d20 + breakdown.total, breakdown });
}
