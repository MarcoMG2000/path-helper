import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, describe, expect, it } from "vitest";
import { runCreateGm, type CreateGmIo } from "../../../src/server/cli/create-gm";
import { makeAuthFixture, type AuthFixture } from "../../helpers/auth-fixture";

let f: AuthFixture;
let out: string[];
let errs: string[];

const ENV = {
  AUTH_PEPPER: "p".repeat(40),
  AUTH_ALLOWED_ORIGINS: "http://localhost:5173",
  DATABASE_PATH: ":memory:",
};

function io(overrides: Partial<CreateGmIo> & Pick<CreateGmIo, "argv">): CreateGmIo {
  return {
    env: ENV,
    envFile: join(tmpdir(), "path-helper-no-existe", ".env"),
    readPin: async () => "",
    out: (line) => out.push(line),
    err: (line) => errs.push(line),
    overrides: {
      stores: { users: f.users, sessions: f.sessions, attempts: f.attempts },
      clock: f.clock,
      hasher: f.hasher,
    },
    ...overrides,
  };
}

beforeEach(() => {
  f = makeAuthFixture();
  out = [];
  errs = [];
});

describe("create-gm (CLI sobre bootstrapFirstGm)", () => {
  it("R15: crea el primer GM leyendo el PIN de stdin y puede iniciar sesión", async () => {
    const code = await runCreateGm(io({ argv: ["Gandalf"], readPin: async () => "4821\n" }));
    expect(code).toBe(0);
    expect(out.join("\n")).toContain("Gandalf");
    expect((await f.users.findByNameKey("gandalf"))?.role).toBe("gm");
    expect((await f.auth.login("Gandalf", "4821")).ok).toBe(true);
  });

  it("R15: el PIN puede venir de AUTH_BOOTSTRAP_PIN y entonces no se lee stdin", async () => {
    let asked = false;
    const code = await runCreateGm(
      io({
        argv: ["Gandalf"],
        env: { ...ENV, AUTH_BOOTSTRAP_PIN: "0042" },
        readPin: async () => {
          asked = true;
          return "";
        },
      }),
    );
    expect(code).toBe(0);
    expect(asked).toBe(false);
    expect((await f.auth.login("Gandalf", "0042")).ok).toBe(true);
  });

  it("R16: si ya existe un GM sale con error y no crea nada", async () => {
    await f.accounts.bootstrapFirstGm("Gandalf", "1234");
    const code = await runCreateGm(io({ argv: ["Otro"], readPin: async () => "5678" }));
    expect(code).toBe(1);
    expect(errs.join("\n")).toContain("Ya existe una cuenta de GM");
    expect(await f.users.findByNameKey("otro")).toBeNull();
  });

  it("R17: nombre o PIN inválidos -> error, exit 1 y sin cuenta", async () => {
    expect(await runCreateGm(io({ argv: ["Gandalf"], readPin: async () => "12" }))).toBe(1);
    expect(await runCreateGm(io({ argv: ["   "], readPin: async () => "1234" }))).toBe(1);
    expect(await f.users.hasRole("gm")).toBe(false);
    expect(errs.join("\n")).toContain("no válidos");
  });

  it("sin nombre muestra el uso y sale con 2", async () => {
    const code = await runCreateGm(io({ argv: [] }));
    expect(code).toBe(2);
    expect(errs.join("\n")).toContain("Uso:");
  });

  it("configuración inválida: nombra las variables, no los valores, y no crea nada", async () => {
    const code = await runCreateGm(
      io({ argv: ["Gandalf"], env: { AUTH_PEPPER: "valor-secreto-corto" } }),
    );
    expect(code).toBe(1);
    const text = errs.join("\n");
    expect(text).toContain("AUTH_PEPPER");
    expect(text).toContain("AUTH_ALLOWED_ORIGINS");
    expect(text).not.toContain("valor-secreto");
    expect(await f.users.hasRole("gm")).toBe(false);
  });

  it("nunca imprime el PIN", async () => {
    await runCreateGm(io({ argv: ["Gandalf"], readPin: async () => "73920518" }));
    await runCreateGm(io({ argv: ["Otro"], readPin: async () => "73920518" }));
    await runCreateGm(io({ argv: ["Otro"], readPin: async () => "73920518x" }));
    expect([...out, ...errs].join("\n")).not.toContain("73920518");
  });
});
