/** Todos los instantes son epoch ms. */
export interface Session {
  /** SHA-256 hex del token; el token nunca se almacena (R28). */
  tokenHash: string;
  userId: string;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
}

export interface SessionStore {
  create(session: Session): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<Session | null>;
  touch(tokenHash: string, lastSeenAt: number): Promise<void>;
  delete(tokenHash: string): Promise<void>;
  /** Borra todas las sesiones de `userId`, salvo `exceptTokenHash` si se indica (R89). */
  deleteAllForUser(userId: string, exceptTokenHash?: string): Promise<void>;
  /**
   * Purga: borra las sesiones con `expiresAt <= now` o `lastSeenAt <= idleCutoff`.
   * Devuelve cuántas borró.
   */
  deleteExpired(now: number, idleCutoff: number): Promise<number>;
}
