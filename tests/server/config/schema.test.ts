import { describe, expect, it } from "vitest";
import { ENV_KEYS, configSchema } from "../../../src/server/config/schema";
import { parseConfig } from "../../../src/server/config/load";

describe("configSchema", () => {
  it("R19: define exactamente las variables del schema", () => {
    expect([...ENV_KEYS].sort()).toEqual(["HOST", "LOG_LEVEL", "NODE_ENV", "PORT", "WEB_PORT"]);
    expect(Object.keys(configSchema.shape).sort()).toEqual([...ENV_KEYS].sort());
  });

  it("R19/R21: aplica los valores por defecto con un entorno vacío", () => {
    const result = parseConfig({});
    expect(result).toEqual({
      ok: true,
      value: {
        NODE_ENV: "development",
        HOST: "127.0.0.1",
        PORT: 3000,
        WEB_PORT: 5173,
        LOG_LEVEL: "info",
      },
    });
  });

  it("R19: acepta todos los valores válidos de NODE_ENV y LOG_LEVEL", () => {
    for (const NODE_ENV of ["development", "test", "production"]) {
      expect(parseConfig({ NODE_ENV }).ok).toBe(true);
    }
    for (const LOG_LEVEL of ["fatal", "error", "warn", "info", "debug", "trace", "silent"]) {
      expect(parseConfig({ LOG_LEVEL }).ok).toBe(true);
    }
  });

  it("R19: PORT admite 0..65535 y WEB_PORT 1..65535", () => {
    expect(parseConfig({ PORT: "0" }).ok).toBe(true);
    expect(parseConfig({ PORT: "65535" }).ok).toBe(true);
    expect(parseConfig({ WEB_PORT: "1" }).ok).toBe(true);
    expect(parseConfig({ WEB_PORT: "65535" }).ok).toBe(true);
    expect(parseConfig({ WEB_PORT: "0" }).ok).toBe(false);
    expect(parseConfig({ PORT: "65536" }).ok).toBe(false);
  });
});

describe("parseConfig", () => {
  it("R20: devuelve ok con PORT y WEB_PORT numéricos", () => {
    const result = parseConfig({
      NODE_ENV: "production",
      HOST: "0.0.0.0",
      PORT: "8080",
      WEB_PORT: "4000",
      LOG_LEVEL: "debug",
    });
    expect(result).toEqual({
      ok: true,
      value: {
        NODE_ENV: "production",
        HOST: "0.0.0.0",
        PORT: 8080,
        WEB_PORT: 4000,
        LOG_LEVEL: "debug",
      },
    });
  });

  it("R21: aplica el defecto solo a la variable ausente", () => {
    const result = parseConfig({ PORT: "4321" });
    expect(result.ok && result.value.PORT).toBe(4321);
    expect(result.ok && result.value.HOST).toBe("127.0.0.1");
  });

  it("R20: ignora variables ajenas al schema", () => {
    const result = parseConfig({ PATH: "/usr/bin", HOME: "/home/x" });
    expect(result.ok).toBe(true);
    expect(result.ok && Object.keys(result.value).sort()).toEqual([...ENV_KEYS].sort());
  });

  it("R22: lista el nombre de cada variable inválida", () => {
    const result = parseConfig({ PORT: "abc", WEB_PORT: "70000", LOG_LEVEL: "verbose" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.map((issue) => issue.variable).sort()).toEqual([
        "LOG_LEVEL",
        "PORT",
        "WEB_PORT",
      ]);
    }
  });

  it("R22: PORT=70000, NODE_ENV inválido, HOST vacío y PORT vacío son inválidos", () => {
    for (const env of [{ PORT: "70000" }, { NODE_ENV: "staging" }, { HOST: "" }, { PORT: "" }]) {
      expect(parseConfig(env).ok, JSON.stringify(env)).toBe(false);
    }
  });

  it("R22: rechaza enteros no estrictos (decimales, signo, notación científica)", () => {
    for (const PORT of ["1.5", "-1", "1e3", " 80", "0x10"]) {
      expect(parseConfig({ PORT }).ok, PORT).toBe(false);
    }
  });

  it("R23: los mensajes de error no contienen los valores recibidos", () => {
    const secrets = { PORT: "valor-secreto-1", LOG_LEVEL: "valor-secreto-2", NODE_ENV: "s3cr3t" };
    const result = parseConfig(secrets);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const text = JSON.stringify(result.error);
      for (const secret of Object.values(secrets)) {
        expect(text).not.toContain(secret);
      }
    }
  });
});
