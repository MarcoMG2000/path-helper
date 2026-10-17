import { pathToFileURL } from "node:url";
import { composeAccountService, type ComposeOverrides } from "../compose";
import { loadCliSettings } from "./cli-settings";

export interface ResetGmLockIo {
  env: Record<string, string | undefined>;
  envFile?: string;
  out: (line: string) => void;
  err: (line: string) => void;
  overrides?: Pick<ComposeOverrides, "stores" | "clock" | "hasher">;
}

/**
 * Recuperación del GM bloqueado por intentos fallidos (review M-2 de f1): borra su estado de
 * bloqueo con `AccountService.unlock`, sin tocar el PIN ni las sesiones. Devuelve el exit code.
 */
export async function runResetGmLock(io: ResetGmLockIo): Promise<number> {
  const loaded = loadCliSettings(io);
  if (!loaded.ok) {
    io.err(loaded.error);
    return 1;
  }
  const { accounts, close } = composeAccountService(loaded.value.settings, io.overrides);
  try {
    const gm = (await accounts.list()).find((account) => account.role === "gm");
    if (!gm) {
      io.err("No existe ninguna cuenta de GM; créala con: npm run create-gm -- <nombre>");
      return 1;
    }
    const result = await accounts.unlock(gm.id);
    if (!result.ok) {
      io.err("No se pudo desbloquear la cuenta de GM.");
      return 1;
    }
    io.out(`Cuenta de GM desbloqueada: ${gm.name}`);
    return 0;
  } finally {
    close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runResetGmLock({
    env: process.env,
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
  });
}
