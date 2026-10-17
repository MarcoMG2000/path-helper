import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { err, ok, type Result } from "../../shared";
import { configSchema, type Config } from "./schema";

type Env = Record<string, string | undefined>;

// `message` describe la regla incumplida; nunca incluye el valor recibido.
export interface ConfigIssue {
  variable: string;
  message: string;
}

export function parseConfig(env: Env): Result<Config, ConfigIssue[]> {
  const parsed = configSchema.safeParse(env);
  if (parsed.success) return ok(parsed.data);
  const issues = parsed.error.issues.map((issue) => ({
    variable: String(issue.path[0] ?? "(desconocida)"),
    message: issue.message,
  }));
  return err(issues);
}

export class ConfigError extends Error {
  readonly issues: readonly ConfigIssue[];

  constructor(issues: readonly ConfigIssue[]) {
    const detail = issues.map((issue) => `${issue.variable} (${issue.message})`).join(", ");
    super(`Configuración inválida: ${detail}`);
    this.name = "ConfigError";
    this.issues = issues;
  }
}

export interface LoadConfigOptions {
  env?: Env;
  envFile?: string;
}

// Mezcla el .env con el entorno del proceso (el entorno gana). Compartido por todas las
// configuraciones (principal, auth, base de datos) para leer el fichero una sola vez.
export function readEnv(opts: LoadConfigOptions = {}): Env {
  const env = opts.env ?? process.env;
  const envFile = opts.envFile ?? resolve(process.cwd(), ".env");
  // Un .env ilegible lanza (error de infraestructura): solo "no existe" es un caso normal.
  const fileVars = existsSync(envFile) ? parseEnv(readFileSync(envFile, "utf8")) : {};
  const definedEnv = Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  // El entorno del proceso gana sobre el .env; no se muta process.env.
  return { ...fileVars, ...definedEnv };
}

export function loadConfig(opts: LoadConfigOptions = {}): Config {
  const result = parseConfig(readEnv(opts));
  if (!result.ok) throw new ConfigError(result.error);
  return result.value;
}
