import { z } from "zod";
import { ROLES, type AccountDto, type ErrorCode, type UserDto } from "../../shared";

// Schemas de las respuestas de la API. Viven en src/web (no en src/shared) para no modificar una
// feature cerrada; `satisfies` los ancla a los tipos de shared: si cambian, tsc falla.
export const userDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(ROLES),
}) satisfies z.ZodType<UserDto>;

export const accountDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(ROLES),
  disabled: z.boolean(),
  createdAt: z.string(),
}) satisfies z.ZodType<AccountDto>;

// `Record<ErrorCode, true>` obliga (en compilación) a listar todos los códigos de shared.
const ERROR_CODE_FLAGS: Record<ErrorCode, true> = {
  validation_error: true,
  unauthenticated: true,
  forbidden: true,
  not_found: true,
  invalid_credentials: true,
  locked: true,
  name_taken: true,
  cannot_disable_gm: true,
  invalid_current_pin: true,
  bad_origin: true,
  gm_exists: true,
  internal_error: true,
};

export const ERROR_CODES = Object.keys(ERROR_CODE_FLAGS) as ErrorCode[];

export const errorBodySchema = z.object({
  error: z.object({
    code: z.string().refine((code): code is ErrorCode => Object.hasOwn(ERROR_CODE_FLAGS, code)),
    message: z.string(),
  }),
});
