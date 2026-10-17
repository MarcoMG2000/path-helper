import { execSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "./helpers";

function run(script: string): void {
  // execSync lanza si el código de salida != 0.
  execSync(`npm run ${script}`, { cwd: ROOT, stdio: "pipe", timeout: 150_000 });
}

describe("pipeline de calidad (integración)", () => {
  it("R13: npm run typecheck termina con código 0", () => {
    run("typecheck");
  });

  it("R14: npm run lint termina con código 0", () => {
    run("lint");
  });

  it("R40: npm run build genera index.html, manifest y service worker en dist/web", () => {
    run("build");
    const out = resolve(ROOT, "dist", "web");
    expect(existsSync(resolve(out, "index.html"))).toBe(true);
    expect(existsSync(resolve(out, "manifest.webmanifest"))).toBe(true);
    expect(readdirSync(out).some((name) => /^sw\.js$/.test(name))).toBe(true);
  });
});
