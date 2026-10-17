import { Writable } from "node:stream";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { composeApp, type ComposeOverrides } from "../../src/server/compose";
import type { AuthConfig } from "../../src/server/auth/config";
import { makeAuthFixture, type AuthFixture } from "./auth-fixture";

export interface TestApp {
  app: FastifyInstance;
  fx: AuthFixture;
  /** Líneas de log escritas por Fastify (JSON), para comprobar que no se filtran PIN. */
  logs: string[];
  /** Cabecera `cookie` lista para usar tras un login correcto. */
  loginCookie(name: string, pin: string): Promise<string>;
  req(opts: {
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    url: string;
    cookie?: string;
    body?: unknown;
    headers?: Record<string, string>;
  }): Promise<LightMyRequestResponse>;
}

export async function makeTestApp(
  opts: {
    config?: Partial<AuthConfig>;
    overrides?: ComposeOverrides;
  } = {},
): Promise<TestApp> {
  const fx = makeAuthFixture({ config: opts.config });
  const logs: string[] = [];
  const logStream = new Writable({
    write(chunk: Buffer, _enc, callback) {
      logs.push(chunk.toString("utf8"));
      callback();
    },
  });
  const app = await composeApp(
    { NODE_ENV: "test", HOST: "127.0.0.1", PORT: 0, WEB_PORT: 5173, LOG_LEVEL: "info" },
    { auth: fx.config, database: { DATABASE_PATH: ":memory:" } },
    {
      stores: { users: fx.users, sessions: fx.sessions, attempts: fx.attempts },
      clock: fx.clock,
      hasher: fx.hasher,
      logStream,
      ...opts.overrides,
    },
  );

  const req: TestApp["req"] = ({ method, url, cookie, body, headers }) =>
    app.inject({
      method,
      url,
      headers: { ...(cookie ? { cookie } : {}), ...headers },
      ...(body !== undefined ? { payload: body as object } : {}),
    });

  const loginCookie: TestApp["loginCookie"] = async (name, pin) => {
    const response = await req({ method: "POST", url: "/api/auth/login", body: { name, pin } });
    if (response.statusCode !== 200) throw new Error(`login ${name} -> ${response.statusCode}`);
    const setCookie = response.headers["set-cookie"];
    const first = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    const pair = first?.split(";")[0];
    if (!pair) throw new Error("login sin cookie");
    return pair;
  };

  return { app, fx, logs, loginCookie, req };
}

/** Crea un GM y jugadores directamente con los servicios del fixture. */
export async function seedAccounts(
  fx: AuthFixture,
  players: { name: string; pin: string }[],
  gm = { name: "Gandalf", pin: "1111" },
): Promise<{ gmId: string; playerIds: string[] }> {
  const g = await fx.accounts.bootstrapFirstGm(gm.name, gm.pin);
  if (!g.ok) throw new Error("bootstrap gm");
  const playerIds: string[] = [];
  for (const p of players) {
    const created = await fx.accounts.createPlayer(p.name, p.pin);
    if (!created.ok) throw new Error(`alta ${p.name}`);
    playerIds.push(created.value.id);
  }
  return { gmId: g.value.id, playerIds };
}
