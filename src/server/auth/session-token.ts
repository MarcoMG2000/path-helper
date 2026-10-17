import { createHash, randomBytes } from "node:crypto";

/** R27: 32 bytes aleatorios del CSPRNG de Node, en base64url. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** R28: en el store solo se guarda el SHA-256 (hex) del token. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
