import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { composeAccountService, composeApp } from "../../src/server/compose";
import { ROOT } from "../project/helpers";
import { makeAuthConfig } from "../helpers/auth-fixture";
import { useTempDatabases } from "../helpers/temp-db";

const dbs = useTempDatabases();
const CONFIG = {
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: 0,
  WEB_PORT: 5173,
  LOG_LEVEL: "silent",
} as const;

async function allBytes(dir: string): Promise<Buffer> {
  const files = await readdir(dir);
  const parts = await Promise.all(files.map((name) => readFile(join(dir, name))));
  return Buffer.concat(parts);
}

describe("composeApp con SQLite real y el hasher scrypt de producción", () => {
  it("R91/R57: login, persistencia entre reinicios y ningún PIN en claro en los ficheros de la BD", async () => {
    const dir = await dbs.dir();
    const settings = {
      auth: makeAuthConfig(),
      database: { DATABASE_PATH: join(dir, "data", "app.sqlite") },
    };
    const gmPin = "73920518";
    const playerPin = "58204716";

    // Alta con los servicios reales sobre el fichero.
    const svc = composeAccountService(settings);
    try {
      const gm = await svc.accounts.bootstrapFirstGm("Gandalf", gmPin);
      expect(gm.ok).toBe(true);
      expect((await svc.accounts.bootstrapFirstGm("Otro", "1234")).ok).toBe(false);
    } finally {
      svc.close();
    }

    const first = await composeApp({ ...CONFIG }, settings);
    let cookie: string;
    try {
      const login = await first.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { name: "gandalf", pin: gmPin },
      });
      expect(login.statusCode).toBe(200);
      cookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";
      const created = await first.inject({
        method: "POST",
        url: "/api/accounts",
        headers: { cookie },
        payload: { name: "Ana", pin: playerPin },
      });
      expect(created.statusCode).toBe(201);
      for (let i = 0; i < 5; i += 1) {
        await first.inject({
          method: "POST",
          url: "/api/auth/login",
          payload: { name: "Ana", pin: "0000" },
        });
      }
    } finally {
      await first.close();
    }

    // "Reinicio": nueva app sobre el mismo fichero conserva cuentas, sesión y bloqueo (R91).
    const second = await composeApp({ ...CONFIG }, settings);
    try {
      const me = await second.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } });
      expect(me.statusCode).toBe(200);
      expect(me.json()).toMatchObject({ name: "Gandalf", role: "gm" });
      const locked = await second.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { name: "Ana", pin: playerPin },
      });
      expect(locked.statusCode).toBe(429);
    } finally {
      await second.close();
    }

    // R57: ni la BD ni su WAL contienen los PIN en claro, y sí hashes scrypt con los parámetros.
    const bytes = await allBytes(join(dir, "data"));
    for (const pin of [gmPin, playerPin]) expect(bytes.includes(Buffer.from(pin))).toBe(false);
    expect(bytes.includes(Buffer.from("scrypt$v1$32768$8$3$"))).toBe(true);
  });

  it("el token de sesión tampoco está en claro en la BD (R28 con SQLite)", async () => {
    const dir = await dbs.dir();
    const settings = {
      auth: makeAuthConfig(),
      database: { DATABASE_PATH: join(dir, "app.sqlite") },
    };
    const svc = composeAccountService(settings);
    await svc.accounts.bootstrapFirstGm("Gandalf", "4821");
    svc.close();
    const app = await composeApp({ ...CONFIG }, settings);
    try {
      const login = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { name: "Gandalf", pin: "4821" },
      });
      const token = (String(login.headers["set-cookie"]).split(";")[0] ?? "").split("=")[1] ?? "";
      expect(token).toHaveLength(43);
      const bytes = await allBytes(dir);
      expect(bytes.includes(Buffer.from(token))).toBe(false);
    } finally {
      await app.close();
    }
  });
});

describe("npm run create-gm (proceso real)", () => {
  it("R15/R16: crea el primer GM por stdin y se niega a crear otro", async () => {
    const dir = await dbs.dir();
    const env = {
      ...process.env,
      DATABASE_PATH: join(dir, "cli.sqlite"),
      AUTH_PEPPER: "p".repeat(40),
      AUTH_ALLOWED_ORIGINS: "http://localhost:5173",
    };
    delete (env as Record<string, string | undefined>)["AUTH_BOOTSTRAP_PIN"];
    const run = (name: string, input: string) =>
      spawnSync(process.execPath, ["--import", "tsx", "src/server/cli/create-gm.ts", name], {
        cwd: ROOT,
        env,
        input,
        encoding: "utf8",
        timeout: 60_000,
      });

    const first = run("Gandalf", "73920518\n");
    expect(first.status, first.stderr).toBe(0);
    expect(first.stdout).toContain("Gandalf");
    expect(first.stdout + first.stderr).not.toContain("73920518");

    const second = run("Otro", "73920518\n");
    expect(second.status).toBe(1);
    expect(second.stderr).toContain("Ya existe una cuenta de GM");

    const svc = composeAccountService({
      auth: makeAuthConfig({ pepper: "p".repeat(40) }),
      database: { DATABASE_PATH: join(dir, "cli.sqlite") },
    });
    try {
      expect((await svc.accounts.list()).map((a) => [a.name, a.role])).toEqual([["Gandalf", "gm"]]);
    } finally {
      svc.close();
    }
  });
});
