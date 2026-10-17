import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { CATEGORY_IDS, type Category } from "../../../src/data/schema/common";
import { loadSlugAliases, type SlugAliases } from "./slug";

const CategorySeedsSchema = z.strictObject({
  /** Semillas de toda la categoría (páginas de entrada e índices). */
  urls: z.array(z.string().url()),
  /** Semillas extra solo para un subconjunto (`magic-items:ring`, `spells:index`). */
  subsets: z.record(z.string(), z.array(z.string().url())).optional(),
});
export type CategorySeeds = z.infer<typeof CategorySeedsSchema>;

const seedShape = Object.fromEntries(
  CATEGORY_IDS.map((id) => [id, CategorySeedsSchema.optional()]),
) as Record<Category, z.ZodOptional<typeof CategorySeedsSchema>>;

export const SeedsSchema = z.strictObject({
  /** Plantilla de URL de contraste (d20pfsrd) por categoría; admite `{id}`, `{slug}` y `{name}`. */
  crosscheck: z.record(z.string(), z.string()).default({}),
  ...seedShape,
});
export type Seeds = z.infer<typeof SeedsSchema>;

export const SectionAllowlistSchema = z.strictObject(
  Object.fromEntries(CATEGORY_IDS.map((id) => [id, z.array(z.string()).optional()])) as Record<
    Category,
    z.ZodOptional<z.ZodArray<z.ZodString>>
  >,
);
export type SectionAllowlist = z.infer<typeof SectionAllowlistSchema>;

export interface SrdConfig {
  seeds: Seeds;
  slugAliases: SlugAliases;
  sectionAllowlist: SectionAllowlist;
  /** Resto de `config/*.json` por nombre en camelCase (`spellBatches`, `magicSections`...). */
  extra: Record<string, unknown>;
}

const KNOWN = new Set(["seeds.json", "slug-aliases.json", "section-allowlist.json"]);

function camel(file: string): string {
  return file.replace(/\.json$/, "").replace(/-([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${path}: JSON inválido`, { cause: error });
  }
}

function parseWith<T>(schema: z.ZodType<T>, path: string): T {
  const result = schema.safeParse(readJson(path));
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(
      `${path}: ${issue?.path.join(".") || "(raíz)"}: ${issue?.message ?? "inválido"}`,
    );
  }
  return result.data;
}

/** Carga `scripts/srd/config`: seeds, alias, lista de secciones y el resto como `extra`. */
export function loadConfig(configDir: string): SrdConfig {
  const extra: Record<string, unknown> = {};
  for (const file of readdirSync(configDir).filter((n) => n.endsWith(".json") && !KNOWN.has(n))) {
    extra[camel(file)] = readJson(resolve(configDir, file));
  }
  return {
    seeds: parseWith(SeedsSchema, resolve(configDir, "seeds.json")),
    slugAliases: loadSlugAliases(resolve(configDir, "slug-aliases.json")),
    sectionAllowlist: parseWith(
      SectionAllowlistSchema,
      resolve(configDir, "section-allowlist.json"),
    ),
    extra,
  };
}

export interface CategoryScope {
  category: Category;
  subset: string | undefined;
}

/** `--category` acepta `categoría` o `categoría:subconjunto` (T0.6), separadas por comas. */
export function parseCategoryArg(value: string | undefined): CategoryScope[] {
  if (value === undefined || value.trim() === "") return [];
  return value.split(",").map((item) => {
    const [category, ...rest] = item.trim().split(":");
    if (!(CATEGORY_IDS as readonly string[]).includes(category ?? "")) {
      throw new Error(`categoría desconocida "${category}" (válidas: ${CATEGORY_IDS.join(", ")})`);
    }
    const subset = rest.join(":");
    return { category: category as Category, subset: subset === "" ? undefined : subset };
  });
}
