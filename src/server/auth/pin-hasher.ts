import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export interface PinHasher {
  hash(pin: string): Promise<string>;
  verify(pin: string, stored: string): Promise<boolean>;
}

export interface ScryptParams {
  N: number;
  r: number;
  p: number;
  keyLen: number;
  saltLen: number;
}

// Equivalente de la guía OWASP Password Storage Cheat Sheet para scrypt (N=2^15, r=8, p=3).
// Ver progress/impl_f1-auth-roles.md para el estado de la verificación contra la guía.
export const DEFAULT_SCRYPT_PARAMS: ScryptParams = {
  N: 32768,
  r: 8,
  p: 3,
  keyLen: 32,
  saltLen: 16,
};

const FORMAT_PREFIX = "scrypt$v1";
// Cotas de cordura al leer un hash almacenado: evitan que un registro corrupto fuerce
// una derivación de memoria o tiempo descomunales.
const MAX_N = 2 ** 20;
const MAX_R = 32;
const MAX_P = 16;
const MAX_KEY_LEN = 128;

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function scryptAsync(
  password: Buffer,
  salt: Buffer,
  keyLen: number,
  N: number,
  r: number,
  p: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // maxmem explícito: el límite por defecto de Node (32 MiB) rechaza N=32768 con r=8.
    scrypt(password, salt, keyLen, { N, r, p, maxmem: 256 * N * r }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export class ScryptPinHasher implements PinHasher {
  constructor(
    private readonly pepper: string,
    private readonly params: ScryptParams = DEFAULT_SCRYPT_PARAMS,
  ) {}

  // R54: scrypt recibe HMAC-SHA256(pepper, pin), no el PIN directamente.
  private prehash(pin: string): Buffer {
    return createHmac("sha256", this.pepper).update(pin, "utf8").digest();
  }

  async hash(pin: string): Promise<string> {
    const { N, r, p, keyLen, saltLen } = this.params;
    const salt = randomBytes(saltLen);
    const key = await scryptAsync(this.prehash(pin), salt, keyLen, N, r, p);
    return [FORMAT_PREFIX, N, r, p, salt.toString("base64"), key.toString("base64")].join("$");
  }

  async verify(pin: string, stored: string): Promise<boolean> {
    const parsed = parseStoredHash(stored);
    if (!parsed) return false;
    try {
      const candidate = await scryptAsync(
        this.prehash(pin),
        parsed.salt,
        parsed.key.length,
        parsed.N,
        parsed.r,
        parsed.p,
      );
      return timingSafeEqual(candidate, parsed.key);
    } catch {
      // Parámetros que scrypt rechaza (p. ej. N no potencia de 2): hash inutilizable.
      return false;
    }
  }
}

interface ParsedHash {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  key: Buffer;
}

function parsePositiveInt(text: string | undefined): number | null {
  if (text === undefined || !/^[1-9]\d{0,9}$/.test(text)) return null;
  return Number(text);
}

function parseStoredHash(stored: string): ParsedHash | null {
  if (typeof stored !== "string") return null;
  const parts = stored.split("$");
  if (parts.length !== 7 || `${parts[0]}$${parts[1]}` !== FORMAT_PREFIX) return null;
  const N = parsePositiveInt(parts[2]);
  const r = parsePositiveInt(parts[3]);
  const p = parsePositiveInt(parts[4]);
  const saltText = parts[5];
  const keyText = parts[6];
  if (N === null || r === null || p === null) return null;
  if (N < 2 || N > MAX_N || (N & (N - 1)) !== 0 || r > MAX_R || p > MAX_P) return null;
  if (!saltText || !keyText || !BASE64.test(saltText) || !BASE64.test(keyText)) return null;
  const salt = Buffer.from(saltText, "base64");
  const key = Buffer.from(keyText, "base64");
  if (salt.length === 0 || key.length === 0 || key.length > MAX_KEY_LEN) return null;
  return { N, r, p, salt, key };
}
