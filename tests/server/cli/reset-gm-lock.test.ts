import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, describe, expect, it } from "vitest";
import { runResetGmLock, type ResetGmLockIo } from "../../../src/server/cli/reset-gm-lock";
import { makeAuthFixture, type AuthFixture } from "../../helpers/auth-fixture";

let f: AuthFixture;
let out: string[];
let errs: string[];

const ENV = {
  AUTH_PEPPER: "p".repeat(40),
  AUTH_ALLOWED_ORIGINS: "http://localhost:5173",
  DATABASE_PATH: ":memory:",
};

function io(overrides: Partial<ResetGmLockIo> = {}): ResetGmLockIo {
  return {
    env: ENV,
    envFile: join(tmpdir(), "path-helper-no-existe", ".env"),
    out: (line) => out.push(line),
    err: (line) => errs.push(line),
    overrides: {
      stores: { users: f.users, sessions: f.sessions, attempts: f.attempts },
      clock: f.clock,
      hasher: f.hasher,
    },
    ...overrides,
  };
}

beforeEach(() => {
  f = makeAuthFixture();
  out = [];
  errs = [];
});

describe("reset-gm-lock (CLI sobre AccountService.unlock)", () => {
  it("review M-2: desbloquea al GM bloqueado sin cambiar su PIN y puede iniciar sesión", async () => {
    await f.accounts.bootstrapFirstGm("Gandalf", "4821");
    for (let i = 0; i < 5; i += 1) await f.auth.login("Gandalf", "0000");
    const locked = await f.auth.login("Gandalf", "4821");
    expect(locked.ok).toBe(false);

    const code = await runResetGmLock(io());

    expect(code).toBe(0);
    expect(out.join("\n")).toContain("Gandalf");
    expect(errs).toEqual([]);
    expect((await f.auth.login("Gandalf", "4821")).ok).toBe(true);
  });

  it("review M-2: no desbloquea a los jugadores (solo la cuenta de GM)", async () => {
    await f.accounts.bootstrapFirstGm("Gandalf", "4821");
    await f.accounts.createPlayer("Ana", "2222");
    for (let i = 0; i < 5; i += 1) await f.auth.login("Ana", "0000");

    expect(await runResetGmLock(io())).toBe(0);

    const ana = await f.auth.login("Ana", "2222");
    expect(ana.ok).toBe(false);
    expect(!ana.ok && ana.error.code).toBe("locked");
  });

  it("review M-2: sin cuenta de GM falla con un mensaje claro y exit 1", async () => {
    const code = await runResetGmLock(io());
    expect(code).toBe(1);
    expect(out).toEqual([]);
    expect(errs.join("\n")).toContain("No existe ninguna cuenta de GM");
    expect(errs.join("\n")).toContain("create-gm");
  });

  it("review M-2: configuración inválida -> exit 1 sin volcar el valor del pepper", async () => {
    const code = await runResetGmLock(io({ env: { ...ENV, AUTH_PEPPER: "corto-secreto" } }));
    expect(code).toBe(1);
    expect(errs.join("\n")).toContain("AUTH_PEPPER");
    expect(errs.join("\n")).not.toContain("corto-secreto");
  });
});
