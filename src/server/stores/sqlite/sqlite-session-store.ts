import type { Session, SessionStore } from "../session-store";
import type { SqliteDatabase } from "./database";

interface SessionRow {
  token_hash: string;
  user_id: string;
  created_at: number;
  last_seen_at: number;
  expires_at: number;
}

export class SqliteSessionStore implements SessionStore {
  constructor(private readonly db: SqliteDatabase) {}

  async create(session: Session): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        session.tokenHash,
        session.userId,
        session.createdAt,
        session.lastSeenAt,
        session.expiresAt,
      );
  }

  async findByTokenHash(tokenHash: string): Promise<Session | null> {
    const row = this.db
      .prepare("SELECT * FROM sessions WHERE token_hash = ?")
      .get(tokenHash) as unknown as SessionRow | undefined;
    if (!row) return null;
    return {
      tokenHash: row.token_hash,
      userId: row.user_id,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      expiresAt: row.expires_at,
    };
  }

  async touch(tokenHash: string, lastSeenAt: number): Promise<void> {
    this.db
      .prepare("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?")
      .run(lastSeenAt, tokenHash);
  }

  async delete(tokenHash: string): Promise<void> {
    this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
  }

  async deleteAllForUser(userId: string, exceptTokenHash?: string): Promise<void> {
    if (exceptTokenHash === undefined) {
      this.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
    } else {
      this.db
        .prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?")
        .run(userId, exceptTokenHash);
    }
  }

  async deleteExpired(now: number, idleCutoff: number): Promise<number> {
    const result = this.db
      .prepare("DELETE FROM sessions WHERE expires_at <= ? OR last_seen_at <= ?")
      .run(now, idleCutoff);
    return Number(result.changes);
  }
}
