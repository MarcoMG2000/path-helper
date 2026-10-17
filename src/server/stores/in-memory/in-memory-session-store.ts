import type { Session, SessionStore } from "../session-store";

export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, Session>();

  async create(session: Session): Promise<void> {
    this.sessions.set(session.tokenHash, { ...session });
  }

  async findByTokenHash(tokenHash: string): Promise<Session | null> {
    const session = this.sessions.get(tokenHash);
    return session ? { ...session } : null;
  }

  async touch(tokenHash: string, lastSeenAt: number): Promise<void> {
    const session = this.sessions.get(tokenHash);
    if (session) session.lastSeenAt = lastSeenAt;
  }

  async delete(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
  }

  async deleteAllForUser(userId: string, exceptTokenHash?: string): Promise<void> {
    for (const [tokenHash, session] of this.sessions) {
      if (session.userId === userId && tokenHash !== exceptTokenHash) {
        this.sessions.delete(tokenHash);
      }
    }
  }

  async deleteExpired(now: number, idleCutoff: number): Promise<number> {
    let removed = 0;
    for (const [tokenHash, session] of this.sessions) {
      if (session.expiresAt <= now || session.lastSeenAt <= idleCutoff) {
        this.sessions.delete(tokenHash);
        removed += 1;
      }
    }
    return removed;
  }

  /** Solo para tests (R28): contenido completo. */
  dump(): Session[] {
    return [...this.sessions.values()].map((session) => ({ ...session }));
  }
}
