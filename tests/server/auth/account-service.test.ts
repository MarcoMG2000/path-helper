import { beforeEach, describe, expect, it } from "vitest";
import { AccountService } from "../../../src/server/auth/account-service";
import { ScryptPinHasher } from "../../../src/server/auth/pin-hasher";
import { makeAuthFixture, type AuthFixture } from "../../helpers/auth-fixture";

let f: AuthFixture;

beforeEach(() => {
  f = makeAuthFixture();
});

async function player(name: string, pin = "1234"): Promise<string> {
  const created = await f.accounts.createPlayer(name, pin);
  if (!created.ok) throw new Error(`alta falló: ${created.error.code}`);
  return created.value.id;
}

describe("AccountService.createPlayer", () => {
  it("R93: un nombre con caracteres de formato (RLO, ancho cero) es validation_error y no crea nada", async () => {
    for (const name of ["Ana\u202e", "A\u200bna", "A\ufeffna", "Ana\u0001"]) {
      expect(await f.accounts.createPlayer(name, "1234"), JSON.stringify(name)).toEqual({
        ok: false,
        error: { code: "validation_error" },
      });
    }
    expect(await f.users.list()).toHaveLength(0);
  });

  it("R94: el nombre se guarda en NFC y dos nombres canónicamente equivalentes dan name_taken", async () => {
    const first = await f.accounts.createPlayer("Cafe\u0301", "1234");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.name).toBe("Caf\u00e9");
    expect((await f.users.findById(first.value.id))?.nameKey).toBe("café");
    expect(await f.accounts.createPlayer("Caf\u00e9", "1234")).toEqual({
      ok: false,
      error: { code: "name_taken" },
    });
    expect(await f.users.list()).toHaveLength(1);
  });

  it("R1: crea una cuenta player habilitada y devuelve su DTO sin PIN ni hash", async () => {
    const result = await f.accounts.createPlayer("  Valeros ", "0042");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      name: "Valeros",
      role: "player",
      disabled: false,
      createdAt: new Date(f.clock.now()).toISOString(),
    });
    const stored = await f.users.findById(result.value.id);
    expect(stored).toMatchObject({ nameKey: "valeros", role: "player", disabled: false });
    expect(stored?.pinHash).not.toBe("0042");
  });

  it("R1: el PIN se almacena como hash verificable (con ceros a la izquierda)", async () => {
    const id = await player("Ana", "0042");
    const user = await f.users.findById(id);
    expect(await f.hasher.verify("0042", user?.pinHash ?? "")).toBe(true);
    expect(await f.hasher.verify("42", user?.pinHash ?? "")).toBe(false);
  });

  it("R2: otro nombre con la misma clave (mayúsculas, espacios) da name_taken y no crea nada", async () => {
    await player("Valeros");
    for (const name of ["valeros", "VALEROS", "  Valeros "]) {
      expect(await f.accounts.createPlayer(name, "9999")).toEqual({
        ok: false,
        error: { code: "name_taken" },
      });
    }
    expect(await f.accounts.list()).toHaveLength(1);
  });

  it("R3: nombre o PIN inválidos dan validation_error y no crean la cuenta", async () => {
    const bad: [string, string][] = [
      ["", "1234"],
      ["   ", "1234"],
      ["x".repeat(33), "1234"],
      ["con\nsalto", "1234"],
      ["Ana", "123"],
      ["Ana", "123456789"],
      ["Ana", "12a4"],
      ["Ana", ""],
    ];
    for (const [name, pin] of bad) {
      expect(await f.accounts.createPlayer(name, pin), `${name}/${pin}`).toEqual({
        ok: false,
        error: { code: "validation_error" },
      });
    }
    expect(await f.accounts.list()).toEqual([]);
  });

  it("solo crea jugadores: no hay camino para crear un gm", async () => {
    const id = await player("Ana");
    expect((await f.users.findById(id))?.role).toBe("player");
    expect(await f.users.hasRole("gm")).toBe(false);
  });
});

describe("AccountService.list/get", () => {
  it("R4: lista todas las cuentas con id, name, role, disabled y createdAt, sin secretos", async () => {
    const a = await player("Ana");
    f.clock.advance(1000);
    const b = await player("Beto");
    const list = await f.accounts.list();
    expect(list.map((x) => x.id)).toEqual([a, b]);
    for (const account of list) {
      expect(Object.keys(account).sort()).toEqual(["createdAt", "disabled", "id", "name", "role"]);
    }
  });

  it("get devuelve la cuenta o null", async () => {
    const id = await player("Ana");
    expect((await f.accounts.get(id))?.name).toBe("Ana");
    expect(await f.accounts.get("no-existe")).toBeNull();
  });
});

describe("AccountService.resetPin", () => {
  it("R5: sustituye el hash de PIN; el antiguo deja de valer y el nuevo vale", async () => {
    const id = await player("Ana", "1111");
    const before = (await f.users.findById(id))?.pinHash;
    expect(await f.accounts.resetPin(id, "2222")).toEqual({ ok: true, value: undefined });
    const after = (await f.users.findById(id))?.pinHash;
    expect(after).not.toBe(before);
    expect((await f.auth.login("Ana", "1111")).ok).toBe(false);
    expect((await f.auth.login("Ana", "2222")).ok).toBe(true);
  });

  it("R6: revoca todas las sesiones de esa cuenta y solo de esa", async () => {
    const id = await player("Ana", "1111");
    await player("Beto", "3333");
    const a1 = await f.auth.login("Ana", "1111");
    const a2 = await f.auth.login("Ana", "1111");
    const b = await f.auth.login("Beto", "3333");
    if (!a1.ok || !a2.ok || !b.ok) throw new Error("login");
    await f.accounts.resetPin(id, "2222");
    expect(await f.auth.authenticate(a1.value.token)).toBeNull();
    expect(await f.auth.authenticate(a2.value.token)).toBeNull();
    expect(await f.auth.authenticate(b.value.token)).not.toBeNull();
  });

  it("R7: borra el bloqueo por intentos de esa cuenta (y no el de otras)", async () => {
    const id = await player("Ana", "1111");
    await player("Beto", "3333");
    for (let i = 0; i < 5; i += 1) {
      await f.auth.login("Ana", "0000");
      await f.auth.login("Beto", "0000");
    }
    expect(await f.auth.login("Ana", "1111")).toMatchObject({ error: { code: "locked" } });
    await f.accounts.resetPin(id, "2222");
    expect((await f.auth.login("Ana", "2222")).ok).toBe(true);
    expect(await f.auth.login("Beto", "3333")).toMatchObject({ error: { code: "locked" } });
  });

  it("PIN inválido -> validation_error sin cambios; id inexistente -> not_found", async () => {
    const id = await player("Ana", "1111");
    const before = (await f.users.findById(id))?.pinHash;
    expect(await f.accounts.resetPin(id, "12")).toEqual({
      ok: false,
      error: { code: "validation_error" },
    });
    expect((await f.users.findById(id))?.pinHash).toBe(before);
    expect(await f.accounts.resetPin("no-existe", "2222")).toEqual({
      ok: false,
      error: { code: "not_found" },
    });
  });
});

describe("AccountService.unlock", () => {
  it("R8: borra el bloqueo sin cambiar el PIN", async () => {
    const id = await player("Ana", "1111");
    const before = (await f.users.findById(id))?.pinHash;
    for (let i = 0; i < 5; i += 1) await f.auth.login("Ana", "0000");
    expect(await f.auth.login("Ana", "1111")).toMatchObject({ error: { code: "locked" } });
    expect(await f.accounts.unlock(id)).toEqual({ ok: true, value: undefined });
    expect((await f.users.findById(id))?.pinHash).toBe(before);
    expect((await f.auth.login("Ana", "1111")).ok).toBe(true);
  });

  it("id inexistente -> not_found", async () => {
    expect(await f.accounts.unlock("no-existe")).toEqual({
      ok: false,
      error: { code: "not_found" },
    });
  });
});

describe("AccountService.setDisabled", () => {
  it("R9: deshabilitar marca la cuenta y revoca todas sus sesiones", async () => {
    const id = await player("Ana", "1111");
    const login = await f.auth.login("Ana", "1111");
    if (!login.ok) throw new Error("login");
    const result = await f.accounts.setDisabled(id, true);
    expect(result).toMatchObject({ ok: true, value: { id, disabled: true } });
    expect((await f.users.findById(id))?.disabled).toBe(true);
    expect(await f.auth.authenticate(login.value.token)).toBeNull();
    expect(f.sessions.dump()).toHaveLength(0);
  });

  it("R10: habilitar una cuenta deshabilitada la deja habilitada y permite login", async () => {
    const id = await player("Ana", "1111");
    await f.accounts.setDisabled(id, true);
    const result = await f.accounts.setDisabled(id, false);
    expect(result).toMatchObject({ ok: true, value: { id, disabled: false } });
    expect((await f.auth.login("Ana", "1111")).ok).toBe(true);
  });

  it("R11: no se puede deshabilitar una cuenta gm; la cuenta no cambia", async () => {
    const created = await f.accounts.bootstrapFirstGm("Gandalf", "1234");
    if (!created.ok) throw new Error("bootstrap");
    expect(await f.accounts.setDisabled(created.value.id, true)).toEqual({
      ok: false,
      error: { code: "cannot_disable_gm" },
    });
    expect((await f.users.findById(created.value.id))?.disabled).toBe(false);
  });

  it("id inexistente -> not_found", async () => {
    expect(await f.accounts.setDisabled("no-existe", true)).toEqual({
      ok: false,
      error: { code: "not_found" },
    });
  });
});

describe("AccountService.bootstrapFirstGm", () => {
  it("R15: sin GM existente crea una cuenta con rol gm", async () => {
    const result = await f.accounts.bootstrapFirstGm("Gandalf", "0000");
    expect(result).toMatchObject({
      ok: true,
      value: { name: "Gandalf", role: "gm", disabled: false },
    });
    expect(await f.users.hasRole("gm")).toBe(true);
    expect((await f.auth.login("Gandalf", "0000")).ok).toBe(true);
  });

  it("R16: si ya hay un gm devuelve gm_exists y no crea ninguna cuenta", async () => {
    await f.accounts.bootstrapFirstGm("Gandalf", "1234");
    expect(await f.accounts.bootstrapFirstGm("Otro", "4321")).toEqual({
      ok: false,
      error: { code: "gm_exists" },
    });
    expect(await f.accounts.list()).toHaveLength(1);
  });

  it("R16: gm_exists aunque el GM existente esté deshabilitado en el store", async () => {
    const created = await f.accounts.bootstrapFirstGm("Gandalf", "1234");
    if (!created.ok) throw new Error("bootstrap");
    await f.users.update(created.value.id, { disabled: true }, 1);
    expect(await f.accounts.bootstrapFirstGm("Otro", "4321")).toMatchObject({
      error: { code: "gm_exists" },
    });
  });

  it("R17: nombre o PIN inválidos -> validation_error y no crea cuenta", async () => {
    for (const [name, pin] of [
      ["", "1234"],
      ["Gandalf", "12"],
      ["Gandalf", "abcd"],
      ["x".repeat(40), "1234"],
    ] as [string, string][]) {
      expect(await f.accounts.bootstrapFirstGm(name, pin)).toEqual({
        ok: false,
        error: { code: "validation_error" },
      });
    }
    expect(await f.accounts.list()).toEqual([]);
  });

  it("R17: la validación va antes que gm_exists", async () => {
    await f.accounts.bootstrapFirstGm("Gandalf", "1234");
    expect(await f.accounts.bootstrapFirstGm("Otro", "x")).toMatchObject({
      error: { code: "validation_error" },
    });
  });

  it("un nombre ya usado por un jugador -> name_taken (y no gm_exists)", async () => {
    await player("Gandalf");
    expect(await f.accounts.bootstrapFirstGm("gandalf", "1234")).toEqual({
      ok: false,
      error: { code: "name_taken" },
    });
  });
});

describe("PIN en claro", () => {
  it("R57: ningún store contiene el PIN en claro tras operar con cuentas (hasher real)", async () => {
    const pepper = "p".repeat(40);
    const hasher = new ScryptPinHasher(pepper, { N: 16, r: 8, p: 1, keyLen: 32, saltLen: 16 });
    const fx = makeAuthFixture();
    const accounts = new AccountService({
      users: fx.users,
      sessions: fx.sessions,
      attempts: fx.attempts,
      hasher,
      clock: fx.clock,
    });
    const pins = ["73920518", "58204716", "90417263"];
    const gm = await accounts.bootstrapFirstGm("Gandalf", pins[0] ?? "");
    const p = await accounts.createPlayer("Ana", pins[1] ?? "");
    if (!gm.ok || !p.ok) throw new Error("alta");
    await accounts.resetPin(p.value.id, pins[2] ?? "");
    const dump = JSON.stringify({
      users: fx.users.dump(),
      sessions: fx.sessions.dump(),
    });
    for (const pin of pins) expect(dump).not.toContain(pin);
    expect(dump).toContain("scrypt$v1$");
  });
});
