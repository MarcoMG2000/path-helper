import { describe, expect, it } from "vitest";
import type {
  AttemptState,
  LoginAttemptStore,
} from "../../../src/server/stores/login-attempt-store";

export function makeAttempt(overrides: Partial<AttemptState> = {}): AttemptState {
  return {
    nameKey: "valeros",
    failures: 2,
    lockLevel: 1,
    lockedUntil: null,
    updatedAt: 1000,
    ...overrides,
  };
}

// Suite de contrato compartida por todas las implementaciones de LoginAttemptStore (R87).
export function runLoginAttemptStoreContract(
  label: string,
  factory: () => LoginAttemptStore | Promise<LoginAttemptStore>,
): void {
  describe(`LoginAttemptStore contract: ${label}`, () => {
    it("R87: get devuelve null si no hay estado", async () => {
      const store = await factory();
      expect(await store.get("nadie")).toBeNull();
    });

    it("R87: put + get conservan todos los campos, con lockedUntil null o numérico", async () => {
      const store = await factory();
      await store.put(makeAttempt());
      expect(await store.get("valeros")).toEqual(makeAttempt());
      await store.put(makeAttempt({ nameKey: "b", lockedUntil: 99_999, lockLevel: 3 }));
      expect(await store.get("b")).toEqual(
        makeAttempt({ nameKey: "b", lockedUntil: 99_999, lockLevel: 3 }),
      );
    });

    it("R87: put es un upsert por nameKey", async () => {
      const store = await factory();
      await store.put(makeAttempt());
      await store.put(makeAttempt({ failures: 4, lockedUntil: 5000, updatedAt: 2000 }));
      expect(await store.get("valeros")).toEqual(
        makeAttempt({ failures: 4, lockedUntil: 5000, updatedAt: 2000 }),
      );
    });

    it("R87: delete borra solo esa clave y es idempotente (R7, R8, R47)", async () => {
      const store = await factory();
      await store.put(makeAttempt());
      await store.put(makeAttempt({ nameKey: "otro" }));
      await store.delete("valeros");
      await store.delete("valeros");
      expect(await store.get("valeros")).toBeNull();
      expect(await store.get("otro")).not.toBeNull();
    });

    it("R50: deleteIdleBefore borra los updatedAt anteriores al corte (estricto) y cuenta cuántos", async () => {
      const store = await factory();
      await store.put(makeAttempt({ nameKey: "old", updatedAt: 100 }));
      await store.put(makeAttempt({ nameKey: "edge", updatedAt: 500 }));
      await store.put(makeAttempt({ nameKey: "new", updatedAt: 900 }));
      expect(await store.deleteIdleBefore(500)).toBe(1);
      expect(await store.get("old")).toBeNull();
      expect(await store.get("edge")).not.toBeNull();
      expect(await store.get("new")).not.toBeNull();
      expect(await store.deleteIdleBefore(500)).toBe(0);
    });

    it("R87: el estado devuelto es una copia", async () => {
      const store = await factory();
      await store.put(makeAttempt());
      const state = await store.get("valeros");
      if (!state) throw new Error("falta estado");
      state.failures = 99;
      expect((await store.get("valeros"))?.failures).toBe(2);
    });
  });
}
