import { afterEach, describe, expect, it } from "vitest";
import { makeTestApp, seedAccounts, type TestApp } from "../../../helpers/test-app";

let t: TestApp | undefined;

afterEach(async () => {
  await t?.app.close();
  t = undefined;
});

const MIN = 60_000;

async function setup(
  config: Parameters<typeof makeTestApp>[0] = {},
): Promise<TestApp & { gmId: string; anaId: string }> {
  const made = await makeTestApp(config);
  t = made;
  const { gmId, playerIds } = await seedAccounts(made.fx, [
    { name: "Ana", pin: "2222" },
    { name: "Beto", pin: "3333" },
  ]);
  return { ...made, gmId, anaId: playerIds[0] ?? "" };
}

function setCookieHeader(response: { headers: Record<string, unknown> }): string {
  const value = response.headers["set-cookie"];
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first !== "string") throw new Error("sin Set-Cookie");
  return first;
}

describe("POST /api/auth/login", () => {
  it("R18/R19: credenciales correctas -> 200 con {id,name,role}, sesión creada y cookie", async () => {
    const { req, anaId, fx } = await setup();
    const response = await req({
      method: "POST",
      url: "/api/auth/login",
      body: { name: "Ana", pin: "2222" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: anaId, name: "Ana", role: "player" });
    expect(setCookieHeader(response)).toMatch(/^ph_session=[A-Za-z0-9_-]{43};/);
    expect(fx.sessions.dump()).toHaveLength(1);
  });

  it("R18: el GM entra y se identifica con rol gm", async () => {
    const { req, gmId } = await setup();
    const response = await req({
      method: "POST",
      url: "/api/auth/login",
      body: { name: "gandalf", pin: "1111" },
    });
    expect(response.json()).toEqual({ id: gmId, name: "Gandalf", role: "gm" });
  });

  it("R25: la cookie es HttpOnly, SameSite=Strict, Path=/ y Max-Age = vida absoluta en segundos", async () => {
    const { req } = await setup();
    const response = await req({
      method: "POST",
      url: "/api/auth/login",
      body: { name: "Ana", pin: "2222" },
    });
    const cookie = setCookieHeader(response);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain(`Max-Age=${30 * 86_400}`);
    expect(cookie).not.toContain("Secure");
  });

  it("R26: con AUTH_COOKIE_SECURE=true la cookie lleva Secure", async () => {
    const { req } = await setup({ config: { cookieSecure: true } });
    const response = await req({
      method: "POST",
      url: "/api/auth/login",
      body: { name: "Ana", pin: "2222" },
    });
    expect(setCookieHeader(response)).toMatch(/;\s*Secure/);
  });

  it("R25: el Max-Age sigue la configuración de vida absoluta", async () => {
    const { req } = await setup({ config: { sessionAbsoluteTtlMs: 2 * 86_400_000 } });
    const response = await req({
      method: "POST",
      url: "/api/auth/login",
      body: { name: "Ana", pin: "2222" },
    });
    expect(setCookieHeader(response)).toContain(`Max-Age=${2 * 86_400}`);
  });

  it("R21-R23: nombre desconocido, PIN incorrecto y cuenta deshabilitada: mismo estado y mismo cuerpo", async () => {
    const { req, fx, anaId } = await setup();
    const unknown = await req({
      method: "POST",
      url: "/api/auth/login",
      body: { name: "Nadie", pin: "2222" },
    });
    const wrongPin = await req({
      method: "POST",
      url: "/api/auth/login",
      body: { name: "Ana", pin: "9999" },
    });
    await fx.accounts.setDisabled(anaId, true);
    const disabled = await req({
      method: "POST",
      url: "/api/auth/login",
      body: { name: "Ana", pin: "2222" },
    });
    expect(unknown.statusCode).toBe(401);
    expect(unknown.json().error.code).toBe("invalid_credentials");
    for (const other of [wrongPin, disabled]) {
      expect(other.statusCode).toBe(401);
      expect(other.body).toBe(unknown.body);
      expect(other.headers["set-cookie"]).toBeUndefined();
    }
    expect(fx.sessions.dump()).toHaveLength(0);
  });

  it("R24: cuerpos que no son {name 1-64, pin 1-64} -> 400 validation_error sin evaluar credenciales", async () => {
    const { app, req, fx } = await setup();
    const callsBefore = fx.hasher.verifyCalls.length;
    const bad: unknown[] = [
      {},
      { name: "Ana" },
      { pin: "2222" },
      { name: "", pin: "2222" },
      { name: "Ana", pin: "" },
      { name: "n".repeat(65), pin: "2222" },
      { name: "Ana", pin: "9".repeat(65) },
      { name: "Ana", pin: 2222 },
      { name: ["Ana"], pin: "2222" },
      [],
      null,
    ];
    for (const body of bad) {
      const response = await req({ method: "POST", url: "/api/auth/login", body });
      expect(response.statusCode, JSON.stringify(body)).toBe(400);
      expect(response.json().error.code).toBe("validation_error");
    }
    // Un JSON que es una cadena (no un objeto) también es 400.
    const asString = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify("texto"),
    });
    expect(asString.statusCode).toBe(400);
    expect(asString.json().error.code).toBe("validation_error");
    expect(fx.hasher.verifyCalls.length).toBe(callsBefore);
    expect(fx.attempts.size()).toBe(0);
  });

  it("R24: JSON mal formado o sin cuerpo -> 400 validation_error", async () => {
    const { app, req } = await setup();
    const malformed = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "application/json" },
      payload: '{"name":"Ana","pin":"2222"',
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json().error.code).toBe("validation_error");
    const empty = await req({ method: "POST", url: "/api/auth/login" });
    expect(empty.statusCode).toBe(400);
  });

  it("R43: bloqueada -> 429 locked con Retry-After, aunque el PIN sea correcto, sin verificar el PIN", async () => {
    const { req, fx } = await setup();
    for (let i = 0; i < 5; i += 1) {
      const r = await req({
        method: "POST",
        url: "/api/auth/login",
        body: { name: "Ana", pin: "0000" },
      });
      expect(r.statusCode).toBe(401);
    }
    const calls = fx.hasher.verifyCalls.length;
    const response = await req({
      method: "POST",
      url: "/api/auth/login",
      body: { name: "Ana", pin: "2222" },
    });
    expect(response.statusCode).toBe(429);
    expect(response.json().error.code).toBe("locked");
    expect(response.headers["retry-after"]).toBe("900");
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(fx.hasher.verifyCalls.length).toBe(calls);

    fx.clock.advance(5 * MIN);
    const later = await req({
      method: "POST",
      url: "/api/auth/login",
      body: { name: "ana", pin: "2222" },
    });
    expect(later.headers["retry-after"]).toBe("600");

    fx.clock.advance(10 * MIN);
    const free = await req({
      method: "POST",
      url: "/api/auth/login",
      body: { name: "Ana", pin: "2222" },
    });
    expect(free.statusCode).toBe(200);
  });

  it("R43: el bloqueo de un nombre no afecta a otros", async () => {
    const { req } = await setup();
    for (let i = 0; i < 6; i += 1) {
      await req({ method: "POST", url: "/api/auth/login", body: { name: "Ana", pin: "0000" } });
    }
    const beto = await req({
      method: "POST",
      url: "/api/auth/login",
      body: { name: "Beto", pin: "3333" },
    });
    expect(beto.statusCode).toBe(200);
  });
});

describe("logout y me", () => {
  it("R35: logout con sesión borra la sesión y responde 204 con la cookie expirada (Max-Age=0)", async () => {
    const { req, loginCookie, fx } = await setup();
    const cookie = await loginCookie("Ana", "2222");
    const response = await req({ method: "POST", url: "/api/auth/logout", cookie });
    expect(response.statusCode).toBe(204);
    expect(setCookieHeader(response)).toContain("Max-Age=0");
    expect(setCookieHeader(response)).toMatch(/^ph_session=;/);
    expect(fx.sessions.dump()).toHaveLength(0);
    expect((await req({ method: "GET", url: "/api/auth/me", cookie })).statusCode).toBe(401);
  });

  it("R36: logout sin sesión válida responde 204 sin error", async () => {
    const { req } = await setup();
    expect((await req({ method: "POST", url: "/api/auth/logout" })).statusCode).toBe(204);
    expect(
      (await req({ method: "POST", url: "/api/auth/logout", cookie: "ph_session=falso" }))
        .statusCode,
    ).toBe(204);
  });

  it("R37: me devuelve {id,name,role} del actor, sin campos extra", async () => {
    const { req, loginCookie, anaId } = await setup();
    const cookie = await loginCookie("Ana", "2222");
    const response = await req({ method: "GET", url: "/api/auth/me", cookie });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: anaId, name: "Ana", role: "player" });
  });
});

describe("PUT /api/auth/pin", () => {
  it("R38: con el PIN actual correcto cambia el PIN, 204, y revoca las otras sesiones", async () => {
    const { req, loginCookie } = await setup();
    const current = await loginCookie("Ana", "2222");
    const other = await loginCookie("Ana", "2222");
    const response = await req({
      method: "PUT",
      url: "/api/auth/pin",
      cookie: current,
      body: { currentPin: "2222", newPin: "5555" },
    });
    expect(response.statusCode).toBe(204);
    expect((await req({ method: "GET", url: "/api/auth/me", cookie: current })).statusCode).toBe(
      200,
    );
    expect((await req({ method: "GET", url: "/api/auth/me", cookie: other })).statusCode).toBe(401);
    expect(
      (
        await req({
          method: "POST",
          url: "/api/auth/login",
          body: { name: "Ana", pin: "2222" },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await req({
          method: "POST",
          url: "/api/auth/login",
          body: { name: "Ana", pin: "5555" },
        })
      ).statusCode,
    ).toBe(200);
  });

  it("R39: PIN actual incorrecto -> 403 invalid_current_pin y el hash no cambia", async () => {
    const { req, loginCookie, fx, anaId } = await setup();
    const cookie = await loginCookie("Ana", "2222");
    const before = (await fx.users.findById(anaId))?.pinHash;
    const response = await req({
      method: "PUT",
      url: "/api/auth/pin",
      cookie,
      body: { currentPin: "0000", newPin: "5555" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("invalid_current_pin");
    expect((await fx.users.findById(anaId))?.pinHash).toBe(before);
  });

  it("R40: los PIN actuales incorrectos cuentan para el bloqueo y acaban en 429", async () => {
    const { req, loginCookie } = await setup();
    const cookie = await loginCookie("Ana", "2222");
    const body = { currentPin: "0000", newPin: "5555" };
    for (let i = 0; i < 5; i += 1) {
      expect((await req({ method: "PUT", url: "/api/auth/pin", cookie, body })).statusCode).toBe(
        403,
      );
    }
    const locked = await req({
      method: "PUT",
      url: "/api/auth/pin",
      cookie,
      body: { currentPin: "2222", newPin: "5555" },
    });
    expect(locked.statusCode).toBe(429);
    expect(locked.headers["retry-after"]).toBe("900");
  });

  it("R92: PIN nuevo con formato inválido -> 400 validation_error y el hash no cambia", async () => {
    const { req, loginCookie, fx, anaId } = await setup();
    const cookie = await loginCookie("Ana", "2222");
    const before = (await fx.users.findById(anaId))?.pinHash;
    for (const newPin of ["12", "123456789", "abcd", "", 1234]) {
      const response = await req({
        method: "PUT",
        url: "/api/auth/pin",
        cookie,
        body: { currentPin: "2222", newPin },
      });
      expect(response.statusCode, String(newPin)).toBe(400);
      expect(response.json().error.code).toBe("validation_error");
    }
    expect((await fx.users.findById(anaId))?.pinHash).toBe(before);
    expect(fx.attempts.size()).toBe(0); // un formato inválido no cuenta como intento fallido
  });

  it("sin sesión -> 401", async () => {
    const { req } = await setup();
    const response = await req({
      method: "PUT",
      url: "/api/auth/pin",
      body: { currentPin: "2222", newPin: "5555" },
    });
    expect(response.statusCode).toBe(401);
  });
});

describe("el PIN y el hash no salen en respuestas ni en logs", () => {
  it("R58: ninguna respuesta contiene el PIN ni el prefijo del hash", async () => {
    const { req, loginCookie, fx, anaId, gmId } = await setup();
    const hashes = (await fx.users.list()).map((u) => u.pinHash);
    expect(hashes.length).toBeGreaterThan(0);
    const cookie = await loginCookie("Ana", "2222");
    const gmCookie = await loginCookie("Gandalf", "1111");
    const responses = [
      await req({ method: "POST", url: "/api/auth/login", body: { name: "Ana", pin: "2222" } }),
      await req({ method: "POST", url: "/api/auth/login", body: { name: "Ana", pin: "7777" } }),
      await req({ method: "GET", url: "/api/auth/me", cookie }),
      await req({
        method: "PUT",
        url: "/api/auth/pin",
        cookie,
        body: { currentPin: "8888", newPin: "6666" },
      }),
      await req({ method: "GET", url: "/api/accounts", cookie: gmCookie }),
      await req({ method: "GET", url: `/api/accounts/${anaId}`, cookie: gmCookie }),
      await req({ method: "GET", url: `/api/accounts/${gmId}`, cookie: gmCookie }),
    ];
    for (const response of responses) {
      const text = response.body + JSON.stringify(response.headers);
      for (const hash of hashes) {
        expect(text).not.toContain(hash);
        expect(text).not.toContain(hash.slice(0, 12));
      }
      expect(text).not.toContain("pinHash");
      expect(text).not.toContain("pin_hash");
    }
  });

  it("R59: login correcto e incorrecto no escriben el PIN en los logs", async () => {
    const { req, logs } = await setup();
    await req({
      method: "POST",
      url: "/api/auth/login",
      body: { name: "Ana", pin: "2222" },
    });
    await req({
      method: "POST",
      url: "/api/auth/login",
      body: { name: "Ana", pin: "98761234" },
    });
    await req({
      method: "POST",
      url: "/api/auth/login",
      body: { name: "Nadie", pin: "55443322" },
    });
    expect(logs.length).toBeGreaterThan(0);
    const all = logs.join("");
    expect(all).toContain("/api/auth/login"); // el logger sí estaba activo
    for (const pin of ["2222", "98761234", "55443322"]) {
      expect(all).not.toContain(`"${pin}"`);
      expect(all).not.toContain(`:${pin}`);
    }
  });

  it("R59: un cuerpo mal formado con un PIN no vuelca el fragmento en los logs", async () => {
    const { app, logs } = await setup();
    await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "application/json" },
      payload: '{"name":"Ana","pin":"31415926"',
    });
    await app.inject({
      method: "PUT",
      url: "/api/auth/pin",
      headers: { "content-type": "application/json" },
      payload: '{"currentPin":"27182818","newPin":"1618',
    });
    const all = logs.join("");
    expect(all).not.toContain("31415926");
    expect(all).not.toContain("27182818");
  });

  it("R59: cambio de PIN y restablecimiento no escriben ningún PIN en los logs", async () => {
    const { req, loginCookie, logs, anaId } = await setup();
    const cookie = await loginCookie("Ana", "2222");
    await req({
      method: "PUT",
      url: "/api/auth/pin",
      cookie,
      body: { currentPin: "13572468", newPin: "24681357" },
    });
    const gm = await loginCookie("Gandalf", "1111");
    await req({
      method: "PUT",
      url: `/api/accounts/${anaId}/pin`,
      cookie: gm,
      body: { pin: "86420246" },
    });
    const all = logs.join("");
    for (const pin of ["13572468", "24681357", "86420246"]) expect(all).not.toContain(pin);
  });
});
