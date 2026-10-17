import { createHmac, scryptSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCRYPT_PARAMS,
  ScryptPinHasher,
  type ScryptParams,
} from "../../../src/server/auth/pin-hasher";

const PEPPER = "x".repeat(32);
const FAST: ScryptParams = { N: 16, r: 8, p: 1, keyLen: 32, saltLen: 16 };

describe("ScryptPinHasher", () => {
  it("R51: las constantes de producción son N=32768, r=8, p=3, clave 32 B, sal 16 B", () => {
    expect(DEFAULT_SCRYPT_PARAMS).toEqual({ N: 32768, r: 8, p: 3, keyLen: 32, saltLen: 16 });
  });

  it("R51/R53: con los parámetros por defecto produce scrypt$v1$32768$8$3$<sal 16 B>$<clave 32 B>", async () => {
    const stored = await new ScryptPinHasher(PEPPER).hash("1234");
    const parts = stored.split("$");
    expect(parts.slice(0, 5)).toEqual(["scrypt", "v1", "32768", "8", "3"]);
    expect(Buffer.from(parts[5] ?? "", "base64")).toHaveLength(16);
    expect(Buffer.from(parts[6] ?? "", "base64")).toHaveLength(32);
  });

  it("R51/R54: la clave es scrypt(HMAC-SHA256(pepper, pin), sal) calculada de forma independiente", async () => {
    const stored = await new ScryptPinHasher(PEPPER, FAST).hash("0042");
    const [, , N, r, p, salt, key] = stored.split("$");
    const prehash = createHmac("sha256", PEPPER).update("0042").digest();
    const expected = scryptSync(prehash, Buffer.from(salt ?? "", "base64"), 32, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    });
    expect(Buffer.from(key ?? "", "base64").equals(expected)).toBe(true);
  });

  it("R52: dos hashes del mismo PIN son distintos (sal aleatoria) y ambos verifican", async () => {
    const hasher = new ScryptPinHasher(PEPPER, FAST);
    const a = await hasher.hash("1234");
    const b = await hasher.hash("1234");
    expect(a).not.toBe(b);
    expect(await hasher.verify("1234", a)).toBe(true);
    expect(await hasher.verify("1234", b)).toBe(true);
  });

  it("R53: verify usa los parámetros del hash almacenado, no los del hasher", async () => {
    const writer = new ScryptPinHasher(PEPPER, { N: 16, r: 8, p: 2, keyLen: 24, saltLen: 8 });
    const reader = new ScryptPinHasher(PEPPER, { N: 64, r: 4, p: 1, keyLen: 32, saltLen: 16 });
    const stored = await writer.hash("5678");
    expect(stored).toContain("$16$8$2$");
    expect(await reader.verify("5678", stored)).toBe(true);
    expect(await reader.verify("5679", stored)).toBe(false);
  });

  it("R54: un hash verificado con otro pepper es rechazado", async () => {
    const stored = await new ScryptPinHasher(PEPPER, FAST).hash("1234");
    expect(await new ScryptPinHasher("y".repeat(32), FAST).verify("1234", stored)).toBe(false);
  });

  it("R55: PIN correcto -> true; incorrecto -> false (incluye ceros a la izquierda)", async () => {
    const hasher = new ScryptPinHasher(PEPPER, FAST);
    const stored = await hasher.hash("0042");
    expect(await hasher.verify("0042", stored)).toBe(true);
    expect(await hasher.verify("42", stored)).toBe(false);
    expect(await hasher.verify("0043", stored)).toBe(false);
    expect(await hasher.verify("", stored)).toBe(false);
  });

  it("R56: un hash almacenado con formato inválido da false sin lanzar", async () => {
    const hasher = new ScryptPinHasher(PEPPER, FAST);
    const good = await hasher.hash("1234");
    const parts = good.split("$");
    const variants = [
      "",
      "garbage",
      "$$$$$$",
      "bcrypt$v1$16$8$1$AAAA$AAAA",
      good.replace("v1", "v2"),
      parts.slice(0, 6).join("$"),
      `${good}$extra`,
      [...parts.slice(0, 2), "abc", ...parts.slice(3)].join("$"),
      [...parts.slice(0, 2), "17", ...parts.slice(3)].join("$"), // N no potencia de 2
      [...parts.slice(0, 2), "0", ...parts.slice(3)].join("$"),
      [...parts.slice(0, 2), "-16", ...parts.slice(3)].join("$"),
      [...parts.slice(0, 2), "4294967296", ...parts.slice(3)].join("$"), // N desorbitado
      [...parts.slice(0, 3), "1000", ...parts.slice(4)].join("$"), // r desorbitado
      [...parts.slice(0, 4), "1000", ...parts.slice(5)].join("$"), // p desorbitado
      [...parts.slice(0, 5), "!!!", parts[6]].join("$"),
      [...parts.slice(0, 6), "!!!"].join("$"),
      [...parts.slice(0, 5), "", parts[6]].join("$"),
      [...parts.slice(0, 6), ""].join("$"),
    ];
    for (const stored of variants) {
      await expect(hasher.verify("1234", stored), stored).resolves.toBe(false);
    }
    await expect(hasher.verify("1234", undefined as unknown as string)).resolves.toBe(false);
  });

  it("R51: scrypt con N=32768 y r=8 no falla por maxmem (límite por defecto de Node)", async () => {
    const hasher = new ScryptPinHasher(PEPPER, { ...DEFAULT_SCRYPT_PARAMS, p: 1 });
    const stored = await hasher.hash("1234");
    expect(await hasher.verify("1234", stored)).toBe(true);
  });
});
