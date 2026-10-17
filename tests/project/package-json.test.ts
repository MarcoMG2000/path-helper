import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readRepoFile, readRepoJson, ROOT } from "./helpers";

interface PackageJson {
  engines?: { node?: string };
  scripts: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const pkg = readRepoJson<PackageJson>("package.json");

describe("package.json", () => {
  it("R5: declara los scripts requeridos", () => {
    for (const name of ["dev", "build", "test", "test:int", "lint", "typecheck"]) {
      expect(pkg.scripts[name], name).toBeTypeOf("string");
    }
  });

  // Enmienda de R6 (cierre de f1): node:sqlite sin flag solo existe desde Node 22.13 y
  // .npmrc tiene engine-strict=true, así que `engines` debe exigirlo para que sea efectivo.
  it("R6: engines.node es >=22.13", () => {
    expect(pkg.engines?.node).toBe(">=22.13");
  });

  it("R7: todas las dependencias tienen versión exacta", () => {
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(Object.keys(all).length).toBeGreaterThan(0);
    for (const [name, version] of Object.entries(all)) {
      expect(version, name).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it("R8: package-lock.json existe y no está ignorado por git", () => {
    expect(existsSync(resolve(ROOT, "package-lock.json"))).toBe(true);
    const ignored = readRepoFile(".gitignore")
      .split(/\r?\n/)
      .map((line) => line.trim());
    expect(ignored).not.toContain("package-lock.json");
  });

  it("R9: los scripts no usan sintaxis específica de un shell", () => {
    for (const [name, command] of Object.entries(pkg.scripts)) {
      expect(command, name).not.toMatch(/(^|[\s;&|])[A-Za-z_][A-Za-z0-9_]*=/); // VAR=valor
      expect(command, name).not.toMatch(/\bexport\b/);
      expect(command, name).not.toMatch(/(^|[\s;&|])(rm|cp|mv|cat)\s/);
      expect(command, name).not.toContain("$");
      expect(command, name).not.toContain("'");
    }
  });

  it("R35: el script dev arranca API y web con un único comando", () => {
    expect(pkg.scripts["dev"]).toContain("concurrently");
    expect(pkg.scripts["dev"]).toContain("npm:dev:server");
    expect(pkg.scripts["dev"]).toContain("npm:dev:web");
  });

  it("R40: build comprueba tipos y construye con vite", () => {
    expect(pkg.scripts["build"]).toContain("typecheck");
    expect(pkg.scripts["build"]).toContain("vite build");
  });
});
