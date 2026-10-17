import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { composeAccountService, composeApp } from "../../../src/server/compose";
import { runResetGmLock } from "../../../src/server/cli/reset-gm-lock";
import { ROOT } from "../../project/helpers";
import { makeAuthConfig } from "../../helpers/auth-fixture";
import { useTempDatabases } from "../../helpers/temp-db";

const dbs = useTempDatabases();
const CONFIG = {
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: 0,
  WEB_PORT: 5173,
  LOG_LEVEL: "silent",
} as const;
const PEPPER = "p".repeat(40);
const GM_PIN = "73920518";

function login(app: Awaited<ReturnType<typeof composeApp>>, pin: string) {
  return app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { name: "Gandalf", pin },
  });
}

describe("npm run reset-gm-lock con SQLite real", () => {
  it("review M-2: el GM bloqueado con 5 fallos puede iniciar sesión tras el CLI (Stores reales y DATABASE_PATH)", async () => {
    const dir = await dbs.dir();
    const databasePath = join(dir, "gm.sqlite");
    const settings = {
      auth: makeAuthConfig({ pepper: PEPPER }),
      database: { DATABASE_PATH: databasePath },
    };
    const svc = composeAccountService(settings);
    try {
      expect((await svc.accounts.bootstrapFirstGm("Gandalf", GM_PIN)).ok).toBe(true);
    } finally {
      svc.close();
    }

    const first = await composeApp({ ...CONFIG }, settings);
    try {
      for (let i = 0; i < 5; i += 1) expect((await login(first, "0000")).statusCode).toBe(401);
      // Bloqueado: ni siquiera el PIN correcto entra.
      expect((await login(first, GM_PIN)).statusCode).toBe(429);
    } finally {
      await first.close();
    }

    const out: string[] = [];
    const errs: string[] = [];
    const code = await runResetGmLock({
      env: {
        DATABASE_PATH: databasePath,
        AUTH_PEPPER: PEPPER,
        AUTH_ALLOWED_ORIGINS: "http://localhost:5173",
      },
      envFile: join(dir, "no-existe.env"),
      out: (line) => out.push(line),
      err: (line) => errs.push(line),
    });
    expect(code, errs.join("\n")).toBe(0);
    expect(out.join("\n")).toContain("Gandalf");

    const second = await composeApp({ ...CONFIG }, settings);
    try {
      expect((await login(second, GM_PIN)).statusCode).toBe(200);
    } finally {
      await second.close();
    }
  });

  it("review M-2: proceso real; sin GM falla con mensaje claro y con GM desbloquea", async () => {
    const dir = await dbs.dir();
    const databasePath = join(dir, "cli.sqlite");
    const env = {
      ...process.env,
      DATABASE_PATH: databasePath,
      AUTH_PEPPER: PEPPER,
      AUTH_ALLOWED_ORIGINS: "http://localhost:5173",
    };
    const run = () =>
      spawnSync(process.execPath, ["--import", "tsx", "src/server/cli/reset-gm-lock.ts"], {
        cwd: ROOT,
        env,
        encoding: "utf8",
        timeout: 60_000,
      });

    const withoutGm = run();
    expect(withoutGm.status).toBe(1);
    expect(withoutGm.stderr).toContain("No existe ninguna cuenta de GM");

    const settings = {
      auth: makeAuthConfig({ pepper: PEPPER }),
      database: { DATABASE_PATH: databasePath },
    };
    const svc = composeAccountService(settings);
    try {
      await svc.accounts.bootstrapFirstGm("Gandalf", GM_PIN);
    } finally {
      svc.close();
    }
    const withGm = run();
    expect(withGm.status, withGm.stderr).toBe(0);
    expect(withGm.stdout).toContain("Gandalf");
    expect(withGm.stdout + withGm.stderr).not.toContain(GM_PIN);
  });
});
