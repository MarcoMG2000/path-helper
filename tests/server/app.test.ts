import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/server/app";
import { composeApp } from "../../src/server/compose";
import {
  InMemoryLoginAttemptStore,
  InMemorySessionStore,
  InMemoryUserStore,
} from "../../src/server/stores/in-memory";
import { makeAuthConfig } from "../helpers/auth-fixture";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("buildApp", () => {
  it("R30: GET /health responde 200 con {status: ok}", async () => {
    app = buildApp({ LOG_LEVEL: "silent" });
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("R32: una ruta no registrada responde 404 con cuerpo JSON", async () => {
    app = buildApp({ LOG_LEVEL: "silent" });
    const response = await app.inject({ method: "GET", url: "/no-existe" });
    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(() => response.json()).not.toThrow();
  });

  it("R31: el logger usa el nivel LOG_LEVEL", () => {
    app = buildApp({ LOG_LEVEL: "warn" });
    expect(app.log.level).toBe("warn");
  });
});

describe("composeApp", () => {
  it("R31: configura el logger con config.LOG_LEVEL y expone /health", async () => {
    app = await composeApp(
      { NODE_ENV: "test", HOST: "127.0.0.1", PORT: 0, WEB_PORT: 5173, LOG_LEVEL: "error" },
      { auth: makeAuthConfig(), database: { DATABASE_PATH: ":memory:" } },
      {
        stores: {
          users: new InMemoryUserStore(),
          sessions: new InMemorySessionStore(),
          attempts: new InMemoryLoginAttemptStore(),
        },
      },
    );
    expect(app.log.level).toBe("error");
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
  });
});
