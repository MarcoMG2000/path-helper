import { describe, expect, it } from "vitest";
import type { User, UserStore } from "../../../src/server/stores/user-store";

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "u1",
    name: "Valeros",
    nameKey: "valeros",
    role: "player",
    pinHash: "hash-1",
    disabled: false,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

// Suite de contrato compartida por todas las implementaciones de UserStore (R87).
export function runUserStoreContract(
  label: string,
  factory: () => UserStore | Promise<UserStore>,
): void {
  describe(`UserStore contract: ${label}`, () => {
    it("R87: create devuelve ok con la cuenta y findById/findByNameKey la recuperan", async () => {
      const store = await factory();
      const created = await store.create(makeUser());
      expect(created).toEqual({ ok: true, value: makeUser() });
      expect(await store.findById("u1")).toEqual(makeUser());
      expect(await store.findByNameKey("valeros")).toEqual(makeUser());
    });

    it("R87: findById / findByNameKey devuelven null si no existe", async () => {
      const store = await factory();
      expect(await store.findById("nope")).toBeNull();
      expect(await store.findByNameKey("nope")).toBeNull();
    });

    it("R88: create con una nameKey ya existente devuelve name_taken sin lanzar ni modificar", async () => {
      const store = await factory();
      await store.create(makeUser());
      const dup = await store.create(
        makeUser({ id: "u2", name: "VALEROS", pinHash: "otro", role: "gm" }),
      );
      expect(dup).toEqual({ ok: false, error: "name_taken" });
      expect(await store.findById("u2")).toBeNull();
      expect(await store.findById("u1")).toEqual(makeUser());
      expect(await store.list()).toHaveLength(1);
    });

    it("R88: la unicidad es por nameKey exacta (claves distintas conviven)", async () => {
      const store = await factory();
      expect((await store.create(makeUser())).ok).toBe(true);
      expect((await store.create(makeUser({ id: "u2", nameKey: "valeros2" }))).ok).toBe(true);
    });

    it("R87: list ordena por createdAt y luego por id", async () => {
      const store = await factory();
      await store.create(makeUser({ id: "c", nameKey: "c", createdAt: 30 }));
      await store.create(makeUser({ id: "b", nameKey: "b", createdAt: 10 }));
      await store.create(makeUser({ id: "a", nameKey: "a", createdAt: 10 }));
      expect((await store.list()).map((user) => user.id)).toEqual(["a", "b", "c"]);
    });

    it("R87: update cambia pinHash y/o disabled y updatedAt, y devuelve la cuenta actualizada", async () => {
      const store = await factory();
      await store.create(makeUser());
      const updated = await store.update("u1", { pinHash: "nuevo" }, 2000);
      expect(updated).toEqual(makeUser({ pinHash: "nuevo", updatedAt: 2000 }));
      const disabled = await store.update("u1", { disabled: true }, 3000);
      expect(disabled).toEqual(makeUser({ pinHash: "nuevo", disabled: true, updatedAt: 3000 }));
      const both = await store.update("u1", { disabled: false, pinHash: "z" }, 4000);
      expect(both).toEqual(makeUser({ pinHash: "z", disabled: false, updatedAt: 4000 }));
      expect(await store.findById("u1")).toEqual(both);
    });

    it("R87: update de un id inexistente devuelve null y no crea nada", async () => {
      const store = await factory();
      expect(await store.update("nope", { disabled: true }, 1)).toBeNull();
      expect(await store.list()).toEqual([]);
    });

    it("R87: update no altera nameKey, rol ni createdAt", async () => {
      const store = await factory();
      await store.create(makeUser({ role: "gm" }));
      const updated = await store.update("u1", { disabled: true }, 9);
      expect(updated).toMatchObject({ nameKey: "valeros", role: "gm", createdAt: 1000 });
    });

    it("R87: hasRole distingue roles presentes y ausentes", async () => {
      const store = await factory();
      expect(await store.hasRole("gm")).toBe(false);
      await store.create(makeUser());
      expect(await store.hasRole("player")).toBe(true);
      expect(await store.hasRole("gm")).toBe(false);
      await store.create(makeUser({ id: "g", nameKey: "g", role: "gm" }));
      expect(await store.hasRole("gm")).toBe(true);
    });

    it("R87: las cuentas devueltas son copias (mutarlas no cambia el store)", async () => {
      const store = await factory();
      await store.create(makeUser());
      const found = await store.findById("u1");
      if (!found) throw new Error("falta u1");
      found.pinHash = "mutado";
      found.disabled = true;
      expect(await store.findById("u1")).toEqual(makeUser());
    });
  });
}
