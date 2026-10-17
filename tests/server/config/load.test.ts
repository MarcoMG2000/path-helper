import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../../../src/server/config";

let dir: string;
let envFile: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "path-helper-config-"));
  envFile = join(dir, ".env");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("loadConfig", () => {
  it("R24: incorpora las variables del fichero .env", async () => {
    await writeFile(envFile, "PORT=4001\nLOG_LEVEL=debug\n# comentario\nHOST=0.0.0.0\n");
    const config = loadConfig({ env: {}, envFile });
    expect(config.PORT).toBe(4001);
    expect(config.LOG_LEVEL).toBe("debug");
    expect(config.HOST).toBe("0.0.0.0");
  });

  it("R25: el entorno del proceso gana sobre el .env", async () => {
    await writeFile(envFile, "PORT=4001\nLOG_LEVEL=debug\n");
    const config = loadConfig({ env: { PORT: "5002" }, envFile });
    expect(config.PORT).toBe(5002);
    expect(config.LOG_LEVEL).toBe("debug");
  });

  it("R25: una variable undefined en el entorno no pisa el valor del .env", async () => {
    await writeFile(envFile, "PORT=4001\n");
    const config = loadConfig({ env: { PORT: undefined }, envFile });
    expect(config.PORT).toBe(4001);
  });

  it("R26: sin fichero .env valida solo el entorno, sin error", () => {
    const config = loadConfig({ env: { PORT: "4003" }, envFile: join(dir, "no-existe.env") });
    expect(config.PORT).toBe(4003);
    expect(config.WEB_PORT).toBe(5173);
  });

  it("R27: entorno inválido lanza ConfigError que nombra las variables", async () => {
    await writeFile(envFile, "PORT=abc\n");
    let thrown: unknown;
    try {
      loadConfig({ env: { LOG_LEVEL: "verbose" }, envFile });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ConfigError);
    const error = thrown as ConfigError;
    expect(error.message).toContain("PORT");
    expect(error.message).toContain("LOG_LEVEL");
    expect(error.issues.map((issue) => issue.variable).sort()).toEqual(["LOG_LEVEL", "PORT"]);
  });

  it("R23/R27: el mensaje de ConfigError no contiene los valores recibidos", () => {
    expect(() => loadConfig({ env: { PORT: "valor-secreto" }, envFile })).toThrow(ConfigError);
    try {
      loadConfig({ env: { PORT: "valor-secreto" }, envFile });
    } catch (error) {
      expect((error as Error).message).not.toContain("valor-secreto");
    }
  });

  it("R27: un .env ilegible (p. ej. un directorio) se propaga como excepción de I/O", () => {
    expect(() => loadConfig({ env: {}, envFile: dir })).toThrow();
    try {
      loadConfig({ env: {}, envFile: dir });
    } catch (error) {
      expect(error).not.toBeInstanceOf(ConfigError);
    }
  });
});
