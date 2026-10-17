import type { DatabaseSync } from "node:sqlite";

export interface Migration {
  id: number;
  name: string;
  sql: string;
}

// Las features siguientes AÑADEN migraciones al final; nunca se edita una ya publicada.
export const MIGRATIONS: readonly Migration[] = [
  {
    id: 1,
    name: "001_auth",
    sql: `
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        name_key TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL CHECK (role IN ('player','gm')),
        pin_hash TEXT NOT NULL,
        disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0,1)),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX sessions_user_id ON sessions(user_id);
      CREATE TABLE login_attempts (
        name_key TEXT PRIMARY KEY,
        failures INTEGER NOT NULL,
        lock_level INTEGER NOT NULL,
        locked_until INTEGER,
        updated_at INTEGER NOT NULL
      );
    `,
  },
];

/** Aplica las migraciones pendientes, cada una en su transacción. Idempotente (R90). */
export function runMigrations(
  db: DatabaseSync,
  migrations: readonly Migration[] = MIGRATIONS,
): void {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)",
  );
  const applied = new Set(
    (db.prepare("SELECT id FROM schema_migrations").all() as unknown as { id: number }[]).map(
      (r) => r.id,
    ),
  );
  const record = db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)");
  for (const migration of [...migrations].sort((a, b) => a.id - b.id)) {
    if (applied.has(migration.id)) continue;
    db.exec("BEGIN");
    try {
      db.exec(migration.sql);
      record.run(migration.id, Date.now());
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}
