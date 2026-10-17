import { describe, expect, it } from "vitest";
import { SystemClock } from "../../src/server/clock";
import { FakeClock } from "../helpers/fake-clock";

describe("Clock", () => {
  it("SystemClock devuelve el epoch actual en ms", () => {
    const before = Date.now();
    const value = new SystemClock().now();
    expect(value).toBeGreaterThanOrEqual(before);
    expect(value).toBeLessThanOrEqual(Date.now());
  });

  it("FakeClock avanza y se fija a mano", () => {
    const clock = new FakeClock(1000);
    expect(clock.now()).toBe(1000);
    clock.advance(500);
    expect(clock.now()).toBe(1500);
    clock.set(10);
    expect(clock.now()).toBe(10);
  });
});
