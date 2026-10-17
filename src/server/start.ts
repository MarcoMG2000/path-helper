import type { FastifyInstance } from "fastify";
import { parseAuthConfig } from "./auth/config";
import { composeApp } from "./compose";
import { ConfigError, parseConfig, readEnv, type ConfigIssue } from "./config";
import { parseDatabaseConfig } from "./stores/sqlite/database-config";

export interface RunningServer {
  app: FastifyInstance;
  address: string;
  close(): Promise<void>;
}

export interface StartOptions {
  envFile?: string;
}

export async function start(
  env: Record<string, string | undefined> = process.env,
  opts: StartOptions = {},
): Promise<RunningServer> {
  const merged = readEnv({ env, ...(opts.envFile ? { envFile: opts.envFile } : {}) });
  const config = parseConfig(merged);
  const auth = parseAuthConfig(merged);
  const database = parseDatabaseConfig(merged);
  // Lanza ConfigError antes de crear la app: no se abre ningún puerto (ni la BD) con config inválida.
  if (!config.ok || !auth.ok || !database.ok) {
    const issues: ConfigIssue[] = [
      ...(config.ok ? [] : config.error),
      ...(auth.ok ? [] : auth.error),
      ...(database.ok ? [] : database.error),
    ];
    throw new ConfigError(issues);
  }
  const app = await composeApp(config.value, { auth: auth.value, database: database.value });
  try {
    const address = await app.listen({ host: config.value.HOST, port: config.value.PORT });
    return { app, address, close: () => app.close() };
  } catch (error) {
    await app.close();
    throw error;
  }
}
