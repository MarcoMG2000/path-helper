import type { Clock } from "../clock";
import type { AttemptState, LoginAttemptStore } from "../stores/login-attempt-store";
import type { LockoutConfig } from "./config";

export type ThrottleCheck = { locked: false } | { locked: true; lockedUntil: number };

/**
 * Política de bloqueo por clave de nombre (R41-R47, R50). El llamador debe serializar las
 * llamadas por clave (KeyedMutex) para que leer-contar-escribir sea correcto.
 */
export class LoginThrottle {
  constructor(
    private readonly attempts: LoginAttemptStore,
    private readonly clock: Clock,
    private readonly cfg: LockoutConfig,
  ) {}

  /** Estado vigente: un estado sin actividad desde hace más de `idleResetMs` se da por olvidado. */
  private async effectiveState(key: string): Promise<AttemptState | null> {
    const state = await this.attempts.get(key);
    if (!state) return null;
    return this.clock.now() - state.updatedAt > this.cfg.idleResetMs ? null : state;
  }

  async check(key: string): Promise<ThrottleCheck> {
    const state = await this.effectiveState(key);
    const now = this.clock.now();
    if (state?.lockedUntil != null && now < state.lockedUntil) {
      return { locked: true, lockedUntil: state.lockedUntil };
    }
    return { locked: false };
  }

  /**
   * Cuenta un fallo. Mientras la clave está bloqueada no cuenta (R44). Al llegar al umbral
   * sube el nivel y bloquea durante `min(base * 2^(nivel-1), max)` con el contador a 0 (R42, R45).
   */
  async recordFailure(key: string): Promise<{ lockedUntil: number | null }> {
    const now = this.clock.now();
    const state = await this.effectiveState(key);
    if (state?.lockedUntil != null && now < state.lockedUntil) {
      return { lockedUntil: state.lockedUntil };
    }
    // Un bloqueo ya cumplido deja el contador a 0 pero conserva el nivel (R46, R45).
    const failures = (state?.failures ?? 0) + 1;
    const lockLevel = state?.lockLevel ?? 0;
    let next: AttemptState;
    if (failures >= this.cfg.maxFailures) {
      const level = lockLevel + 1;
      const duration = Math.min(this.cfg.baseLockMs * 2 ** (level - 1), this.cfg.maxLockMs);
      next = {
        nameKey: key,
        failures: 0,
        lockLevel: level,
        lockedUntil: now + duration,
        updatedAt: now,
      };
    } else {
      next = { nameKey: key, failures, lockLevel, lockedUntil: null, updatedAt: now };
    }
    await this.attempts.put(next);
    await this.purgeIdle();
    return { lockedUntil: next.lockedUntil };
  }

  /** R47: un login correcto olvida contador y nivel. */
  async reset(key: string): Promise<void> {
    await this.attempts.delete(key);
  }

  /** R50: borra los estados sin actividad desde hace más de `idleResetMs`. */
  async purgeIdle(): Promise<number> {
    return this.attempts.deleteIdleBefore(this.clock.now() - this.cfg.idleResetMs);
  }
}
