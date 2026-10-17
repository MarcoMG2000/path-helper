import type { Clock } from "../../src/server/clock";

export class FakeClock implements Clock {
  private current: number;

  constructor(start = Date.UTC(2026, 0, 1)) {
    this.current = start;
  }

  now(): number {
    return this.current;
  }

  advance(ms: number): void {
    this.current += ms;
  }

  set(ms: number): void {
    this.current = ms;
  }
}
