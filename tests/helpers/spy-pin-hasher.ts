import { createHash } from "node:crypto";
import type { PinHasher } from "../../src/server/auth/pin-hasher";

/**
 * PinHasher determinista y rápido para tests de servicio/ruta. Cuenta las llamadas a `verify`
 * (R43, R48, R49) y no incrusta el PIN en claro en el hash.
 */
export class SpyPinHasher implements PinHasher {
  readonly verifyCalls: { pin: string; stored: string }[] = [];
  hashCalls = 0;

  constructor(private readonly delayMs = 0) {}

  private digest(pin: string): string {
    return `spy$${createHash("sha256").update(`spy-salt:${pin}`).digest("hex")}`;
  }

  async hash(pin: string): Promise<string> {
    this.hashCalls += 1;
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    return this.digest(pin);
  }

  async verify(pin: string, stored: string): Promise<boolean> {
    this.verifyCalls.push({ pin, stored });
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    return stored === this.digest(pin);
  }
}
