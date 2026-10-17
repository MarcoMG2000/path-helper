// Resultado esperado en el tipo de retorno (docs/conventions.md §Errores).

export type RulesErrorCode =
  | "invalid_modifier_type"
  | "invalid_modifier_value"
  | "duplicate_modifier_id"
  | "invalid_ability_score"
  | "ability_score_below_one"
  | "invalid_level"
  | "duplicate_class"
  | "invalid_max_dex"
  | "invalid_d20"
  | "invalid_ranks"
  | "ranks_exceed_level"
  | "invalid_armor_check_penalty";

export interface RulesError {
  readonly code: RulesErrorCode;
  readonly message: string; // para desarrolladores; la UI mapea por `code`
  readonly field?: string;
}

export type Result<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: RulesError };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

// `field` se omite (no se asigna undefined) para que la salida sobreviva a JSON (R5).
export function err<T = never>(code: RulesErrorCode, message: string, field?: string): Result<T> {
  const error: RulesError = field === undefined ? { code, message } : { code, message, field };
  return { ok: false, error };
}
