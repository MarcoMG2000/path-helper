import { describe, expect, it } from "vitest";
import { readRepoFile, readRepoJson } from "./helpers";

describe("ficheros de repositorio", () => {
  it("R10: .gitattributes fuerza LF para *.sh", () => {
    const lines = readRepoFile(".gitattributes")
      .split(/\r?\n/)
      .map((line) => line.trim());
    expect(lines).toContain("*.sh text eol=lf");
  });

  it("R16: Prettier tiene printWidth 100", () => {
    expect(readRepoJson<{ printWidth: number }>(".prettierrc.json").printWidth).toBe(100);
  });
});
