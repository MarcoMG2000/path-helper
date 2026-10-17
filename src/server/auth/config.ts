import { z } from "zod";
import { err, ok, type Result } from "../../shared";
import type { ConfigIssue } from "../config";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export interface LockoutConfig {
  maxFailures: number;
  baseLockMs: number;
  maxLockMs: number;
  /** Tiempo sin actividad tras el cual se olvida el estado de una clave de nombre (R50). */
  idleResetMs: number;
}

export interface AuthConfig {
  pepper: string;
  cookieSecure: boolean;
  cookieName: string;
  allowedOrigins: readonly string[];
  sessionIdleTtlMs: number;
  sessionAbsoluteTtlMs: number;
  /** Intervalo mínimo entre escrituras de `lastSeenAt` (R34). */
  sessionTouchIntervalMs: number;
  lockout: LockoutConfig;
}

export const DEFAULT_LOCKOUT: LockoutConfig = {
  maxFailures: 5,
  baseLockMs: 15 * MINUTE_MS,
  maxLockMs: 24 * HOUR_MS,
  idleResetMs: 48 * HOUR_MS,
};

/** Marcador de .env.example: público en el repo, nunca válido como secreto en producción. */
export const PEPPER_PLACEHOLDER_MARK = "change-me";

export const DEFAULT_COOKIE_NAME = "ph_session";
export const SESSION_TOUCH_INTERVAL_MS = 60_000;

// Los mensajes describen la regla incumplida; nunca incluyen el valor recibido (como en f0).
function positiveInt(message: string, defaultValue: string) {
  return z
    .string({ error: message })
    .regex(/^\d{1,4}$/, { error: message })
    .transform(Number)
    .pipe(z.number().int().min(1, { error: message }))
    .prefault(defaultValue);
}

function isOrigin(value: string): boolean {
  if (!/^https?:\/\/[^\s/?#@]+$/.test(value)) return false;
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
}

const originsMessage =
  "debe ser una lista separada por comas de orígenes http(s)://host[:puerto], sin ruta";

const authEnvSchema = z.object({
  AUTH_PEPPER: z
    .string({ error: "es obligatoria y debe tener al menos 32 caracteres" })
    .min(32, { error: "es obligatoria y debe tener al menos 32 caracteres" }),
  AUTH_COOKIE_SECURE: z
    .enum(["true", "false"], { error: "debe ser true o false" })
    .transform((value) => value === "true")
    .prefault("true"),
  AUTH_ALLOWED_ORIGINS: z
    .string({ error: originsMessage })
    .transform((value) => value.split(",").map((item) => item.trim()))
    .refine((items) => items.length > 0 && items.every(isOrigin), { error: originsMessage }),
  AUTH_SESSION_IDLE_DAYS: positiveInt("debe ser un entero positivo", "7"),
  AUTH_SESSION_ABSOLUTE_DAYS: positiveInt("debe ser un entero positivo", "30"),
  AUTH_LOCK_MAX_FAILURES: positiveInt("debe ser un entero positivo", "5"),
  AUTH_LOCK_BASE_MINUTES: positiveInt("debe ser un entero positivo", "15"),
  AUTH_LOCK_MAX_HOURS: positiveInt("debe ser un entero positivo", "24"),
});

export const AUTH_ENV_KEYS = Object.keys(authEnvSchema.shape) as readonly string[];

export function parseAuthConfig(
  env: Record<string, string | undefined>,
): Result<AuthConfig, ConfigIssue[]> {
  const parsed = authEnvSchema.safeParse(env);
  if (!parsed.success) {
    return err(
      parsed.error.issues.map((issue) => ({
        variable: String(issue.path[0] ?? "(desconocida)"),
        message: issue.message,
      })),
    );
  }
  const v = parsed.data;
  // Review M-1 de f1: en producción no se acepta el pepper de ejemplo (sin distinguir mayúsculas).
  if (
    env["NODE_ENV"] === "production" &&
    v.AUTH_PEPPER.toLowerCase().includes(PEPPER_PLACEHOLDER_MARK)
  ) {
    return err([
      {
        variable: "AUTH_PEPPER",
        message:
          "en producción no puede ser el marcador de ejemplo (change-me); genera un secreto aleatorio",
      },
    ]);
  }
  return ok({
    pepper: v.AUTH_PEPPER,
    cookieSecure: v.AUTH_COOKIE_SECURE,
    cookieName: DEFAULT_COOKIE_NAME,
    allowedOrigins: v.AUTH_ALLOWED_ORIGINS,
    sessionIdleTtlMs: v.AUTH_SESSION_IDLE_DAYS * DAY_MS,
    sessionAbsoluteTtlMs: v.AUTH_SESSION_ABSOLUTE_DAYS * DAY_MS,
    sessionTouchIntervalMs: SESSION_TOUCH_INTERVAL_MS,
    lockout: {
      maxFailures: v.AUTH_LOCK_MAX_FAILURES,
      baseLockMs: v.AUTH_LOCK_BASE_MINUTES * MINUTE_MS,
      maxLockMs: v.AUTH_LOCK_MAX_HOURS * HOUR_MS,
      // Review B-1 de f1: nunca se olvida el estado de una clave mientras su bloqueo siga vigente.
      idleResetMs: Math.max(DEFAULT_LOCKOUT.idleResetMs, v.AUTH_LOCK_MAX_HOURS * HOUR_MS),
    },
  });
}
