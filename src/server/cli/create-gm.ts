import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { composeAccountService, type ComposeOverrides } from "../compose";
import { loadCliSettings } from "./cli-settings";

export interface CreateGmIo {
  argv: readonly string[];
  env: Record<string, string | undefined>;
  envFile?: string;
  readPin: () => Promise<string>;
  out: (line: string) => void;
  err: (line: string) => void;
  overrides?: Pick<ComposeOverrides, "stores" | "clock" | "hasher">;
}

const MESSAGES = {
  validation_error: "Nombre (1-32 caracteres) o PIN (4-8 dígitos) no válidos.",
  gm_exists: "Ya existe una cuenta de GM; no se crea otra.",
  name_taken: "Ya existe una cuenta con ese nombre.",
} as const;

/** Envoltorio sin lógica de negocio sobre `AccountService.bootstrapFirstGm`. Devuelve el exit code. */
export async function runCreateGm(io: CreateGmIo): Promise<number> {
  const name = io.argv[0];
  if (!name) {
    io.err('Uso: npm run create-gm -- "<nombre>"   (PIN por AUTH_BOOTSTRAP_PIN o por stdin)');
    return 2;
  }
  const loaded = loadCliSettings(io);
  if (!loaded.ok) {
    io.err(loaded.error);
    return 1;
  }
  const { env, settings } = loaded.value;
  const pin = (env["AUTH_BOOTSTRAP_PIN"] ?? (await io.readPin())).trim();
  const { accounts, close } = composeAccountService(settings, io.overrides);
  try {
    const result = await accounts.bootstrapFirstGm(name, pin);
    if (!result.ok) {
      io.err(MESSAGES[result.error.code as keyof typeof MESSAGES] ?? "No se pudo crear la cuenta.");
      return 1;
    }
    io.out(`Cuenta de GM creada: ${result.value.name}`);
    return 0;
  } finally {
    close();
  }
}

async function readPinFromStdin(): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    // Con TTY muestra el prompt; con una tubería lee la primera línea.
    return await rl.question("PIN del GM (4-8 dígitos): ");
  } finally {
    rl.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runCreateGm({
    argv: process.argv.slice(2),
    env: process.env,
    readPin: readPinFromStdin,
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
  });
}
