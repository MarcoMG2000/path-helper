import { z } from "zod";

export const ROLES = ["player", "gm"] as const;
export type Role = (typeof ROLES)[number];

// R3, R93: categorías Unicode Cc (control: C0, DEL, C1) y Cf (formato: RLO/LRO, caracteres de
// ancho cero, BOM...). Invisibles o capaces de falsear el orden visual de un nombre.
const FORBIDDEN_NAME_CHARS = /[\p{Cc}\p{Cf}]/u;

// R3, R93, R94: se recorta y se normaliza a NFC (antes de medir la longitud y de comparar la
// unicidad), 1-32 caracteres, sin caracteres de control ni de formato.
export const nameSchema = z
  .string()
  .trim()
  .transform((value) => value.normalize("NFC"))
  .pipe(
    z
      .string()
      .min(1)
      .max(32)
      .refine((value) => !FORBIDDEN_NAME_CHARS.test(value)),
  );

// R3: SIEMPRE una cadena (los ceros a la izquierda son significativos).
export const pinSchema = z.string().regex(/^\d{4,8}$/);

// R24: el login solo acota la forma; el formato del PIN no se revela al atacante.
export const loginBodySchema = z.object({
  name: z.string().min(1).max(64),
  pin: z.string().min(1).max(64),
});

export const createAccountBodySchema = z.object({ name: nameSchema, pin: pinSchema });
export const resetPinBodySchema = z.object({ pin: pinSchema });
export const changePinBodySchema = z.object({
  currentPin: z.string().min(1).max(64),
  newPin: pinSchema,
});
export const patchAccountBodySchema = z.object({ disabled: z.boolean() });

export interface UserDto {
  id: string;
  name: string;
  role: Role;
}

export interface AccountDto extends UserDto {
  disabled: boolean;
  /** ISO-8601 */
  createdAt: string;
}

export type ErrorCode =
  | "validation_error"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "invalid_credentials"
  | "locked"
  | "name_taken"
  | "cannot_disable_gm"
  | "invalid_current_pin"
  | "bad_origin"
  | "gm_exists"
  | "internal_error";

export interface ErrorBody {
  error: { code: ErrorCode; message: string };
}

/** Clave de nombre: NFC, sin espacios exteriores, minúsculas. */
export function normalizeName(name: string): string {
  return name.normalize("NFC").trim().toLowerCase();
}
