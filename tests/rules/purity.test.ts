import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RULES_DIR = join(__dirname, "..", "..", "src", "rules");
const files = readdirSync(RULES_DIR).filter((f) => f.endsWith(".ts"));

// Extrae los especificadores de import / export ... from / require() / import().
function specifiers(source: string): string[] {
  const out: string[] = [];
  const patterns = [
    /\bimport\s+(?:[^"'()]*?\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+[^"'()]*?\s+from\s+["']([^"']+)["']/g,
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const re of patterns) for (const m of source.matchAll(re)) out.push(m[1] as string);
  return out;
}

const FORBIDDEN_LAYERS = /(^|\/)(server|web|data)(\/|$)/;
const NODE_IO = /^(node:|fs$|fs\/|net$|http$|https$|child_process$|dgram$|dns$|tls$|os$|path$)/;

function violations(source: string): string[] {
  return specifiers(source).filter((s) => FORBIDDEN_LAYERS.test(s) || NODE_IO.test(s));
}

describe("pureza de src/rules", () => {
  it("R4: existen los ficheros esperados del módulo", () => {
    expect(files.sort()).toEqual([
      "ability.ts",
      "armor-class.ts",
      "check.ts",
      "index.ts",
      "initiative.ts",
      "modifiers.ts",
      "progression.ts",
      "result.ts",
      "saves.ts",
      "size.ts",
      "skills.ts",
      "types.ts",
    ]);
  });

  it("R4: el detector reconoce imports prohibidos (sanity check del propio test)", () => {
    expect(violations(`import { x } from "../server/config";`)).toHaveLength(1);
    expect(violations(`import x from "../../web/app";`)).toHaveLength(1);
    expect(violations(`export * from "../data/spells";`)).toHaveLength(1);
    expect(violations(`import { readFileSync } from "node:fs";`)).toHaveLength(1);
    expect(violations(`const fs = require("fs");`)).toHaveLength(1);
    expect(violations(`const h = await import("http");`)).toHaveLength(1);
    expect(violations(`import { a } from "./modifiers";`)).toHaveLength(0);
  });

  for (const file of files) {
    const source = readFileSync(join(RULES_DIR, file), "utf8");

    it(`R4: ${file} no importa de server, web, data ni módulos de I/O de Node`, () => {
      expect(violations(source)).toEqual([]);
    });

    it(`R4: ${file} solo importa módulos relativos de src/rules (sin dependencias externas)`, () => {
      for (const s of specifiers(source)) expect(s.startsWith("./"), s).toBe(true);
    });

    it(`R4: ${file} no usa reloj, aleatoriedad ni console`, () => {
      const code = source.replace(/\/\/.*$/gm, "");
      expect(code).not.toMatch(/\bDate\b|Math\.random|\bconsole\b|\bprocess\b/);
    });
  }

  const EXEMPT = new Set(["types.ts", "result.ts", "index.ts"]);
  for (const file of files.filter((f) => !EXEMPT.has(f))) {
    it(`R6: ${file} cita la regla del Core con un comentario "CRB:"`, () => {
      expect(readFileSync(join(RULES_DIR, file), "utf8")).toContain("CRB:");
    });
  }
});
