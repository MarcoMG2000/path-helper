import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";
import { openDatabase, type SqliteDatabase } from "../../src/server/stores/sqlite";

/**
 * Registra un afterEach que cierra las bases abiertas y borra el directorio temporal.
 * Devuelve helpers para abrir bases (en fichero temporal o en memoria).
 */
export function useTempDatabases(): {
  dir: () => Promise<string>;
  openFile: (name?: string) => Promise<{ db: SqliteDatabase; path: string }>;
  openMemory: () => SqliteDatabase;
} {
  const dbs: SqliteDatabase[] = [];
  const dirs: string[] = [];

  afterEach(async () => {
    for (const db of dbs.splice(0)) if (db.isOpen) db.close();
    for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
  });

  const dir = async (): Promise<string> => {
    const created = await mkdtemp(join(tmpdir(), "path-helper-db-"));
    dirs.push(created);
    return created;
  };

  return {
    dir,
    openFile: async (name = "test.sqlite") => {
      const path = join(await dir(), name);
      const db = openDatabase(path);
      dbs.push(db);
      return { db, path };
    },
    openMemory: () => {
      const db = openDatabase(":memory:");
      dbs.push(db);
      return db;
    },
  };
}
