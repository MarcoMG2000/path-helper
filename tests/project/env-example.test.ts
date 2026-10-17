import { parseEnv } from "node:util";
import { describe, expect, it } from "vitest";
import { AUTH_ENV_KEYS } from "../../src/server/auth/config";
import { ENV_KEYS, parseConfig } from "../../src/server/config";
import { DATABASE_ENV_KEYS } from "../../src/server/stores/sqlite/database-config";
import { readRepoFile } from "./helpers";

describe(".env.example y .gitignore", () => {
  const example = parseEnv(readRepoFile(".env.example"));

  // f1 amplía .env.example con las claves AUTH_* y DATABASE_PATH (cada una con su propio schema).
  it("R28: contiene exactamente las claves de los schemas de configuración", () => {
    const all = [...ENV_KEYS, ...DATABASE_ENV_KEYS, ...AUTH_ENV_KEYS];
    expect(Object.keys(example).sort()).toEqual(all.sort());
  });

  it("R28: cada clave tiene su valor por defecto", () => {
    const defaults = parseConfig({});
    expect(defaults.ok).toBe(true);
    if (defaults.ok) {
      const expected = Object.fromEntries(
        Object.entries(defaults.value).map(([key, value]) => [key, String(value)]),
      );
      expect(Object.fromEntries(Object.entries(example).filter(([k]) => k in expected))).toEqual(
        expected,
      );
    }
  });

  it("R29: .gitignore ignora .env y no ignora .env.example", () => {
    const lines = readRepoFile(".gitignore")
      .split(/\r?\n/)
      .map((line) => line.trim());
    expect(lines).toContain(".env");
    expect(lines).not.toContain(".env.example");
    expect(lines).not.toContain(".env*");
  });
});
