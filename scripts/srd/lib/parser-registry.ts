import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Category } from "../../../src/data/schema/common";
import type { ParserModule } from "./parser-contract";

// Módulo de parser de cada categoría (relativo a `scripts/srd/parsers`). Los lotes crean el
// fichero con ese nombre y exportan `parse` (y `discover` si procede); esta tabla no se edita.
export const PARSER_MODULES: Readonly<Record<Category, string>> = {
  classes: "classes.ts",
  "class-features": "class-features.ts",
  domains: "domains.ts",
  races: "races.ts",
  skills: "skills.ts",
  feats: "feats.ts",
  spells: "spells.ts",
  "spell-lists": "spell-lists.ts",
  weapons: "equipment.ts",
  armor: "equipment.ts",
  shields: "equipment.ts",
  gear: "equipment.ts",
  "magic-items": "magic-items/index.ts",
};

export class ParserNotImplementedError extends Error {
  constructor(category: Category, file: string) {
    super(
      `no hay parser para "${category}": falta ${file} (lo crea el lote dueño de la categoría)`,
    );
  }
}

export type ParserLoader = (category: Category) => Promise<ParserModule>;

/** Carga dinámica del módulo de parser; los tests inyectan su propio `ParserLoader`. */
export function createParserLoader(scriptsDir: string): ParserLoader {
  return async (category) => {
    const file = resolve(scriptsDir, "parsers", PARSER_MODULES[category]);
    if (!existsSync(file)) {
      throw new ParserNotImplementedError(
        category,
        `scripts/srd/parsers/${PARSER_MODULES[category]}`,
      );
    }
    const mod = (await import(pathToFileURL(file).href)) as Partial<ParserModule>;
    if (typeof mod.parse !== "function") {
      throw new Error(`scripts/srd/parsers/${PARSER_MODULES[category]} debe exportar "parse"`);
    }
    return mod as ParserModule;
  };
}
