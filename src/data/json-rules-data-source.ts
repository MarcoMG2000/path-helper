import type { z } from "zod";
import { getCategory, type CategoryDef, type EntryOf } from "./categories";
import { getLegalNotice, type LegalNotice } from "./legal";
import { localize, type LocalizationData } from "./localize";
import type { LocalizedEntry, RulesDataSource, SpellListByLevel } from "./rules-data-source";
import type { Category, EntryCategory } from "./schema/common";
import { GlossaryFileSchema } from "./schema/glossary";
import { SummaryFileSchema } from "./schema/summary";
import type { CategoryShards, ShardRef } from "./shard-loader";

/** R60: un fichero de datos no supera su schema. Nombra fichero, id y campo. */
export class DataValidationError extends Error {
  constructor(
    readonly file: string,
    readonly id: string | undefined,
    readonly field: string,
    detail: string,
  ) {
    super(
      `${file}: ${id === undefined ? "" : `entrada "${id}": `}campo "${field}" inválido: ${detail}`,
    );
    this.name = "DataValidationError";
  }
}

export type CategoryDefinition = Pick<CategoryDef, "schema" | "shape" | "loadShards">;

export interface JsonRulesDataSourceOptions {
  /** Definición de cada categoría; por defecto el registro `categories.ts`. Los tests inyectan otra. */
  definition?: (category: Category) => CategoryDefinition;
  /** Carga perezosa de `glossary.es.json`. */
  loadGlossary?: () => Promise<unknown>;
  legalNotice?: LegalNotice;
}

interface LoadedCategory {
  entries: { id: string }[];
  byId: Map<string, { id: string }>;
  summaries: LocalizationData["summaries"];
}

function fieldOf(path: readonly PropertyKey[]): string {
  return path.length === 0 ? "(raíz)" : path.map(String).join(".");
}

async function readShard(ref: ShardRef): Promise<unknown> {
  return (await ref.load()).default;
}

/**
 * Implementación sobre los JSON empaquetados. Carga perezosa por categoría (R61): solo se
 * importan los shards de la categoría pedida y se validan con zod al cargarlos (R60).
 */
export class JsonRulesDataSource implements RulesDataSource {
  private readonly categories = new Map<Category, Promise<LoadedCategory>>();
  private glossary: Promise<LocalizationData["glossary"]> | undefined;
  private readonly definition: (category: Category) => CategoryDefinition;

  constructor(private readonly options: JsonRulesDataSourceOptions = {}) {
    this.definition = options.definition ?? ((category) => getCategory(category));
  }

  private load(category: Category): Promise<LoadedCategory> {
    let pending = this.categories.get(category);
    if (!pending) {
      pending = this.loadCategory(category);
      this.categories.set(category, pending);
      // Un fallo no queda cacheado: el siguiente intento vuelve a cargar y a informar.
      pending.catch(() => this.categories.delete(category));
    }
    return pending;
  }

  private async loadCategory(category: Category): Promise<LoadedCategory> {
    const def = this.definition(category);
    const shards: CategoryShards = await def.loadShards();
    const entries: { id: string }[] = [];
    for (const ref of shards.SHARDS) {
      const content = await readShard(ref);
      if (!Array.isArray(content)) {
        throw new DataValidationError(
          ref.file,
          undefined,
          "(raíz)",
          "debe ser un array de entradas",
        );
      }
      content.forEach((raw: unknown, index: number) => {
        const parsed = (def.schema as z.ZodType).safeParse(raw);
        if (!parsed.success) {
          const issue = parsed.error.issues[0];
          const id =
            typeof (raw as { id?: unknown } | null)?.id === "string"
              ? (raw as { id: string }).id
              : `#${index}`;
          throw new DataValidationError(
            ref.file,
            id,
            fieldOf(issue?.path ?? []),
            issue?.message ?? "inválido",
          );
        }
        entries.push(parsed.data as { id: string });
      });
    }
    const summaries: Record<string, LocalizationData["summaries"][string]> = {};
    for (const ref of shards.SUMMARIES) {
      const parsed = SummaryFileSchema.safeParse(await readShard(ref));
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const path = issue?.path ?? [];
        throw new DataValidationError(
          ref.file,
          typeof path[0] === "string" ? path[0] : undefined,
          fieldOf(path.slice(1)),
          issue?.message ?? "inválido",
        );
      }
      Object.assign(summaries, parsed.data);
    }
    return { entries, byId: new Map(entries.map((e) => [e.id, e])), summaries };
  }

  private loadGlossary(): Promise<LocalizationData["glossary"]> {
    this.glossary ??= (async () => {
      const raw = this.options.loadGlossary
        ? await this.options.loadGlossary()
        : ((await import("./glossary.es.json")) as { default: unknown }).default;
      const parsed = GlossaryFileSchema.safeParse(raw);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const path = issue?.path ?? [];
        throw new DataValidationError(
          "glossary.es.json",
          typeof path[0] === "string" ? path[0] : undefined,
          fieldOf(path.slice(1)),
          issue?.message ?? "inválido",
        );
      }
      return parsed.data;
    })();
    this.glossary.catch(() => {
      this.glossary = undefined;
    });
    return this.glossary;
  }

  async get<C extends EntryCategory>(
    category: C,
    id: string,
  ): Promise<LocalizedEntry<EntryOf<C>> | undefined> {
    const loaded = await this.load(category);
    const entry = loaded.byId.get(id);
    if (!entry) return undefined; // R59: no es un error
    return localize(category, entry, {
      glossary: await this.loadGlossary(),
      summaries: loaded.summaries,
    }) as LocalizedEntry<EntryOf<C>>;
  }

  async list<C extends EntryCategory>(category: C): Promise<readonly LocalizedEntry<EntryOf<C>>[]> {
    const loaded = await this.load(category);
    const glossary = await this.loadGlossary();
    return loaded.entries.map(
      (entry) =>
        localize(category, entry, { glossary, summaries: loaded.summaries }) as LocalizedEntry<
          EntryOf<C>
        >,
    );
  }

  async getSpellList(classId: string): Promise<SpellListByLevel | undefined> {
    const def = this.definition("spell-lists");
    const shards = await def.loadShards();
    const ref = shards.SHARDS[0];
    if (!ref) return undefined;
    const raw = await readShard(ref);
    const parsed = (def.schema as z.ZodType).safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new DataValidationError(
        ref.file,
        undefined,
        fieldOf(issue?.path ?? []),
        issue?.message ?? "inválido",
      );
    }
    return (parsed.data as Record<string, SpellListByLevel>)[classId];
  }

  getLegalNotice(): LegalNotice {
    return this.options.legalNotice ?? getLegalNotice();
  }
}
