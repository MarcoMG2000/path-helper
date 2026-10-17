export interface AttemptState {
  nameKey: string;
  failures: number;
  lockLevel: number;
  /** epoch ms, o null si no está bloqueado */
  lockedUntil: number | null;
  /** epoch ms de la última actividad (base de la purga por inactividad) */
  updatedAt: number;
}

export interface LoginAttemptStore {
  get(nameKey: string): Promise<AttemptState | null>;
  /** Upsert por `nameKey`. */
  put(state: AttemptState): Promise<void>;
  delete(nameKey: string): Promise<void>;
  /** Borra los estados con `updatedAt < updatedAtCutoff`; devuelve cuántos. */
  deleteIdleBefore(updatedAtCutoff: number): Promise<number>;
}
