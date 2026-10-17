/** Reloj inyectable: los tests lo sustituyen por uno falso (R41). */
export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export interface RateLimiter {
  /** Resuelve cuando se puede lanzar la siguiente petición. */
  acquire(): Promise<void>;
}

/** Separa las peticiones al menos `minIntervalMs` (por defecto 1 petición/s, R41). */
export function createRateLimiter(clock: Clock, minIntervalMs = 1000): RateLimiter {
  let nextAllowed = Number.NEGATIVE_INFINITY;
  return {
    async acquire() {
      const now = clock.now();
      const wait = nextAllowed - now;
      if (wait > 0) {
        nextAllowed += minIntervalMs;
        await clock.sleep(wait);
      } else {
        nextAllowed = now + minIntervalMs;
      }
    },
  };
}
