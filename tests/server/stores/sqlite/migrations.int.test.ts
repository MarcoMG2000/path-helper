import { describe, expect, it } from "vitest";
import { MIGRATIONS, openDatabase, runMigrations } from "../../../../src/server/stores/sqlite";
import { useTempDatabases } from "../../../helpers/temp-db";

const dbs = useTempDatabases();

function schemaSnapshot(db: ReturnType<typeof dbs.openMemory>): unknown[] {
  return db.prepare("SELECT type, name, sql FROM sqlite_master ORDER BY type, name").all();
}

describe("runMigrations", () => {
  it("crea las tablas de auth y registra la migración 001", () => {
    const db = dbs.openMemory();
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
    ).map((row) => row.name);
    expect(tables).toEqual(
      expect.arrayContaining(["users", "sessions", "login_attempts", "schema_migrations"]),
    );
    expect(db.prepare("SELECT id FROM schema_migrations").all()).toEqual([{ id: 1 }]);
  });

  it("R90: aplicarlas sobre una base ya migrada la deja sin cambios", () => {
    const db = dbs.openMemory();
    db.prepare(
      "INSERT INTO users (id, name, name_key, role, pin_hash, disabled, created_at, updated_at) VALUES ('a','A','a','player','h',0,1,1)",
    ).run();
    const before = schemaSnapshot(db);
    const applied = db.prepare("SELECT * FROM schema_migrations").all();
    runMigrations(db);
    runMigrations(db);
    expect(schemaSnapshot(db)).toEqual(before);
    expect(db.prepare("SELECT * FROM schema_migrations").all()).toEqual(applied);
    expect(db.prepare("SELECT COUNT(*) AS n FROM users").get()).toEqual({ n: 1 });
  });

  it("R90: reabrir un fichero ya migrado no reaplica migraciones ni pierde datos", async () => {
    const { db, path } = await dbs.openFile();
    db.prepare(
      "INSERT INTO users (id, name, name_key, role, pin_hash, disabled, created_at, updated_at) VALUES ('a','A','a','gm','h',0,1,1)",
    ).run();
    db.close();
    const again = openDatabase(path);
    try {
      expect(again.prepare("SELECT COUNT(*) AS n FROM users").get()).toEqual({ n: 1 });
      expect(again.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get()).toEqual({ n: 1 });
    } finally {
      again.close();
    }
  });

  it("aplica solo las migraciones nuevas y en orden de id", () => {
    const db = dbs.openMemory();
    const extra = [
      ...MIGRATIONS,
      { id: 3, name: "003_c", sql: "CREATE TABLE c (id INTEGER)" },
      { id: 2, name: "002_b", sql: "CREATE TABLE b (id INTEGER)" },
    ];
    runMigrations(db, extra);
    expect(db.prepare("SELECT id FROM schema_migrations ORDER BY id").all()).toEqual([
      { id: 1 },
      { id: 2 },
      { id: 3 },
    ]);
  });

  it("una migración que falla se revierte entera y no queda registrada", () => {
    const db = dbs.openMemory();
    const broken = [
      ...MIGRATIONS,
      {
        id: 2,
        name: "002_rota",
        sql: "CREATE TABLE ok_t (id INTEGER); CREATE TABLE ok_t (id INTEGER);",
      },
    ];
    expect(() => runMigrations(db, broken)).toThrow();
    expect(db.prepare("SELECT id FROM schema_migrations ORDER BY id").all()).toEqual([{ id: 1 }]);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'ok_t'").get()).toBeUndefined();
  });
});
