import type { AttemptState, LoginAttemptStore } from "../login-attempt-store";
import type { SqliteDatabase } from "./database";

interface AttemptRow {
  name_key: string;
  failures: number;
  lock_level: number;
  locked_until: number | null;
  updated_at: number;
}

export class SqliteLoginAttemptStore implements LoginAttemptStore {
  constructor(private readonly db: SqliteDatabase) {}

  async get(nameKey: string): Promise<AttemptState | null> {
    const row = this.db
      .prepare("SELECT * FROM login_attempts WHERE name_key = ?")
      .get(nameKey) as unknown as AttemptRow | undefined;
    if (!row) return null;
    return {
      nameKey: row.name_key,
      failures: row.failures,
      lockLevel: row.lock_level,
      lockedUntil: row.locked_until,
      updatedAt: row.updated_at,
    };
  }

  async put(state: AttemptState): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO login_attempts (name_key, failures, lock_level, locked_until, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(name_key) DO UPDATE SET
           failures = excluded.failures,
           lock_level = excluded.lock_level,
           locked_until = excluded.locked_until,
           updated_at = excluded.updated_at`,
      )
      .run(state.nameKey, state.failures, state.lockLevel, state.lockedUntil, state.updatedAt);
  }

  async delete(nameKey: string): Promise<void> {
    this.db.prepare("DELETE FROM login_attempts WHERE name_key = ?").run(nameKey);
  }

  async deleteIdleBefore(updatedAtCutoff: number): Promise<number> {
    const result = this.db
      .prepare("DELETE FROM login_attempts WHERE updated_at < ?")
      .run(updatedAtCutoff);
    return Number(result.changes);
  }
}
