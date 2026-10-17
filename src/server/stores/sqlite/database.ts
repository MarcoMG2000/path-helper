import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { runMigrations } from "./migrations";

export type SqliteDatabase = DatabaseSync;

/** Abre (creando el directorio si hace falta), configura y migra la base de datos. */
export function openDatabase(path: string): SqliteDatabase {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  runMigrations(db);
  return db;
}
