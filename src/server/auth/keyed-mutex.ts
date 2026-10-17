/**
 * Exclusión mutua por clave dentro de un único proceso Node: las llamadas con la misma clave
 * se ejecutan en serie y en orden de llegada; claves distintas no se bloquean entre sí.
 */
export class KeyedMutex {
  private readonly tails = new Map<string, Promise<void>>();

  async runExclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => current);
    this.tails.set(key, tail);
    await previous;
    try {
      return await fn();
    } finally {
      release();
      // Sin cola pendiente: se libera la entrada para que el mapa no crezca.
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }

  /** Solo para tests: claves con trabajo en curso o en espera. */
  get activeKeys(): number {
    return this.tails.size;
  }
}
