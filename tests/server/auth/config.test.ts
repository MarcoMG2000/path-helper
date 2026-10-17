import { parseEnv } from "node:util";
import { describe, expect, it } from "vitest";
import { AUTH_ENV_KEYS, parseAuthConfig } from "../../../src/server/auth/config";
import { readRepoFile } from "../../project/helpers";

const PEPPER = "p".repeat(32);
const valid = { AUTH_PEPPER: PEPPER, AUTH_ALLOWED_ORIGINS: "http://localhost:5173" };

describe("parseAuthConfig", () => {
  it("R60: con un entorno válido devuelve ok con los valores por defecto", () => {
    const result = parseAuthConfig(valid);
    expect(result).toEqual({
      ok: true,
      value: {
        pepper: PEPPER,
        cookieSecure: true,
        cookieName: "ph_session",
        allowedOrigins: ["http://localhost:5173"],
        sessionIdleTtlMs: 7 * 86_400_000,
        sessionAbsoluteTtlMs: 30 * 86_400_000,
        sessionTouchIntervalMs: 60_000,
        lockout: {
          maxFailures: 5,
          baseLockMs: 15 * 60_000,
          maxLockMs: 24 * 3_600_000,
          idleResetMs: 48 * 3_600_000,
        },
      },
    });
  });

  it("R60: expone las claves AUTH_* esperadas", () => {
    expect([...AUTH_ENV_KEYS].sort()).toEqual([
      "AUTH_ALLOWED_ORIGINS",
      "AUTH_COOKIE_SECURE",
      "AUTH_LOCK_BASE_MINUTES",
      "AUTH_LOCK_MAX_FAILURES",
      "AUTH_LOCK_MAX_HOURS",
      "AUTH_PEPPER",
      "AUTH_SESSION_ABSOLUTE_DAYS",
      "AUTH_SESSION_IDLE_DAYS",
    ]);
  });

  it("R60: respeta las sobrescrituras (cookie no segura, TTL y bloqueo, varios orígenes)", () => {
    const result = parseAuthConfig({
      ...valid,
      AUTH_COOKIE_SECURE: "false",
      AUTH_ALLOWED_ORIGINS: "http://localhost:5173, https://app.example.com",
      AUTH_SESSION_IDLE_DAYS: "1",
      AUTH_SESSION_ABSOLUTE_DAYS: "2",
      AUTH_LOCK_MAX_FAILURES: "3",
      AUTH_LOCK_BASE_MINUTES: "1",
      AUTH_LOCK_MAX_HOURS: "2",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.cookieSecure).toBe(false);
    expect(result.value.allowedOrigins).toEqual([
      "http://localhost:5173",
      "https://app.example.com",
    ]);
    expect(result.value.sessionIdleTtlMs).toBe(86_400_000);
    expect(result.value.sessionAbsoluteTtlMs).toBe(2 * 86_400_000);
    expect(result.value.lockout).toMatchObject({
      maxFailures: 3,
      baseLockMs: 60_000,
      maxLockMs: 2 * 3_600_000,
    });
  });

  function failedVariables(env: Record<string, string | undefined>): string[] {
    const result = parseAuthConfig(env);
    expect(result.ok).toBe(false);
    return result.ok ? [] : result.error.map((issue) => issue.variable);
  }

  it("R61: AUTH_PEPPER ausente o corta es un error que la nombra", () => {
    expect(failedVariables({ AUTH_ALLOWED_ORIGINS: valid.AUTH_ALLOWED_ORIGINS })).toEqual([
      "AUTH_PEPPER",
    ]);
    expect(failedVariables({ ...valid, AUTH_PEPPER: "p".repeat(31) })).toEqual(["AUTH_PEPPER"]);
    expect(parseAuthConfig({ ...valid, AUTH_PEPPER: "p".repeat(32) }).ok).toBe(true);
  });

  // Review M-1 de f1: el pepper de ejemplo (público en el repo) no puede usarse en producción.
  it("R61 (review M-1): en producción se rechaza un AUTH_PEPPER con change-me, sin distinguir mayúsculas", () => {
    const placeholders = [
      "change-me-this-is-not-a-secret-change-me",
      "CHANGE-ME-this-is-not-a-secret-change-me",
      "x".repeat(20) + "Change-Me" + "y".repeat(20),
      parseEnv(readRepoFile(".env.example"))["AUTH_PEPPER"] ?? "",
    ];
    for (const pepper of placeholders) {
      expect(pepper.length).toBeGreaterThanOrEqual(32);
      const result = parseAuthConfig({ ...valid, NODE_ENV: "production", AUTH_PEPPER: pepper });
      expect(result.ok, pepper).toBe(false);
      if (result.ok) continue;
      expect(result.error.map((issue) => issue.variable)).toEqual(["AUTH_PEPPER"]);
      expect(JSON.stringify(result.error)).not.toContain(pepper);
    }
  });

  it("R61 (review M-1): en producción un pepper aleatorio sigue siendo válido", () => {
    const result = parseAuthConfig({ ...valid, NODE_ENV: "production" });
    expect(result.ok).toBe(true);
  });

  it("R61 (review M-1): en desarrollo, test o sin NODE_ENV el marcador de ejemplo sigue permitido", () => {
    const pepper = parseEnv(readRepoFile(".env.example"))["AUTH_PEPPER"] ?? "";
    for (const nodeEnv of ["development", "test", undefined]) {
      const env: Record<string, string | undefined> = { ...valid, AUTH_PEPPER: pepper };
      if (nodeEnv) env["NODE_ENV"] = nodeEnv;
      expect(parseAuthConfig(env).ok, String(nodeEnv)).toBe(true);
    }
  });

  // Review B-1 de f1: el estado de bloqueo no puede olvidarse antes de que el bloqueo termine.
  it("R50 (review B-1): idleResetMs nunca es menor que la duración máxima de bloqueo", () => {
    const lockout = (hours?: string) => {
      const result = parseAuthConfig(hours ? { ...valid, AUTH_LOCK_MAX_HOURS: hours } : valid);
      if (!result.ok) throw new Error("config inválida");
      return result.value.lockout;
    };
    expect(lockout("100").idleResetMs).toBe(100 * 3_600_000);
    expect(lockout("100").idleResetMs).toBeGreaterThanOrEqual(lockout("100").maxLockMs);
    expect(lockout("9999").idleResetMs).toBe(9999 * 3_600_000);
    // Con máximos pequeños o por defecto se conserva el mínimo de 48 h.
    expect(lockout("2").idleResetMs).toBe(48 * 3_600_000);
    expect(lockout().idleResetMs).toBe(48 * 3_600_000);
  });

  it("R61: AUTH_ALLOWED_ORIGINS ausente, vacío o con entradas que no son orígenes", () => {
    const bad = [
      undefined,
      "",
      " ",
      ",",
      "http://a.com,",
      "localhost:5173",
      "ftp://a.com",
      "http://a.com/ruta",
      "http://a.com/",
      "http://a.com?x=1",
      "http://user@a.com",
      "http://a.com:80",
      "http://LOCALHOST",
      "http://localhost:5173,nope",
    ];
    for (const value of bad) {
      const env: Record<string, string | undefined> = { AUTH_PEPPER: PEPPER };
      if (value !== undefined) env["AUTH_ALLOWED_ORIGINS"] = value;
      expect(failedVariables(env), String(value)).toEqual(["AUTH_ALLOWED_ORIGINS"]);
    }
  });

  it("R61: valores numéricos o booleanos inválidos nombran su variable", () => {
    expect(failedVariables({ ...valid, AUTH_COOKIE_SECURE: "yes" })).toEqual([
      "AUTH_COOKIE_SECURE",
    ]);
    for (const key of [
      "AUTH_SESSION_IDLE_DAYS",
      "AUTH_SESSION_ABSOLUTE_DAYS",
      "AUTH_LOCK_MAX_FAILURES",
      "AUTH_LOCK_BASE_MINUTES",
      "AUTH_LOCK_MAX_HOURS",
    ]) {
      for (const value of ["0", "-1", "1.5", "abc", "", "1e3"]) {
        expect(failedVariables({ ...valid, [key]: value }), `${key}=${value}`).toEqual([key]);
      }
    }
  });

  it("R61: los errores nunca incluyen el valor recibido", () => {
    const result = parseAuthConfig({
      AUTH_PEPPER: "valor-secreto-corto",
      AUTH_ALLOWED_ORIGINS: "http://valor-secreto.com/ruta",
      AUTH_COOKIE_SECURE: "valor-secreto",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.map((issue) => issue.variable).sort()).toEqual([
      "AUTH_ALLOWED_ORIGINS",
      "AUTH_COOKIE_SECURE",
      "AUTH_PEPPER",
    ]);
    expect(JSON.stringify(result.error)).not.toContain("secreto");
  });
});
