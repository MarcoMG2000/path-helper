import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createServices, type AppServices } from "../../src/web/api/services";
import { makeTestApp, seedAccounts, type TestApp } from "../helpers/test-app";
import { TEST_ORIGIN } from "../helpers/auth-fixture";

// R87: el cliente HTTP real y los módulos de API contra el servidor real (composeApp con stores en
// memoria y un hasher espía rápido). El `fetch` imita al navegador: guarda la cookie de sesión y
// añade `Origin` en los métodos que cambian estado.
interface Jar {
  fetchFn: typeof fetch;
  cookie: () => string | undefined;
  setCookie: (value: string | undefined) => void;
}

function makeBrowserFetch(origin: string = TEST_ORIGIN): Jar {
  let cookie: string | undefined;
  const fetchFn = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (cookie) headers.set("Cookie", cookie);
    const method = (init.method ?? "GET").toUpperCase();
    if (method !== "GET") headers.set("Origin", origin);
    const response = await fetch(input, { ...init, headers, redirect: "manual" });
    for (const header of response.headers.getSetCookie()) {
      const pair = header.split(";")[0] ?? "";
      const [name, value] = pair.split("=");
      if (!name) continue;
      const expired = /max-age=0/i.test(header) || /expires=thu, 01 jan 1970/i.test(header);
      cookie = expired || !value ? undefined : pair;
    }
    return response;
  }) as typeof fetch;
  return { fetchFn, cookie: () => cookie, setCookie: (v) => (cookie = v) };
}

describe("UI de autenticación contra el servidor real", () => {
  let test: TestApp;
  let baseUrl: string;
  let playerId: string;

  beforeAll(async () => {
    test = await makeTestApp();
    const seeded = await seedAccounts(test.fx, [{ name: "Marta", pin: "2468" }], {
      name: "Gandalf",
      pin: "1111",
    });
    playerId = seeded.playerIds[0]!;
    await test.app.listen({ port: 0, host: "127.0.0.1" });
    const address = test.app.server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await test.app.close();
  });

  function client(origin?: string): { services: AppServices; jar: Jar } {
    const jar = makeBrowserFetch(origin);
    return { services: createServices({ baseUrl, fetchFn: jar.fetchFn }), jar };
  }

  it("R87: login, me, cambio de PIN, logout y 401 tras el logout (con el callback invocado)", async () => {
    const { services, jar } = client();
    const onUnauthenticated = vi.fn();
    services.onUnauthenticated(onUnauthenticated);

    const login = await services.auth.login("marta", "2468");
    expect(login).toEqual({ ok: true, value: { id: playerId, name: "Marta", role: "player" } });
    expect(await services.auth.me()).toEqual(login);

    const bad = await services.auth.changePin("0000", "1357");
    expect(bad).toMatchObject({ ok: false, error: { status: 403, code: "invalid_current_pin" } });
    expect(await services.auth.changePin("2468", "1357")).toEqual({ ok: true, value: undefined });

    const staleCookie = jar.cookie();
    expect(staleCookie).toBeTruthy();
    expect(await services.auth.logout()).toEqual({ ok: true, value: undefined });
    expect(onUnauthenticated).not.toHaveBeenCalled();

    // Sin cookie y con la cookie revocada: 401 unauthenticated y se avisa a la sesión.
    expect(await services.auth.me()).toMatchObject({ ok: false, error: { status: 401 } });
    jar.setCookie(staleCookie);
    const afterLogout = await services.auth.me();
    expect(afterLogout).toMatchObject({
      ok: false,
      error: { status: 401, code: "unauthenticated" },
    });
    expect(onUnauthenticated).toHaveBeenCalled();

    // El PIN nuevo funciona y el antiguo no.
    expect((await services.auth.login("Marta", "2468")).ok).toBe(false);
    expect((await services.auth.login("Marta", "1357")).ok).toBe(true);
  });

  it("R87: credenciales inválidas no se notifican como sesión caducada", async () => {
    const { services } = client();
    const onUnauthenticated = vi.fn();
    services.onUnauthenticated(onUnauthenticated);
    const result = await services.auth.login("Nadie", "9999");
    expect(result).toMatchObject({
      ok: false,
      error: { status: 401, code: "invalid_credentials" },
    });
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });

  it("R87: cinco fallos consecutivos y el siguiente intento da 429 locked con retryAfterSeconds", async () => {
    const { services } = client();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = await services.auth.login("Bloqueada", "0000");
      expect(result).toMatchObject({
        ok: false,
        error: { status: 401, code: "invalid_credentials" },
      });
    }
    const locked = await services.auth.login("Bloqueada", "0000");
    expect(locked.ok).toBe(false);
    if (!locked.ok) {
      expect(locked.error.status).toBe(429);
      expect(locked.error.code).toBe("locked");
      expect(locked.error.retryAfterSeconds).toBe(15 * 60);
    }
  });

  it("R87: el GM crea, restablece el PIN, deshabilita, habilita y desbloquea cuentas", async () => {
    const gm = client();
    expect((await gm.services.auth.login("Gandalf", "1111")).ok).toBe(true);

    const created = await gm.services.accounts.create("Pedro", "4321");
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value).toMatchObject({ name: "Pedro", role: "player", disabled: false });
    const id = created.value.id;

    const duplicate = await gm.services.accounts.create("pedro", "4321");
    expect(duplicate).toMatchObject({ ok: false, error: { status: 409, code: "name_taken" } });

    const list = await gm.services.accounts.list();
    expect(list.ok && list.value.map((a) => a.name)).toContain("Pedro");

    // Pedro entra y luego el GM le restablece el PIN: su sesión queda revocada.
    const pedro = client();
    expect((await pedro.services.auth.login("Pedro", "4321")).ok).toBe(true);
    expect(await gm.services.accounts.resetPin(id, "8642")).toEqual({ ok: true, value: undefined });
    expect(await pedro.services.auth.me()).toMatchObject({ ok: false, error: { status: 401 } });
    expect((await pedro.services.auth.login("Pedro", "8642")).ok).toBe(true);

    const disabled = await gm.services.accounts.setDisabled(id, true);
    expect(disabled).toMatchObject({ ok: true, value: { id, disabled: true } });
    expect(await client().services.auth.login("Pedro", "8642")).toMatchObject({
      ok: false,
      error: { code: "invalid_credentials" },
    });
    const enabled = await gm.services.accounts.setDisabled(id, false);
    expect(enabled).toMatchObject({ ok: true, value: { id, disabled: false } });
    expect((await client().services.auth.login("Pedro", "8642")).ok).toBe(true);

    expect(await gm.services.accounts.unlock(id)).toEqual({ ok: true, value: undefined });
    expect(await gm.services.accounts.unlock("no-existe")).toMatchObject({
      ok: false,
      error: { status: 404, code: "not_found" },
    });
  });

  it("R87: un jugador recibe forbidden en /api/accounts", async () => {
    const { services } = client();
    expect((await services.auth.login("Marta", "1357")).ok).toBe(true);
    expect(await services.accounts.list()).toMatchObject({
      ok: false,
      error: { status: 403, code: "forbidden" },
    });
    expect(await services.accounts.create("Intruso", "1234")).toMatchObject({
      ok: false,
      error: { code: "forbidden" },
    });
  });

  it("R87: una petición mutante desde un origen no permitido da bad_origin", async () => {
    const { services } = client("http://evil.example");
    const result = await services.auth.login("Marta", "1357");
    expect(result).toMatchObject({ ok: false, error: { status: 403, code: "bad_origin" } });
  });

  it("R87: sin servidor alcanzable el cliente devuelve network sin lanzar", async () => {
    const jar = makeBrowserFetch();
    const services = createServices({ baseUrl: "http://127.0.0.1:1", fetchFn: jar.fetchFn });
    expect(await services.auth.me()).toEqual({ ok: false, error: { status: 0, code: "network" } });
  });
});
