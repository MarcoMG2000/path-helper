/** PRNG determinista mulberry32 (R54): misma semilla, misma secuencia. */
export interface Prng {
  /** Siguiente número en [0, 1). */
  next(): number;
  /** Entero en [0, max). */
  int(max: number): number;
  /** Copia barajada (Fisher-Yates) sin modificar la entrada. */
  shuffle<T>(items: readonly T[]): T[];
}

export function createPrng(seed: number): Prng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (max: number): number => Math.floor(next() * max);
  const shuffle = <T>(items: readonly T[]): T[] => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(i + 1);
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  };
  return { next, int, shuffle };
}
