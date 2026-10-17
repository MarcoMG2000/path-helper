import { describe, expect, it } from "vitest";
import {
  SqliteLoginAttemptStore,
  SqliteSessionStore,
  SqliteUserStore,
  openDatabase,
} from "../../../../src/server/stores/sqlite";
import { useTempDatabases } from "../../../helpers/temp-db";
import { makeAttempt, runLoginAttemptStoreContract } from "../login-attempt-store.contract";
import { makeSession, runSessionStoreContract } from "../session-store.contract";
import { makeUser, runUserStoreContract } from "../user-store.contract";

const dbs = useTempDatabases();

// R87: las mismas suites de contrato que los fakes, contra SQLite real.
runUserStoreContract("SqliteUserStore", () => new SqliteUserStore(dbs.openMemory()));

runSessionStoreContract("SqliteSessionStore", () => {
  const db = dbs.openMemory();
  const users = new SqliteUserStore(db);
  return {
    store: new SqliteSessionStore(db),
    seedUser: async (userId) => {
      await users.create(makeUser({ id: userId, nameKey: `key-${userId}`, name: userId }));
    },
  };
});

runLoginAttemptStoreContract(
  "SqliteLoginAttemptStore",
  () => new SqliteLoginAttemptStore(dbs.openMemory()),
);

describe("SQLite: restricciones y PRAGMAs", () => {
  it("la conexión usa claves foráneas y WAL en fichero", async () => {
    const { db } = await dbs.openFile();
    expect(db.prepare("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
    expect(db.prepare("PRAGMA journal_mode").get()).toEqual({ journal_mode: "wal" });
  });

  it("R88: la restricción UNIQUE de name_key la hace cumplir la propia BD", async () => {
    const db = dbs.openMemory();
    const insert = db.prepare(
      "INSERT INTO users (id, name, name_key, role, pin_hash, disabled, created_at, updated_at) VALUES (?, ?, ?, 'player', 'h', 0, 1, 1)",
    );
    insert.run("a", "A", "k");
    expect(() => insert.run("b", "B", "k")).toThrow(/UNIQUE/);
  });

  it("una sesión de una cuenta inexistente se rechaza (clave foránea)", async () => {
    const db = dbs.openMemory();
    await expect(
      new SqliteSessionStore(db).create(makeSession({ userId: "fantasma" })),
    ).rejects.toThrow();
  });

  it("las sesiones de una cuenta se borran en cascada con la cuenta", async () => {
    const db = dbs.openMemory();
    const users = new SqliteUserStore(db);
    const sessions = new SqliteSessionStore(db);
    await users.create(makeUser());
    await sessions.create(makeSession());
    db.prepare("DELETE FROM users WHERE id = ?").run("u1");
    expect(await sessions.findByTokenHash("t1")).toBeNull();
  });

  it("las consultas son parametrizadas: un nombre malicioso se trata como dato", async () => {
    const db = dbs.openMemory();
    const users = new SqliteUserStore(db);
    const evil = "x' OR '1'='1";
    await users.create(makeUser({ id: "e", nameKey: evil, name: evil }));
    expect(await users.findByNameKey("x")).toBeNull();
    expect((await users.findByNameKey(evil))?.id).toBe("e");
    expect(await users.list()).toHaveLength(1);
  });
});

describe("SQLite: reapertura de fichero", () => {
  it("R91: cuentas, sesiones y estados de bloqueo sobreviven a cerrar y reabrir la BD", async () => {
    const { db, path } = await dbs.openFile();
    await new SqliteUserStore(db).create(makeUser({ role: "gm" }));
    await new SqliteSessionStore(db).create(makeSession());
    await new SqliteLoginAttemptStore(db).put(makeAttempt({ lockedUntil: 77_777 }));
    db.close();

    const reopened = openDatabase(path);
    try {
      expect(await new SqliteUserStore(reopened).findById("u1")).toEqual(makeUser({ role: "gm" }));
      expect(await new SqliteSessionStore(reopened).findByTokenHash("t1")).toEqual(makeSession());
      expect(await new SqliteLoginAttemptStore(reopened).get("valeros")).toEqual(
        makeAttempt({ lockedUntil: 77_777 }),
      );
    } finally {
      reopened.close();
    }
  });
});
