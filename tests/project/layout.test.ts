import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "./helpers";

const LAYERS = ["shared", "rules", "data", "server", "web"];

function hasFile(dir: string): boolean {
  return readdirSync(dir).some((name) => {
    const full = resolve(dir, name);
    return statSync(full).isFile() || hasFile(full);
  });
}

describe("layout del repositorio", () => {
  for (const layer of LAYERS) {
    it(`R1: src/${layer} existe y contiene al menos un fichero`, () => {
      const dir = resolve(ROOT, "src", layer);
      expect(existsSync(dir)).toBe(true);
      expect(hasFile(dir)).toBe(true);
    });

    it(`R2: tests/${layer} existe y contiene al menos un fichero`, () => {
      const dir = resolve(ROOT, "tests", layer);
      expect(existsSync(dir)).toBe(true);
      expect(hasFile(dir)).toBe(true);
    });
  }
});
