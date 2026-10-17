import { afterEach, describe, expect, it } from "vitest";
import { hashSessionToken } from "../../../src/server/auth/session-token";
import { makeTestApp, seedAccounts, type TestApp } from "../../helpers/test-app";

let t: TestApp | undefined;

afterEach(async () => {
  await t?.app.close();
  t = undefined;
});

async function setup(): Promise<TestApp & { playerId: string }> {
  const made = await makeTestApp();
  t = made;
  const { playerIds } = await seedAccounts(made.fx, [{ name: "Ana", pin: "2222" }]);
  return { ...made, playerId: playerIds[0] ?? "" };
}

const UNAUTH = { error: { code: "unauthenticated", message: expect.any(String) } };

describe("hook global de autenticación (deny-by-default)", () => {
  it("R78: una ruta nueva bajo /api sin guarda propia responde 401 sin sesión", async () => {
    const { app, req } = await setup();
    let handlerRan = false;
    app.get("/api/ruta-olvidada", async () => {
      handlerRan = true;
      return { secreto: true };
    });
    const response = await req({ method: "GET", url: "/api/ruta-olvidada" });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual(UNAUTH);
    expect(handlerRan).toBe(false);
  });

  it("R78: también protege rutas mutantes y con parámetros", async () => {
    const { app, req } = await setup();
    let ran = 0;
    app.post("/api/cosas/:id", async () => {
      ran += 1;
      return {};
    });
    app.delete("/api/cosas/:id", async () => {
      ran += 1;
      return {};
    });
    expect((await req({ method: "POST", url: "/api/cosas/1", body: {} })).statusCode).toBe(401);
    expect((await req({ method: "DELETE", url: "/api/cosas/1" })).statusCode).toBe(401);
    expect(ran).toBe(0);
  });

  it("R78: con sesión válida la ruta sin guarda propia sí se ejecuta y ve al actor", async () => {
    const { app, req, loginCookie, playerId } = await setup();
    app.get("/api/ruta-olvidada", async (request) => ({ actor: request.actor }));
    const cookie = await loginCookie("Ana", "2222");
    const response = await req({ method: "GET", url: "/api/ruta-olvidada", cookie });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ actor: { userId: playerId, role: "player" } });
  });

  it("R78: las rutas públicas son solo login, logout y /health", async () => {
    const { req } = await setup();
    expect((await req({ method: "GET", url: "/health" })).statusCode).toBe(200);
    expect((await req({ method: "POST", url: "/api/auth/logout" })).statusCode).toBe(204);
    expect(
      (await req({ method: "POST", url: "/api/auth/login", body: { name: "x", pin: "y" } }))
        .statusCode,
    ).toBe(401);
    for (const [method, url] of [
      ["GET", "/api/auth/me"],
      ["PUT", "/api/auth/pin"],
      ["GET", "/api/accounts"],
      ["POST", "/api/accounts"],
    ] as const) {
      expect((await req({ method, url, body: {} })).statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it("R78: una ruta inexistente bajo /api sin sesión da 401 (no revela qué rutas existen)", async () => {
    const { req } = await setup();
    const response = await req({ method: "GET", url: "/api/no-existe" });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual(UNAUTH);
  });

  it("R78: variantes de la ruta (mayúsculas, codificación, barras dobles, query) no esquivan la guarda", async () => {
    const { app, req } = await setup();
    let ran = false;
    app.get("/api/privada", async () => {
      ran = true;
      return { dato: 1 };
    });
    for (const url of [
      "/api/privada?x=1",
      "/API/privada",
      "/%61pi/privada",
      "//api/privada",
      "/api//privada",
      "/api/privada/",
      "/api/%70rivada",
      "/api/../api/privada",
    ]) {
      const response = await req({ method: "GET", url });
      expect(response.statusCode, url).not.toBe(200);
      expect(response.body, url).not.toContain("dato");
    }
    expect(ran).toBe(false);
  });

  it("extraPublicRoutes permite abrir explícitamente una ruta concreta desde compose", async () => {
    const made = await makeTestApp({ overrides: { extraPublicRoutes: ["GET /api/publica"] } });
    t = made;
    made.app.get("/api/publica", async () => ({ ok: 1 }));
    made.app.get("/api/otra", async () => ({ ok: 2 }));
    expect((await made.req({ method: "GET", url: "/api/publica" })).statusCode).toBe(200);
    expect((await made.req({ method: "GET", url: "/api/otra" })).statusCode).toBe(401);
  });
});

describe("resolución del actor desde la cookie", () => {
  it("R30: sin cookie o con token desconocido o manipulado -> 401 unauthenticated", async () => {
    const { req, loginCookie } = await setup();
    const good = await loginCookie("Ana", "2222");
    const value = good.split("=")[1] ?? "";
    for (const cookie of [
      undefined,
      "ph_session=",
      "ph_session=token-inventado",
      `ph_session=${value}x`,
      `ph_session=${hashSessionToken(value)}`,
      `otra=${value}`,
    ]) {
      const response = await req({ method: "GET", url: "/api/auth/me", cookie });
      expect(response.statusCode, String(cookie)).toBe(401);
      expect(response.json()).toEqual(UNAUTH);
    }
  });

  it("R29: el rol se lee de la cuenta almacenada, no de la cookie", async () => {
    const { app, req, loginCookie, fx, playerId } = await setup();
    app.get("/api/quien", async (request) => request.actor);
    const cookie = await loginCookie("Ana", "2222");
    expect((await req({ method: "GET", url: "/api/quien", cookie })).json()).toEqual({
      userId: playerId,
      role: "player",
    });
    // Cambiar el rol en el store surta efecto en la siguiente petición con la MISMA cookie.
    fx.users.testOnlySetRole(playerId, "gm");
    expect((await req({ method: "GET", url: "/api/quien", cookie })).json()).toEqual({
      userId: playerId,
      role: "gm",
    });
  });

  it("R29: la cookie no contiene ni el rol ni el id de usuario", async () => {
    const { loginCookie, playerId } = await setup();
    const cookie = await loginCookie("Ana", "2222");
    expect(cookie).not.toContain(playerId);
    expect(cookie).not.toContain("player");
  });

  it("R29/R33: tras deshabilitar la cuenta, la misma cookie deja de valer de inmediato", async () => {
    const { req, loginCookie, fx, playerId } = await setup();
    const cookie = await loginCookie("Ana", "2222");
    expect((await req({ method: "GET", url: "/api/auth/me", cookie })).statusCode).toBe(200);
    await fx.accounts.setDisabled(playerId, true);
    expect((await req({ method: "GET", url: "/api/auth/me", cookie })).statusCode).toBe(401);
  });

  it("R31/R32: una cookie con la sesión caducada responde 401", async () => {
    const { req, loginCookie, fx } = await setup();
    const cookie = await loginCookie("Ana", "2222");
    fx.clock.advance(8 * 86_400_000);
    expect((await req({ method: "GET", url: "/api/auth/me", cookie })).statusCode).toBe(401);
  });

  it("las respuestas autenticadas llevan Cache-Control: no-store", async () => {
    const { req, loginCookie } = await setup();
    const cookie = await loginCookie("Ana", "2222");
    const response = await req({ method: "GET", url: "/api/auth/me", cookie });
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  // Review B-3 de f1: también las respuestas de las rutas públicas de login y logout.
  it("review B-3: login (200, 401, 429) y logout (204) llevan Cache-Control: no-store", async () => {
    const { req } = await setup();
    const login = (pin: string) =>
      req({ method: "POST", url: "/api/auth/login", body: { name: "Ana", pin } });
    const ok = await login("2222");
    expect(ok.statusCode).toBe(200);
    expect(ok.headers["cache-control"]).toBe("no-store");
    const logout = await req({ method: "POST", url: "/api/auth/logout" });
    expect(logout.statusCode).toBe(204);
    expect(logout.headers["cache-control"]).toBe("no-store");
    const bad = await login("0000");
    expect(bad.statusCode).toBe(401);
    expect(bad.headers["cache-control"]).toBe("no-store");
    for (let i = 0; i < 5; i += 1) await login("0000");
    const locked = await login("2222");
    expect(locked.statusCode).toBe(429);
    expect(locked.headers["cache-control"]).toBe("no-store");
  });
});

describe("requireRole", () => {
  it("R14: un jugador recibe 403 forbidden y el handler no se ejecuta", async () => {
    const { app, req, loginCookie } = await setup();
    const { requireRole } = await import("../../../src/server/http/auth-plugin");
    let ran = false;
    app.get("/api/solo-gm", { preHandler: requireRole("gm") }, async () => {
      ran = true;
      return {};
    });
    const cookie = await loginCookie("Ana", "2222");
    const response = await req({ method: "GET", url: "/api/solo-gm", cookie });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("forbidden");
    expect(ran).toBe(false);
    const gmCookie = await loginCookie("Gandalf", "1111");
    expect((await req({ method: "GET", url: "/api/solo-gm", cookie: gmCookie })).statusCode).toBe(
      200,
    );
  });
});
