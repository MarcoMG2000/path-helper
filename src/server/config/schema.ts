import { z } from "zod";

// Los mensajes son propios (no los de zod) para no filtrar nunca el valor recibido.
function portSchema(min: number, defaultValue: string) {
  const message = `debe ser un entero entre ${min} y 65535`;
  return z
    .string({ error: message })
    .regex(/^\d{1,5}$/, { error: message })
    .transform(Number)
    .pipe(z.number().int().min(min, { error: message }).max(65535, { error: message }))
    .prefault(defaultValue);
}

export const configSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"], {
      error: "debe ser development, test o production",
    })
    .prefault("development"),
  HOST: z
    .string({ error: "debe ser un texto" })
    .min(1, { error: "no puede estar vacío" })
    .prefault("127.0.0.1"),
  PORT: portSchema(0, "3000"),
  WEB_PORT: portSchema(1, "5173"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"], {
      error: "debe ser fatal, error, warn, info, debug, trace o silent",
    })
    .prefault("info"),
});

export type Config = z.infer<typeof configSchema>;

export const ENV_KEYS = Object.keys(configSchema.shape) as readonly (keyof Config)[];
