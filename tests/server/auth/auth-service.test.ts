import { beforeEach, describe, expect, it } from "vitest";
import { hashSessionToken } from "../../../src/server/auth/session-token";
import { makeAuthFixture, type AuthFixture } from "../../helpers/auth-fixture";
import { SpyPinHasher } from "../../helpers/spy-pin-hasher";

const DAY = 86_400_000;
const MIN = 60_000;

let f: AuthFixture;

async function seedPlayer(name = "Valeros", pin = "1234"): Promise<string> {
  const created = await f.accounts.createPlayer(name, pin);
  if (!created.ok) throw new Error("no se pudo crear la cuenta de prueba");
  return created.value.id;
}

async function loginToken(name = "Valeros", pin = "1234"): Promise<string> {
  const result = await f.auth.login(name, pin);
  if (!result.ok) throw new Error(`login falló: ${result.error.code}`);
  return result.value.token;
}

beforeEach(() => {
  f = makeAuthFixture();
});

describe("AuthService.login", () => {
  it("R19: un login correcto devuelve la cuenta y un token, y crea la sesión en el store", async () => {
    const id = await seedPlayer();
    const result = await f.auth.login("Valeros", "1234");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.user).toEqual({ id, name: "Valeros", role: "player" });
    expect(result.value.maxAgeSeconds).toBe(30 * 86_400);
    const stored = await f.sessions.findByTokenHash(hashSessionToken(result.value.token));
    expect(stored).toEqual({
      tokenHash: hashSessionToken(result.value.token),
      userId: id,
      createdAt: f.clock.now(),
      lastSeenAt: f.clock.now(),
      expiresAt: f.clock.now() + 30 * DAY,
    });
  });

  it("R19: cada login crea una sesión distinta con un token distinto", async () => {
    await seedPlayer();
    const a = await loginToken();
    const b = await loginToken();
    expect(a).not.toBe(b);
    expect(f.sessions.dump()).toHaveLength(2);
  });

  it("R20: mayúsculas/minúsculas y espacios exteriores son el mismo nombre", async () => {
    const id = await seedPlayer("Valeros");
    for (const name of ["valeros", "VALEROS", "  Valeros  ", "vALEROS\t"]) {
      const result = await f.auth.login(name, "1234");
      expect(result.ok, name).toBe(true);
      if (result.ok) expect(result.value.user.id).toBe(id);
    }
  });

  it("R28: solo se persiste el SHA-256 del token, nunca el token", async () => {
    await seedPlayer();
    const token = await loginToken();
    const dump = f.sessions.dump();
    expect(dump).toHaveLength(1);
    expect(dump[0]?.tokenHash).toBe(hashSessionToken(token));
    expect(JSON.stringify(dump)).not.toContain(token);
  });

  it("R21-R23: nombre desconocido, PIN incorrecto y cuenta deshabilitada dan el mismo error", async () => {
    const id = await seedPlayer("Valeros", "1234");
    await seedPlayer("Kyra", "5678");
    const unknown = await f.auth.login("Nadie", "1234");
    const wrongPin = await f.auth.login("Valeros", "0000");
    await f.accounts.setDisabled(id, true);
    const disabledCorrect = await f.auth.login("Valeros", "1234");
    const expected = { ok: false, error: { code: "invalid_credentials" } };
    expect(unknown).toEqual(expected);
    expect(wrongPin).toEqual(expected);
    expect(disabledCorrect).toEqual(expected);
    expect(f.sessions.dump()).toHaveLength(0);
  });

  it("R43: bloqueada, ni siquiera el PIN correcto entra y no se verifica el PIN", async () => {
    await seedPlayer();
    for (let i = 0; i < 5; i += 1) await f.auth.login("Valeros", "0000");
    const callsBefore = f.hasher.verifyCalls.length;
    const result = await f.auth.login("Valeros", "1234");
    expect(result).toEqual({ ok: false, error: { code: "locked", retryAfterSeconds: 900 } });
    expect(f.hasher.verifyCalls.length).toBe(callsBefore); // el hasher no recibe llamadas
    expect(f.sessions.dump()).toHaveLength(0);
  });

  it("R43: retryAfterSeconds baja con el tiempo y se redondea hacia arriba", async () => {
    await seedPlayer();
    for (let i = 0; i < 5; i += 1) await f.auth.login("Valeros", "0000");
    f.clock.advance(14 * MIN + 30_500);
    const result = await f.auth.login("Valeros", "1234");
    expect(result).toEqual({ ok: false, error: { code: "locked", retryAfterSeconds: 30 } });
    f.clock.advance(30_500);
    expect((await f.auth.login("Valeros", "1234")).ok).toBe(true);
  });

  it("R42/R43: el 5.º fallo todavía responde invalid_credentials; el bloqueo se anuncia desde el 6.º", async () => {
    await seedPlayer();
    for (let i = 0; i < 4; i += 1) await f.auth.login("Valeros", "0000");
    expect(await f.auth.login("Valeros", "0000")).toEqual({
      ok: false,
      error: { code: "invalid_credentials" },
    });
    expect((await f.auth.login("Valeros", "0000")).ok).toBe(false);
    expect(await f.auth.login("Valeros", "0000")).toMatchObject({
      error: { code: "locked" },
    });
  });

  it("R41: el bloqueo también afecta a nombres que no existen, con el mismo comportamiento", async () => {
    for (let i = 0; i < 5; i += 1) await f.auth.login("Fantasma", "1234");
    expect(await f.auth.login("Fantasma", "1234")).toMatchObject({ error: { code: "locked" } });
    expect(await f.auth.login("fantasma ", "1234")).toMatchObject({ error: { code: "locked" } });
  });

  it("R47: un login correcto reinicia el contador de fallos", async () => {
    await seedPlayer();
    for (let i = 0; i < 4; i += 1) await f.auth.login("Valeros", "0000");
    expect((await f.auth.login("Valeros", "1234")).ok).toBe(true);
    for (let i = 0; i < 4; i += 1) await f.auth.login("Valeros", "0000");
    expect((await f.auth.login("Valeros", "1234")).ok).toBe(true); // no estaba bloqueada
  });

  it("R48: más de 5 logins simultáneos incorrectos verifican el PIN como máximo 5 veces", async () => {
    f = makeAuthFixture({ hasher: new SpyPinHasher(2) });
    await seedPlayer();
    f.hasher.verifyCalls.length = 0;
    const results = await Promise.all(
      Array.from({ length: 20 }, () => f.auth.login("Valeros", "0000")),
    );
    expect(f.hasher.verifyCalls).toHaveLength(5);
    expect(results.filter((r) => !r.ok && r.error.code === "invalid_credentials")).toHaveLength(5);
    expect(results.filter((r) => !r.ok && r.error.code === "locked")).toHaveLength(15);
  });

  it("R48: la ráfaga concurrente con un PIN correcto mezclado no se cuela tras el bloqueo", async () => {
    f = makeAuthFixture({ hasher: new SpyPinHasher(2) });
    await seedPlayer();
    const attempts = [
      ...Array.from({ length: 5 }, () => f.auth.login("Valeros", "0000")),
      f.auth.login("Valeros", "1234"), // llega después de 5 fallos en cola
    ];
    const results = await Promise.all(attempts);
    expect(results[5]).toMatchObject({ ok: false, error: { code: "locked" } });
  });

  it("R49: nombre desconocido ejecuta exactamente una verificación contra un hash ficticio", async () => {
    await seedPlayer();
    const userHash = (await f.users.findByNameKey("valeros"))?.pinHash;
    await f.auth.warmUp();
    f.hasher.verifyCalls.length = 0;
    await f.auth.login("Nadie", "1234");
    expect(f.hasher.verifyCalls).toHaveLength(1);
    expect(f.hasher.verifyCalls[0]?.stored).toBeTruthy();
    expect(f.hasher.verifyCalls[0]?.stored).not.toBe(userHash);
  });

  it("R49: el hash ficticio se calcula una sola vez y se reutiliza", async () => {
    await f.auth.login("Nadie", "1234");
    await f.auth.login("Nadie2", "1234");
    await f.auth.login("Nadie3", "1234");
    expect(f.hasher.hashCalls).toBe(1);
    const stored = new Set(f.hasher.verifyCalls.map((c) => c.stored));
    expect(stored.size).toBe(1);
  });

  it("R49: cuenta deshabilitada con PIN correcto: una verificación, contra el hash ficticio", async () => {
    const id = await seedPlayer();
    await f.accounts.setDisabled(id, true);
    const userHash = (await f.users.findById(id))?.pinHash;
    f.hasher.verifyCalls.length = 0;
    await f.auth.login("Valeros", "1234");
    expect(f.hasher.verifyCalls).toHaveLength(1);
    expect(f.hasher.verifyCalls[0]?.stored).not.toBe(userHash);
  });
});

describe("AuthService.authenticate", () => {
  it("R29: devuelve el actor con el rol leído de la cuenta almacenada", async () => {
    const id = await seedPlayer();
    const token = await loginToken();
    expect(await f.auth.authenticate(token)).toEqual({ userId: id, role: "player" });
  });

  it("R29: el rol se relee en cada petición (un cambio en el store surte efecto inmediato)", async () => {
    const id = await seedPlayer();
    const token = await loginToken();
    f.users.testOnlySetRole(id, "gm");
    expect(await f.auth.authenticate(token)).toEqual({ userId: id, role: "gm" });
  });

  it("R30: sin token, vacío o desconocido devuelve null", async () => {
    await seedPlayer();
    await loginToken();
    expect(await f.auth.authenticate(undefined)).toBeNull();
    expect(await f.auth.authenticate("")).toBeNull();
    expect(await f.auth.authenticate("token-inventado")).toBeNull();
  });

  it("R30: el hash del token guardado no sirve como token", async () => {
    await seedPlayer();
    const token = await loginToken();
    expect(await f.auth.authenticate(hashSessionToken(token))).toBeNull();
  });

  it("R31: a los 30 días desde la creación la sesión caduca y se borra, aunque haya actividad", async () => {
    await seedPlayer();
    const token = await loginToken();
    for (let day = 1; day <= 29; day += 1) {
      f.clock.advance(DAY);
      expect(await f.auth.authenticate(token), `día ${day}`).not.toBeNull();
    }
    f.clock.advance(DAY - 1);
    expect(await f.auth.authenticate(token)).not.toBeNull();
    f.clock.advance(1);
    expect(await f.auth.authenticate(token)).toBeNull();
    expect(f.sessions.dump()).toHaveLength(0);
  });

  it("R32: a los 7 días sin actividad la sesión caduca y se borra", async () => {
    await seedPlayer();
    const token = await loginToken();
    f.clock.advance(7 * DAY - 1);
    expect(await f.auth.authenticate(token)).not.toBeNull(); // esta petición cuenta como actividad
    f.clock.advance(7 * DAY);
    expect(await f.auth.authenticate(token)).toBeNull();
    expect(f.sessions.dump()).toHaveLength(0);
  });

  it("R32: sin actividad exactamente 7 días la sesión ya no es válida", async () => {
    await seedPlayer();
    const token = await loginToken();
    f.clock.advance(7 * DAY - 1);
    expect(await f.auth.authenticate(token)).not.toBeNull();
    f.clock.advance(7 * DAY - 1);
    expect(await f.auth.authenticate(token)).not.toBeNull();
  });

  it("R33: una cuenta deshabilitada o inexistente invalida la sesión", async () => {
    const id = await seedPlayer();
    const token = await loginToken();
    // sesión conservada a propósito (sin revocación) para aislar la comprobación de R33
    await f.users.update(id, { disabled: true }, f.clock.now());
    expect(await f.auth.authenticate(token)).toBeNull();
    await f.users.update(id, { disabled: false }, f.clock.now());
    expect(await f.auth.authenticate(token)).not.toBeNull();
    f.users.testOnlyRemove(id);
    expect(await f.auth.authenticate(token)).toBeNull();
  });

  it("R9/R33: deshabilitar una cuenta revoca su sesión (aunque se rehabilite después)", async () => {
    const id = await seedPlayer();
    const token = await loginToken();
    await f.accounts.setDisabled(id, true);
    await f.accounts.setDisabled(id, false);
    expect(await f.auth.authenticate(token)).toBeNull();
  });

  it("R34: lastSeenAt se actualiza solo si han pasado más de 60 s", async () => {
    await seedPlayer();
    const token = await loginToken();
    const tokenHash = hashSessionToken(token);
    const start = f.clock.now();
    f.clock.advance(MIN);
    await f.auth.authenticate(token);
    expect((await f.sessions.findByTokenHash(tokenHash))?.lastSeenAt).toBe(start); // justo 60 s
    f.clock.advance(1);
    await f.auth.authenticate(token);
    expect((await f.sessions.findByTokenHash(tokenHash))?.lastSeenAt).toBe(start + MIN + 1);
  });

  it("R34: la actividad prolonga la inactividad pero no la caducidad absoluta", async () => {
    await seedPlayer();
    const token = await loginToken();
    const tokenHash = hashSessionToken(token);
    const session = await f.sessions.findByTokenHash(tokenHash);
    f.clock.advance(5 * DAY);
    await f.auth.authenticate(token);
    const after = await f.sessions.findByTokenHash(tokenHash);
    expect(after?.expiresAt).toBe(session?.expiresAt);
    expect(after?.lastSeenAt).toBe(f.clock.now());
  });
});

describe("AuthService.login: sesión previa (R95)", () => {
  it("R95: un login correcto con un token previo revoca esa sesión y crea una nueva", async () => {
    await seedPlayer();
    const previous = await loginToken();
    const result = await f.auth.login("Valeros", "1234", previous);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await f.auth.authenticate(previous)).toBeNull();
    expect(await f.auth.authenticate(result.value.token)).not.toBeNull();
    expect(f.sessions.dump()).toHaveLength(1);
  });

  it("R95: el token previo de otra cuenta también se revoca; las demás sesiones no se tocan", async () => {
    await seedPlayer("Valeros", "1234");
    await seedPlayer("Merisiel", "5678");
    const valerosPrev = await loginToken("Valeros", "1234");
    const valerosOther = await loginToken("Valeros", "1234");
    const login = await f.auth.login("Merisiel", "5678", valerosPrev);
    expect(login.ok).toBe(true);
    expect(await f.auth.authenticate(valerosPrev)).toBeNull();
    expect(await f.auth.authenticate(valerosOther)).not.toBeNull();
  });

  it("R95: un token previo inválido, desconocido o vacío no produce error", async () => {
    await seedPlayer();
    for (const previous of ["", "desconocido", "x".repeat(5000), "ñ\u0000"]) {
      const result = await f.auth.login("Valeros", "1234", previous);
      expect(result.ok, previous).toBe(true);
    }
  });

  it("R95: un login fallido (PIN incorrecto) NO revoca la sesión previa", async () => {
    await seedPlayer();
    const previous = await loginToken();
    expect((await f.auth.login("Valeros", "0000", previous)).ok).toBe(false);
    expect(await f.auth.authenticate(previous)).not.toBeNull();
  });
});

describe("AuthService.logout", () => {
  it("borra la sesión y es idempotente (R35, R36)", async () => {
    await seedPlayer();
    const token = await loginToken();
    await f.auth.logout(token);
    expect(await f.auth.authenticate(token)).toBeNull();
    await expect(f.auth.logout(token)).resolves.toBeUndefined();
    await expect(f.auth.logout(undefined)).resolves.toBeUndefined();
    await expect(f.auth.logout("desconocido")).resolves.toBeUndefined();
  });

  it("solo cierra la sesión indicada, no las demás del mismo usuario", async () => {
    await seedPlayer();
    const a = await loginToken();
    const b = await loginToken();
    await f.auth.logout(a);
    expect(await f.auth.authenticate(b)).not.toBeNull();
  });
});

describe("AuthService.changeOwnPin", () => {
  it("R38: con el PIN actual correcto cambia el hash y revoca el resto de sesiones", async () => {
    const id = await seedPlayer();
    const current = await loginToken();
    const other = await loginToken();
    await seedPlayer("Otro", "9999");
    const otherUserToken = await loginToken("Otro", "9999");
    const actor = { userId: id, role: "player" as const };

    const result = await f.auth.changeOwnPin(actor, current, "1234", "4321");
    expect(result).toEqual({ ok: true, value: undefined });
    expect(await f.auth.authenticate(current)).not.toBeNull();
    expect(await f.auth.authenticate(other)).toBeNull();
    expect(await f.auth.authenticate(otherUserToken)).not.toBeNull(); // sesiones de otros intactas
    expect((await f.auth.login("Valeros", "1234")).ok).toBe(false);
    expect((await f.auth.login("Valeros", "4321")).ok).toBe(true);
  });

  it("R38: el hash almacenado cambia y no contiene el PIN nuevo", async () => {
    const id = await seedPlayer();
    const current = await loginToken();
    const before = (await f.users.findById(id))?.pinHash;
    await f.auth.changeOwnPin({ userId: id, role: "player" }, current, "1234", "73920518");
    const after = (await f.users.findById(id))?.pinHash;
    expect(after).not.toBe(before);
    expect(JSON.stringify(f.users.dump())).not.toContain("73920518");
  });

  it("R39/R40: un PIN actual incorrecto no cambia el hash y cuenta como intento fallido", async () => {
    const id = await seedPlayer();
    const current = await loginToken();
    const actor = { userId: id, role: "player" as const };
    const before = (await f.users.findById(id))?.pinHash;
    for (let i = 0; i < 4; i += 1) {
      expect(await f.auth.changeOwnPin(actor, current, "0000", "4321")).toEqual({
        ok: false,
        error: { code: "invalid_current_pin" },
      });
    }
    expect((await f.users.findById(id))?.pinHash).toBe(before);
    // 4 fallos por cambio de PIN + 1 de login = 5 -> bloqueo: comparten el mismo límite
    await f.auth.login("Valeros", "0000");
    expect(await f.auth.login("Valeros", "1234")).toMatchObject({ error: { code: "locked" } });
  });

  it("R40: 5 PIN actuales incorrectos bloquean también el cambio de PIN (con el correcto)", async () => {
    const id = await seedPlayer();
    const current = await loginToken();
    const actor = { userId: id, role: "player" as const };
    for (let i = 0; i < 5; i += 1) await f.auth.changeOwnPin(actor, current, "0000", "4321");
    f.hasher.verifyCalls.length = 0;
    const result = await f.auth.changeOwnPin(actor, current, "1234", "4321");
    expect(result).toEqual({ ok: false, error: { code: "locked", retryAfterSeconds: 900 } });
    expect(f.hasher.verifyCalls).toHaveLength(0);
  });

  it("un cambio de PIN correcto reinicia el contador de fallos", async () => {
    const id = await seedPlayer();
    const current = await loginToken();
    const actor = { userId: id, role: "player" as const };
    for (let i = 0; i < 4; i += 1) await f.auth.changeOwnPin(actor, current, "0000", "4321");
    await f.auth.changeOwnPin(actor, current, "1234", "4321");
    for (let i = 0; i < 4; i += 1) await f.auth.login("Valeros", "0000");
    expect((await f.auth.login("Valeros", "4321")).ok).toBe(true);
  });
});
