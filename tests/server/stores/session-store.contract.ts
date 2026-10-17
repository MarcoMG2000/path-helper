import { describe, expect, it } from "vitest";
import type { Session, SessionStore } from "../../../src/server/stores/session-store";

export interface SessionStoreHarness {
  store: SessionStore;
  /** Crea la cuenta `userId` si la implementación lo exige (clave foránea en SQLite). */
  seedUser(userId: string): Promise<void>;
}

export function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    tokenHash: "t1",
    userId: "u1",
    createdAt: 1000,
    lastSeenAt: 1000,
    expiresAt: 100_000,
    ...overrides,
  };
}

// Suite de contrato compartida por todas las implementaciones de SessionStore (R87).
export function runSessionStoreContract(
  label: string,
  factory: () => SessionStoreHarness | Promise<SessionStoreHarness>,
): void {
  async function setup(...userIds: string[]): Promise<SessionStore> {
    const harness = await factory();
    for (const id of userIds) await harness.seedUser(id);
    return harness.store;
  }

  describe(`SessionStore contract: ${label}`, () => {
    it("R87: create + findByTokenHash devuelven la sesión; null si no existe", async () => {
      const store = await setup("u1");
      await store.create(makeSession());
      expect(await store.findByTokenHash("t1")).toEqual(makeSession());
      expect(await store.findByTokenHash("nope")).toBeNull();
    });

    it("R87: touch actualiza solo lastSeenAt; sobre un token inexistente no hace nada", async () => {
      const store = await setup("u1");
      await store.create(makeSession());
      await store.touch("t1", 5000);
      expect(await store.findByTokenHash("t1")).toEqual(makeSession({ lastSeenAt: 5000 }));
      await expect(store.touch("nope", 1)).resolves.toBeUndefined();
      expect(await store.findByTokenHash("nope")).toBeNull();
    });

    it("R87: delete borra solo esa sesión y es idempotente", async () => {
      const store = await setup("u1");
      await store.create(makeSession());
      await store.create(makeSession({ tokenHash: "t2" }));
      await store.delete("t1");
      await store.delete("t1");
      expect(await store.findByTokenHash("t1")).toBeNull();
      expect(await store.findByTokenHash("t2")).not.toBeNull();
    });

    it("R89: deleteAllForUser elimina todas las sesiones de ese usuario y ninguna de otro", async () => {
      const store = await setup("u1", "u2");
      await store.create(makeSession({ tokenHash: "a1", userId: "u1" }));
      await store.create(makeSession({ tokenHash: "a2", userId: "u1" }));
      await store.create(makeSession({ tokenHash: "b1", userId: "u2" }));
      await store.deleteAllForUser("u1");
      expect(await store.findByTokenHash("a1")).toBeNull();
      expect(await store.findByTokenHash("a2")).toBeNull();
      expect(await store.findByTokenHash("b1")).not.toBeNull();
    });

    it("R89: deleteAllForUser con exceptTokenHash conserva solo esa sesión", async () => {
      const store = await setup("u1", "u2");
      await store.create(makeSession({ tokenHash: "a1", userId: "u1" }));
      await store.create(makeSession({ tokenHash: "a2", userId: "u1" }));
      await store.create(makeSession({ tokenHash: "b1", userId: "u2" }));
      await store.deleteAllForUser("u1", "a2");
      expect(await store.findByTokenHash("a1")).toBeNull();
      expect(await store.findByTokenHash("a2")).not.toBeNull();
      expect(await store.findByTokenHash("b1")).not.toBeNull();
    });

    it("R89: exceptTokenHash de otro usuario no protege sesiones ajenas", async () => {
      const store = await setup("u1", "u2");
      await store.create(makeSession({ tokenHash: "a1", userId: "u1" }));
      await store.create(makeSession({ tokenHash: "b1", userId: "u2" }));
      await store.deleteAllForUser("u1", "b1");
      expect(await store.findByTokenHash("a1")).toBeNull();
      expect(await store.findByTokenHash("b1")).not.toBeNull();
    });

    it("R87: deleteExpired borra por caducidad absoluta o por inactividad y cuenta cuántas", async () => {
      const store = await setup("u1");
      await store.create(makeSession({ tokenHash: "fresh", lastSeenAt: 900, expiresAt: 5000 }));
      await store.create(makeSession({ tokenHash: "expired", lastSeenAt: 900, expiresAt: 1000 }));
      await store.create(makeSession({ tokenHash: "idle", lastSeenAt: 100, expiresAt: 5000 }));
      const removed = await store.deleteExpired(1000, 500);
      expect(removed).toBe(2);
      expect(await store.findByTokenHash("fresh")).not.toBeNull();
      expect(await store.findByTokenHash("expired")).toBeNull();
      expect(await store.findByTokenHash("idle")).toBeNull();
      expect(await store.deleteExpired(1000, 500)).toBe(0);
    });

    it("R87: las sesiones devueltas son copias", async () => {
      const store = await setup("u1");
      await store.create(makeSession());
      const found = await store.findByTokenHash("t1");
      if (!found) throw new Error("falta t1");
      found.userId = "otro";
      found.lastSeenAt = 1;
      expect(await store.findByTokenHash("t1")).toEqual(makeSession());
    });
  });
}
