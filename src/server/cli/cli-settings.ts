import { parseAuthConfig } from "../auth/config";
import type { ComposeSettings } from "../compose";
import { readEnv } from "../config";
import { parseDatabaseConfig } from "../stores/sqlite/database-config";
import { err, ok, type Result } from "../../shared";

export interface CliEnv {
  env: Record<string, string | undefined>;
  envFile?: string;
}

/** Entorno mezclado con `.env` y configuración de auth + BD de los CLI de operación. */
export function loadCliSettings(
  io: CliEnv,
): Result<{ env: Record<string, string | undefined>; settings: ComposeSettings }, string> {
  const env = readEnv({ env: io.env, ...(io.envFile ? { envFile: io.envFile } : {}) });
  const auth = parseAuthConfig(env);
  const database = parseDatabaseConfig(env);
  if (!auth.ok || !database.ok) {
    const issues = [...(auth.ok ? [] : auth.error), ...(database.ok ? [] : database.error)];
    return err(
      `Configuración inválida: ${issues.map((i) => `${i.variable} (${i.message})`).join(", ")}`,
    );
  }
  return ok({ env, settings: { auth: auth.value, database: database.value } });
}
