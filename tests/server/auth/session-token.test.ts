import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateSessionToken, hashSessionToken } from "../../../src/server/auth/session-token";

describe("generateSessionToken", () => {
  it("R27: decodifica a exactamente 32 bytes y es base64url", () => {
    const token = generateSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(token).toHaveLength(43);
  });

  it("R27: cada token es distinto", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateSessionToken()));
    expect(tokens.size).toBe(200);
  });
});

describe("hashSessionToken", () => {
  it("R28: es el SHA-256 en hexadecimal del token", () => {
    const token = generateSessionToken();
    const hash = hashSessionToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(hash).not.toContain(token);
  });

  it("R28: es determinista y distinto para tokens distintos", () => {
    expect(hashSessionToken("a")).toBe(hashSessionToken("a"));
    expect(hashSessionToken("a")).not.toBe(hashSessionToken("b"));
  });
});
