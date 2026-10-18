import { afterEach, beforeEach, expect, vi, type MockInstance } from "vitest";

const METHODS = ["log", "info", "warn", "error", "debug", "trace"] as const;

/** R86: espía todos los `console.*` y exige cero llamadas. Registra sus hooks al llamarse. */
export function useConsoleSpies(): { expectSilent(): void } {
  let spies: MockInstance[] = [];
  beforeEach(() => {
    spies = METHODS.map((method) => vi.spyOn(console, method).mockImplementation(() => {}));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  return {
    expectSilent() {
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    },
  };
}
