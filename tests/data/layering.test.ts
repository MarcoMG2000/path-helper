import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "../project/helpers";

// R62: escaneo estático de imports. `src/data` no importa de server ni web; `src/rules` tampoco y
// además no lee ficheros (recibe los datos por parámetro).

const IMPORT_RE = /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["']([^"']+)["']/g;
const FS_MODULES = new Set(["fs", "node:fs", "fs/promises", "node:fs/promises"]);

export function importsOf(source: string): string[] {
  const out: string[] = [];
  for (const match of source.matchAll(IMPORT_RE)) out.push(match[1] as string);
  return out;
}

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) out.push(...files(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

function layerOf(path: string): string | undefined {
  const rel = relative(resolve(ROOT, "src"), path).split(sep);
  return rel[0] === ".." ? undefined : rel[0];
}

export interface Violation {
  file: string;
  specifier: string;
  reason: string;
}

export function violationsIn(file: string, source: string, layer: "data" | "rules"): Violation[] {
  const out: Violation[] = [];
  for (const specifier of importsOf(source)) {
    if (specifier.startsWith(".")) {
      const target = resolve(dirname(file), specifier);
      const targetLayer = layerOf(target);
      if (targetLayer === "server" || targetLayer === "web") {
        out.push({ file, specifier, reason: `${layer} no puede importar de ${targetLayer}` });
      }
      if (layer === "rules" && specifier.endsWith(".json")) {
        out.push({ file, specifier, reason: "rules no puede importar ficheros de datos" });
      }
    } else {
      if (/(^|\/)(server|web)(\/|$)/.test(specifier) && specifier.includes("src/")) {
        out.push({ file, specifier, reason: `${layer} no puede importar de server/web` });
      }
      if (layer === "rules" && FS_MODULES.has(specifier)) {
        out.push({ file, specifier, reason: "rules no puede leer ficheros" });
      }
    }
  }
  return out;
}

function scan(layer: "data" | "rules"): Violation[] {
  return files(resolve(ROOT, "src", layer)).flatMap((file) =>
    violationsIn(file, readFileSync(file, "utf8"), layer),
  );
}

describe("capas (R62)", () => {
  it("R62: src/data no importa de src/server ni de src/web", () => {
    expect(scan("data")).toEqual([]);
  });

  it("R62: src/rules no importa de server/web ni lee ficheros", () => {
    expect(scan("rules")).toEqual([]);
  });

  it("R62: el escáner detecta importaciones prohibidas (casos sintéticos)", () => {
    const dataFile = resolve(ROOT, "src", "data", "x.ts");
    const rulesFile = resolve(ROOT, "src", "rules", "x.ts");
    expect(
      violationsIn(
        dataFile,
        'import { a } from "../server/app";\nconst b = await import("../web/x");',
        "data",
      ),
    ).toHaveLength(2);
    expect(violationsIn(dataFile, 'import fs from "node:fs";', "data")).toEqual([]);
    expect(
      violationsIn(
        rulesFile,
        'import fs from "node:fs";\nimport d from "../data/x.json";\nrequire("fs/promises")',
        "rules",
      ).map((v) => v.reason),
    ).toEqual([
      "rules no puede leer ficheros",
      "rules no puede importar ficheros de datos",
      "rules no puede leer ficheros",
    ]);
    expect(violationsIn(rulesFile, 'import { z } from "zod";\nimport "./other";', "rules")).toEqual(
      [],
    );
  });

  it("el escáner reconoce from, import() y require", () => {
    expect(
      importsOf(
        'import a from "x"; export * from "y"; await import("z"); require("w"); import "v";',
      ),
    ).toEqual(["x", "y", "z", "w", "v"]);
  });
});
