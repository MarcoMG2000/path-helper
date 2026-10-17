import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
import { ROOT } from "./helpers";

const eslint = new ESLint({ cwd: ROOT });

async function lint(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? "parse-error");
}

const importFrom = (dir: string): string => `import { x } from "../${dir}/mod";\nexport { x };\n`;

describe("lint de capas", () => {
  it("R3: rules no puede importar de server", async () => {
    expect(await lint(importFrom("server"), "src/rules/a.ts")).toContain("no-restricted-imports");
  });

  it("R3: rules no puede importar de web", async () => {
    expect(await lint(importFrom("web"), "src/rules/a.ts")).toContain("no-restricted-imports");
  });

  it("R3: data no puede importar de server ni de web", async () => {
    expect(await lint(importFrom("server"), "src/data/a.ts")).toContain("no-restricted-imports");
    expect(await lint(importFrom("web"), "src/data/a.ts")).toContain("no-restricted-imports");
  });

  it("R4: web no puede importar de server", async () => {
    expect(await lint(importFrom("server"), "src/web/a.ts")).toContain("no-restricted-imports");
  });

  it("imports permitidos no producen error de capas", async () => {
    expect(await lint(importFrom("shared"), "src/web/a.ts")).not.toContain("no-restricted-imports");
    expect(await lint(importFrom("rules"), "src/server/a.ts")).not.toContain(
      "no-restricted-imports",
    );
  });

  it("R15: console.* en src falla el lint", async () => {
    expect(await lint('console.log("x");\n', "src/server/x.ts")).toContain("no-console");
  });
});
