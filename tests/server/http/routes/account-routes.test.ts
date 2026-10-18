import { afterEach, describe, expect, it } from "vitest";
import { describeOwnershipMatrix } from "../../../helpers/ownership-matrix";
import { makeTestApp, seedAccounts, type TestApp } from "../../../helpers/test-app";

let t: TestApp | undefined;

afterEach(async () => {
  await t?.app.close();
  t = undefined;
});

async function setup(): Promise<
  TestApp & { gm: string; ana: string; anaId: string; beto: string; betoId: string; gmId: string }
> {
  const made = await makeTestApp();
  t = made;
  const { gmId, playerIds } = await seedAccounts(made.fx, [
    { name: "Ana", pin: "2222" },
    { name: "Beto", pin: "3333" },
  ]);
  return {
    ...made,
    gm: await made.loginCookie("Gandalf", "1111"),
    ana: await made.loginCookie("Ana", "2222"),
    beto: await made.loginCookie("Beto", "3333"),
    gmId,
    anaId: playerIds[0] ?? "",
    betoId: playerIds[1] ?? "",
  };
}

const ERROR = (code: string) => ({ error: { code, message: expect.any(String) } });

describe("POST /api/accounts", () => {
  it("R1: un GM crea una cuenta player habilitada (201) que luego puede entrar", async () => {
    const { req, gm } = await setup();
    const response = await req({
      method: "POST",
      url: "/api/accounts",
      cookie: gm,
      body: { name: " Cleo ", pin: "0042" },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      id: expect.any(String),
      name: "Cleo",
      role: "player",
      disabled: false,
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    const login = await req({
      method: "POST",
      url: "/api/auth/login",
      body: { name: "cleo", pin: "0042" },
    });
    expect(login.statusCode).toBe(200);
  });

  it("R1: el cuerpo no puede elegir el rol (se ignora un campo role)", async () => {
    const { req, gm } = await setup();
    const response = await req({
      method: "POST",
      url: "/api/accounts",
      cookie: gm,
      body: { name: "Intruso", pin: "1234", role: "gm" },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().role).toBe("player");
  });

  it("R2: nombre repetido (misma clave de nombre) -> 409 name_taken y no crea la cuenta", async () => {
    const { req, gm, fx } = await setup();
    const before = (await fx.users.list()).length;
    for (const name of ["Ana", "ana", "  ANA ", "gandalf"]) {
      const response = await req({
        method: "POST",
        url: "/api/accounts",
        cookie: gm,
        body: { name, pin: "9999" },
      });
      expect(response.statusCode, name).toBe(409);
      expect(response.json()).toEqual(ERROR("name_taken"));
    }
    expect((await fx.users.list()).length).toBe(before);
  });

  it("R93/R94: nombres con caracteres de formato -> 400; equivalentes Unicode -> 409; se guarda NFC", async () => {
    const { req, gm, fx } = await setup();
    const before = (await fx.users.list()).length;
    for (const name of ["Cleo\u202e", "Cl\u200beo", "Cl\ufeffeo"]) {
      const response = await req({
        method: "POST",
        url: "/api/accounts",
        cookie: gm,
        body: { name, pin: "1234" },
      });
      expect(response.statusCode, JSON.stringify(name)).toBe(400);
      expect(response.json()).toEqual(ERROR("validation_error"));
    }
    expect((await fx.users.list()).length).toBe(before);
    const created = await req({
      method: "POST",
      url: "/api/accounts",
      cookie: gm,
      body: { name: "Jose\u0301", pin: "1234" },
    });
    expect(created.statusCode).toBe(201);
    expect((created.json() as { name: string }).name).toBe("Jos\u00e9");
    const dup = await req({
      method: "POST",
      url: "/api/accounts",
      cookie: gm,
      body: { name: "JOS\u00c9", pin: "1234" },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json()).toEqual(ERROR("name_taken"));
  });

  it("R3: nombre o PIN inválidos -> 400 validation_error y no crea la cuenta", async () => {
    const { req, gm, fx } = await setup();
    const before = (await fx.users.list()).length;
    const bad: unknown[] = [
      {},
      { name: "Cleo" },
      { pin: "1234" },
      { name: "", pin: "1234" },
      { name: "   ", pin: "1234" },
      { name: "x".repeat(33), pin: "1234" },
      { name: "con\u0000nulo", pin: "1234" },
      { name: "Cleo", pin: "123" },
      { name: "Cleo", pin: "123456789" },
      { name: "Cleo", pin: "12ab" },
      { name: "Cleo", pin: 1234 },
      { name: 5, pin: "1234" },
    ];
    for (const body of bad) {
      const response = await req({ method: "POST", url: "/api/accounts", cookie: gm, body });
      expect(response.statusCode, JSON.stringify(body)).toBe(400);
      expect(response.json()).toEqual(ERROR("validation_error"));
    }
    expect((await fx.users.list()).length).toBe(before);
  });
});

describe("GET /api/accounts", () => {
  it("R4: el GM recibe todas las cuentas con id, name, role, disabled y createdAt", async () => {
    const { req, gm, anaId, betoId, gmId } = await setup();
    const response = await req({ method: "GET", url: "/api/accounts", cookie: gm });
    expect(response.statusCode).toBe(200);
    const list = response.json() as { id: string }[];
    expect(list.map((a) => a.id).sort()).toEqual([anaId, betoId, gmId].sort());
    for (const account of list) {
      expect(Object.keys(account).sort()).toEqual(["createdAt", "disabled", "id", "name", "role"]);
    }
  });
});

describe("PUT /api/accounts/:id/pin", () => {
  it("R5/R6/R7: restablece el PIN, revoca sesiones y borra el bloqueo (vía HTTP)", async () => {
    const { req, gm, ana, anaId, fx } = await setup();
    for (let i = 0; i < 5; i += 1) {
      await req({ method: "POST", url: "/api/auth/login", body: { name: "Ana", pin: "0000" } });
    }
    const response = await req({
      method: "PUT",
      url: `/api/accounts/${anaId}/pin`,
      cookie: gm,
      body: { pin: "7777" },
    });
    expect(response.statusCode).toBe(204);
    expect((await req({ method: "GET", url: "/api/auth/me", cookie: ana })).statusCode).toBe(401);
    expect(fx.attempts.size()).toBe(0);
    const login = await req({
      method: "POST",
      url: "/api/auth/login",
      body: { name: "Ana", pin: "7777" },
    });
    expect(login.statusCode).toBe(200);
  });

  it("PIN inválido -> 400; id inexistente -> 404 (R12)", async () => {
    const { req, gm, anaId } = await setup();
    const bad = await req({
      method: "PUT",
      url: `/api/accounts/${anaId}/pin`,
      cookie: gm,
      body: { pin: "12" },
    });
    expect(bad.statusCode).toBe(400);
    const missing = await req({
      method: "PUT",
      url: "/api/accounts/no-existe/pin",
      cookie: gm,
      body: { pin: "1234" },
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual(ERROR("not_found"));
  });
});

describe("POST /api/accounts/:id/unlock", () => {
  it("R8: borra el bloqueo sin cambiar el PIN", async () => {
    const { req, gm, anaId } = await setup();
    for (let i = 0; i < 5; i += 1) {
      await req({ method: "POST", url: "/api/auth/login", body: { name: "Ana", pin: "0000" } });
    }
    const locked = await req({
      method: "POST",
      url: "/api/auth/login",
      body: { name: "Ana", pin: "2222" },
    });
    expect(locked.statusCode).toBe(429);
    const response = await req({
      method: "POST",
      url: `/api/accounts/${anaId}/unlock`,
      cookie: gm,
    });
    expect(response.statusCode).toBe(204);
    const ok = await req({
      method: "POST",
      url: "/api/auth/login",
      body: { name: "Ana", pin: "2222" },
    });
    expect(ok.statusCode).toBe(200);
  });

  it("R12: id inexistente -> 404 not_found", async () => {
    const { req, gm } = await setup();
    const response = await req({ method: "POST", url: "/api/accounts/x/unlock", cookie: gm });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual(ERROR("not_found"));
  });
});

describe("PATCH /api/accounts/:id", () => {
  it("R9/R10: deshabilita (revoca sesiones) y vuelve a habilitar", async () => {
    const { req, gm, ana, anaId } = await setup();
    const off = await req({
      method: "PATCH",
      url: `/api/accounts/${anaId}`,
      cookie: gm,
      body: { disabled: true },
    });
    expect(off.statusCode).toBe(200);
    expect(off.json()).toMatchObject({ id: anaId, disabled: true });
    expect((await req({ method: "GET", url: "/api/auth/me", cookie: ana })).statusCode).toBe(401);
    expect(
      (
        await req({
          method: "POST",
          url: "/api/auth/login",
          body: { name: "Ana", pin: "2222" },
        })
      ).statusCode,
    ).toBe(401);
    const on = await req({
      method: "PATCH",
      url: `/api/accounts/${anaId}`,
      cookie: gm,
      body: { disabled: false },
    });
    expect(on.json()).toMatchObject({ id: anaId, disabled: false });
    expect(
      (
        await req({
          method: "POST",
          url: "/api/auth/login",
          body: { name: "Ana", pin: "2222" },
        })
      ).statusCode,
    ).toBe(200);
  });

  it("R11: deshabilitar al GM -> 409 cannot_disable_gm y la cuenta no cambia", async () => {
    const { req, gm, gmId, fx } = await setup();
    const response = await req({
      method: "PATCH",
      url: `/api/accounts/${gmId}`,
      cookie: gm,
      body: { disabled: true },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual(ERROR("cannot_disable_gm"));
    expect((await fx.users.findById(gmId))?.disabled).toBe(false);
    expect((await req({ method: "GET", url: "/api/auth/me", cookie: gm })).statusCode).toBe(200);
  });

  it("body inválido -> 400; id inexistente -> 404 (R12)", async () => {
    const { req, gm, anaId } = await setup();
    for (const body of [{}, { disabled: "si" }, { disabled: 1 }]) {
      const response = await req({
        method: "PATCH",
        url: `/api/accounts/${anaId}`,
        cookie: gm,
        body,
      });
      expect(response.statusCode).toBe(400);
    }
    const missing = await req({
      method: "PATCH",
      url: "/api/accounts/no-existe",
      cookie: gm,
      body: { disabled: true },
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual(ERROR("not_found"));
  });

  it("PATCH no permite cambiar el rol ni otros campos (se ignoran)", async () => {
    const { req, gm, anaId, fx } = await setup();
    await req({
      method: "PATCH",
      url: `/api/accounts/${anaId}`,
      cookie: gm,
      body: { disabled: false, role: "gm", name: "Otro" },
    });
    const user = await fx.users.findById(anaId);
    expect(user).toMatchObject({ role: "player", name: "Ana" });
  });
});

describe("autenticación y roles en la gestión de cuentas", () => {
  const gmEndpoints = (id: string) =>
    [
      { method: "GET", url: "/api/accounts" },
      { method: "POST", url: "/api/accounts", body: { name: "Nuevo", pin: "1234" } },
      { method: "PUT", url: `/api/accounts/${id}/pin`, body: { pin: "1234" } },
      { method: "POST", url: `/api/accounts/${id}/unlock` },
      { method: "PATCH", url: `/api/accounts/${id}`, body: { disabled: true } },
    ] as const;

  it("R13: sin sesión (o con token falso) todos los endpoints dan 401 y no ejecutan nada", async () => {
    const { req, anaId, fx } = await setup();
    const before = JSON.stringify(fx.users.dump());
    for (const cookie of [undefined, "ph_session=falso"]) {
      for (const e of [...gmEndpoints(anaId), { method: "GET", url: `/api/accounts/${anaId}` }]) {
        const response = await req({ ...e, ...(cookie ? { cookie } : {}) } as Parameters<
          typeof req
        >[0]);
        expect(response.statusCode, `${e.method} ${e.url}`).toBe(401);
        expect(response.json()).toEqual(ERROR("unauthenticated"));
      }
    }
    expect(JSON.stringify(fx.users.dump())).toBe(before);
  });

  it("R14: un jugador recibe 403 forbidden en los endpoints exclusivos del GM y no se ejecutan", async () => {
    const { req, ana, anaId, betoId, fx } = await setup();
    const before = JSON.stringify(fx.users.dump());
    const sessionsBefore = fx.sessions.dump().length;
    for (const target of [anaId, betoId, "no-existe"]) {
      for (const e of gmEndpoints(target)) {
        const response = await req({ ...e, cookie: ana } as Parameters<typeof req>[0]);
        expect(response.statusCode, `${e.method} ${e.url}`).toBe(403);
        expect(response.json()).toEqual(ERROR("forbidden"));
      }
    }
    expect(JSON.stringify(fx.users.dump())).toBe(before);
    expect(fx.sessions.dump().length).toBe(sessionsBefore);
  });

  it("R14: un jugador no puede cambiar su propio PIN ni habilitarse vía /api/accounts", async () => {
    const { req, ana, anaId, fx } = await setup();
    const before = (await fx.users.findById(anaId))?.pinHash;
    const response = await req({
      method: "PUT",
      url: `/api/accounts/${anaId}/pin`,
      cookie: ana,
      body: { pin: "0000" },
    });
    expect(response.statusCode).toBe(403);
    expect((await fx.users.findById(anaId))?.pinHash).toBe(before);
  });
});

describe("GET /api/accounts/:id (política central)", () => {
  it("R63: un jugador lee su propia cuenta -> 200 {id,name,role}", async () => {
    const { req, ana, anaId } = await setup();
    const response = await req({ method: "GET", url: `/api/accounts/${anaId}`, cookie: ana });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: anaId, name: "Ana", role: "player" });
  });

  it("R64: jugador A pidiendo a jugador B recibe lo mismo que para un id inexistente", async () => {
    const { req, ana, betoId } = await setup();
    const other = await req({ method: "GET", url: `/api/accounts/${betoId}`, cookie: ana });
    const missing = await req({ method: "GET", url: "/api/accounts/no-existe", cookie: ana });
    expect(other.statusCode).toBe(404);
    expect(other.statusCode).toBe(missing.statusCode);
    expect(other.body).toBe(missing.body);
    expect(other.json()).toEqual(ERROR("not_found"));
    expect(other.body).not.toContain("Beto");
  });

  it("R64: un jugador tampoco puede leer la cuenta del GM", async () => {
    const { req, ana, gmId } = await setup();
    const response = await req({ method: "GET", url: `/api/accounts/${gmId}`, cookie: ana });
    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain("Gandalf");
  });

  it("R65: el GM lee cualquier cuenta -> 200 {id,name,role}; inexistente -> 404", async () => {
    const { req, gm, anaId, betoId, gmId } = await setup();
    for (const [id, name, role] of [
      [anaId, "Ana", "player"],
      [betoId, "Beto", "player"],
      [gmId, "Gandalf", "gm"],
    ] as const) {
      const response = await req({ method: "GET", url: `/api/accounts/${id}`, cookie: gm });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ id, name, role });
    }
    const missing = await req({ method: "GET", url: "/api/accounts/no-existe", cookie: gm });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual(ERROR("not_found"));
  });
});

describeOwnershipMatrix({
  name: "GET /api/accounts/:id (R63-R65)",
  makeApp: () => makeTestApp(),
  seed: async (ctx) => ctx.ids.a,
  request: (ctx, cookie, id) =>
    ctx.t.req({ method: "GET", url: `/api/accounts/${id}`, ...(cookie ? { cookie } : {}) }),
  secrets: ["Jugador A"],
  gmCanRead: true,
});

describe("R58: las respuestas de gestión de cuentas no incluyen PIN ni hash", () => {
  it("recorre alta, listado, lectura, reset y deshabilitar", async () => {
    const { req, gm, anaId, fx } = await setup();
    const responses = [
      await req({
        method: "POST",
        url: "/api/accounts",
        cookie: gm,
        body: { name: "Cleo", pin: "64209731" },
      }),
      await req({ method: "GET", url: "/api/accounts", cookie: gm }),
      await req({ method: "GET", url: `/api/accounts/${anaId}`, cookie: gm }),
      await req({
        method: "PUT",
        url: `/api/accounts/${anaId}/pin`,
        cookie: gm,
        body: { pin: "75310864" },
      }),
      await req({
        method: "PATCH",
        url: `/api/accounts/${anaId}`,
        cookie: gm,
        body: { disabled: true },
      }),
      await req({
        method: "POST",
        url: "/api/accounts",
        cookie: gm,
        body: { name: "Cleo", pin: "64209731" },
      }),
    ];
    const hashes = (await fx.users.list()).map((u) => u.pinHash);
    for (const response of responses) {
      const text = response.body + JSON.stringify(response.headers);
      for (const pin of ["64209731", "75310864"]) expect(text).not.toContain(pin);
      for (const hash of hashes) expect(text).not.toContain(hash.slice(0, 12));
      expect(text).not.toContain("pinHash");
    }
  });
});
