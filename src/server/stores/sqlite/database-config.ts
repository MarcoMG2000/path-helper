import { z } from "zod";
import { err, ok, type Result } from "../../../shared";
import type { ConfigIssue } from "../../config";

export interface DatabaseConfig {
  /** Ruta del fichero SQLite, o `:memory:`. */
  DATABASE_PATH: string;
}

const databaseEnvSchema = z.object({
  DATABASE_PATH: z
    .string({ error: "debe ser un texto" })
    .min(1, { error: "no puede estar vacío" })
    .prefault("./data/path-helper.sqlite"),
});

export const DATABASE_ENV_KEYS = Object.keys(databaseEnvSchema.shape) as readonly string[];

export function parseDatabaseConfig(
  env: Record<string, string | undefined>,
): Result<DatabaseConfig, ConfigIssue[]> {
  const parsed = databaseEnvSchema.safeParse(env);
  if (parsed.success) return ok(parsed.data);
  return err(
    parsed.error.issues.map((issue) => ({
      variable: String(issue.path[0] ?? "(desconocida)"),
      message: issue.message,
    })),
  );
}
