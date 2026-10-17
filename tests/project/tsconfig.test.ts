import { describe, expect, it } from "vitest";
import { readRepoJson } from "./helpers";

interface TsConfig {
  compilerOptions: Record<string, unknown>;
}

const tsconfig = readRepoJson<TsConfig>("tsconfig.json");

describe("tsconfig.json", () => {
  it("R11: strict está habilitado", () => {
    expect(tsconfig.compilerOptions["strict"]).toBe(true);
  });

  it("R12: noUncheckedIndexedAccess está habilitado", () => {
    expect(tsconfig.compilerOptions["noUncheckedIndexedAccess"]).toBe(true);
  });
});
