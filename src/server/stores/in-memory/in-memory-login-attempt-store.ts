import type { AttemptState, LoginAttemptStore } from "../login-attempt-store";

export class InMemoryLoginAttemptStore implements LoginAttemptStore {
  private readonly states = new Map<string, AttemptState>();

  async get(nameKey: string): Promise<AttemptState | null> {
    const state = this.states.get(nameKey);
    return state ? { ...state } : null;
  }

  async put(state: AttemptState): Promise<void> {
    this.states.set(state.nameKey, { ...state });
  }

  async delete(nameKey: string): Promise<void> {
    this.states.delete(nameKey);
  }

  async deleteIdleBefore(updatedAtCutoff: number): Promise<number> {
    let removed = 0;
    for (const [nameKey, state] of this.states) {
      if (state.updatedAt < updatedAtCutoff) {
        this.states.delete(nameKey);
        removed += 1;
      }
    }
    return removed;
  }

  /** Solo para tests: número de claves almacenadas. */
  size(): number {
    return this.states.size;
  }
}
