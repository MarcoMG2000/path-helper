export interface Clock {
  /** Epoch en milisegundos. */
  now(): number;
}

export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
}
