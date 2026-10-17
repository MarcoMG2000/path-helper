import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { start } from "../../src/server/start";

describe("start (integración)", () => {
  it("R34: escucha en HOST:PORT y responde GET /health a través de la red", async () => {
    const envFile = join(tmpdir(), "path-helper-no-existe", ".env");
    const dir = await mkdtemp(join(tmpdir(), "path-helper-start-"));
    const env = {
      HOST: "127.0.0.1",
      PORT: "0",
      LOG_LEVEL: "silent",
      DATABASE_PATH: join(dir, "data", "app.sqlite"),
      AUTH_PEPPER: "p".repeat(40),
      AUTH_ALLOWED_ORIGINS: "http://localhost:5173",
    };
    const server = await start(env, { envFile });
    try {
      expect(server.address).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      const response = await fetch(`${server.address}/health`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "ok" });
    } finally {
      await server.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
