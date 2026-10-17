import { afterEach, describe, expect, it } from "vitest";
import { makeTestApp, seedAccounts, type TestApp } from "../../helpers/test-app";

let t: TestApp | undefined;

afterEach(async () => {
  await t?.app.close();
  t = undefined;
});

async function setup(): Promise<{ t: TestApp; hits: () => number }> {
  const made = await makeTestApp({
    config: { allowedOrigins: ["http://localhost:5173", "https://app.example.com"] },
    overrides: { extraPublicRoutes: ["POST /api/eco", "PUT /api/eco", "GET /api/eco"] },
  });
  t = made;
  await seedAccounts(made.fx, [{ name: "Ana", pin: "2222" }]);
  let count = 0;
  for (const method of ["post", "put", "patch", "delete", "get"] as const) {
    made.app[method]("/api/eco", async () => {
      count += 1;
      return { ok: true };
    });
  }
  return { t: made, hits: () => count };
}

describe("origin-guard", () => {
  it("R62: un método mutante con Origin no permitido recibe 403 bad_origin y no ejecuta el manejador", async () => {
    const { t: made, hits } = await setup();
    for (const method of ["POST", "PUT", "PATCH", "DELETE"] as const) {
      const response = await made.req({
        method,
        url: "/api/eco",
        headers: { origin: "https://evil.example.com" },
        body: method === "DELETE" ? undefined : {},
      });
      expect(response.statusCode, method).toBe(403);
      expect(response.json().error.code).toBe("bad_origin");
    }
    expect(hits()).toBe(0);
  });

  it("R62: Origin con otro esquema, puerto o subdominio, o 'null', se rechaza", async () => {
    const { t: made, hits } = await setup();
    for (const origin of [
      "http://localhost:5174",
      "https://localhost:5173",
      "http://localhost:5173.evil.com",
      "http://evil.localhost:5173",
      "null",
      "",
      "http://localhost:5173/",
    ]) {
      const response = await made.req({
        method: "POST",
        url: "/api/eco",
        headers: { origin },
        body: {},
      });
      expect(response.statusCode, JSON.stringify(origin)).toBe(403);
    }
    expect(hits()).toBe(0);
  });

  it("R62: el login desde un Origin no permitido también se bloquea (no se evalúan credenciales)", async () => {
    const { t: made } = await setup();
    const response = await made.req({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: "https://evil.example.com" },
      body: { name: "Ana", pin: "2222" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(made.fx.sessions.dump()).toHaveLength(0);
  });

  it("R62: Origin permitido (cualquiera de la lista) deja pasar", async () => {
    const { t: made, hits } = await setup();
    for (const origin of ["http://localhost:5173", "https://app.example.com"]) {
      const response = await made.req({
        method: "POST",
        url: "/api/eco",
        headers: { origin },
        body: {},
      });
      expect(response.statusCode, origin).toBe(200);
    }
    expect(hits()).toBe(2);
  });

  it("R62: sin cabecera Origin (curl, tests) se permite", async () => {
    const { t: made } = await setup();
    expect((await made.req({ method: "POST", url: "/api/eco", body: {} })).statusCode).toBe(200);
  });

  it("R62: GET y OPTIONS no se restringen por Origin", async () => {
    const { t: made } = await setup();
    const get = await made.req({
      method: "GET",
      url: "/api/eco",
      headers: { origin: "https://evil.example.com" },
    });
    expect(get.statusCode).toBe(200);
    const options = await made.app.inject({
      method: "OPTIONS",
      url: "/api/eco",
      headers: { origin: "https://evil.example.com" },
    });
    expect(options.statusCode).not.toBe(403);
  });
});
