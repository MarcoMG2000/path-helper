import { describe, expect, it } from "vitest";
import { getCategory } from "../../src/data/categories";
import { InMemoryRulesDataSource } from "../../src/data/in-memory-rules-data-source";
import {
  DataValidationError,
  JsonRulesDataSource,
  type CategoryDefinition,
} from "../../src/data/json-rules-data-source";
import { BaseEntrySchema, type Category } from "../../src/data/schema/common";
import { SpellListsSchema } from "../../src/data/schema/spell-list";
import type { CategoryShards, ShardRef } from "../../src/data/shard-loader";
import {
  CONTRACT_ENTRIES,
  CONTRACT_GLOSSARY,
  CONTRACT_SPELL_LISTS,
  CONTRACT_SUMMARIES,
  runRulesDataSourceContract,
} from "./helpers/rules-data-source-contract";

function shard(file: string, content: unknown, counter?: string[]): ShardRef {
  return {
    file,
    load: async () => {
      counter?.push(file);
      return { default: content };
    },
  };
}

interface Fixture {
  loaded: string[];
  source: JsonRulesDataSource;
}

function jsonSource(
  overrides: Partial<Record<Category, CategoryShards>> = {},
  glossary: unknown = CONTRACT_GLOSSARY,
): Fixture {
  const loaded: string[] = [];
  const shards: Partial<Record<Category, CategoryShards>> = {
    skills: {
      SHARDS: [shard("skills.json", CONTRACT_ENTRIES, loaded)],
      SUMMARIES: [shard("summaries/skills/s.json", CONTRACT_SUMMARIES, loaded)],
    },
    feats: { SHARDS: [shard("feats/a.json", [], loaded)], SUMMARIES: [] },
    "spell-lists": {
      SHARDS: [shard("spells/lists.json", CONTRACT_SPELL_LISTS, loaded)],
      SUMMARIES: [],
    },
    ...overrides,
  };
  const definition = (category: Category): CategoryDefinition => ({
    shape: getCategory(category).shape,
    schema: category === "spell-lists" ? SpellListsSchema : BaseEntrySchema,
    loadShards: async () => {
      const found = shards[category];
      if (!found) throw new Error(`categoría no esperada en el test: ${category}`);
      loaded.push(`index:${category}`);
      return found;
    },
  });
  return {
    loaded,
    source: new JsonRulesDataSource({ definition, loadGlossary: async () => glossary }),
  };
}

runRulesDataSourceContract("JsonRulesDataSource", () => jsonSource().source);
runRulesDataSourceContract(
  "InMemoryRulesDataSource",
  () =>
    new InMemoryRulesDataSource({
      entries: { skills: CONTRACT_ENTRIES },
      glossary: CONTRACT_GLOSSARY,
      summaries: { skills: CONTRACT_SUMMARIES },
      spellLists: CONTRACT_SPELL_LISTS,
    }),
);

describe("JsonRulesDataSource: validación y carga perezosa", () => {
  it("R61: pedir una categoría carga solo sus ficheros y no los demás", async () => {
    const { source, loaded } = jsonSource();
    await source.get("skills", "stealth");
    expect(loaded).toEqual(["index:skills", "skills.json", "summaries/skills/s.json"]);
    await source.list("skills"); // segunda lectura: cacheada
    expect(loaded).toHaveLength(3);
    await source.get("feats", "x");
    expect(loaded).toContain("index:feats");
    expect(loaded).not.toContain("index:spell-lists");
    expect(loaded).not.toContain("spells/lists.json");
  });

  it("R61: dos peticiones concurrentes de la misma categoría cargan una sola vez", async () => {
    const { source, loaded } = jsonSource();
    await Promise.all([source.get("skills", "stealth"), source.list("skills")]);
    expect(loaded.filter((l) => l === "skills.json")).toHaveLength(1);
  });

  it("R60: una entrada inválida lanza un error con fichero, id y campo", async () => {
    const bad = [{ ...CONTRACT_ENTRIES[0], book: "APG" }];
    const { source } = jsonSource({
      skills: { SHARDS: [shard("skills.json", bad)], SUMMARIES: [] },
    });
    const error = await source.list("skills").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DataValidationError);
    const e = error as DataValidationError;
    expect(e.file).toBe("skills.json");
    expect(e.id).toBe("acrobatics");
    expect(e.field).toBe("book");
    expect(e.message).toContain('skills.json: entrada "acrobatics": campo "book"');
  });

  it("R60: un shard que no es array o un resumen inválido también lanzan", async () => {
    const notArray = jsonSource({ skills: { SHARDS: [shard("skills.json", {})], SUMMARIES: [] } });
    await expect(notArray.source.list("skills")).rejects.toThrow(/skills\.json.*array/);
    const badSummary = jsonSource({
      skills: {
        SHARDS: [shard("skills.json", CONTRACT_ENTRIES)],
        SUMMARIES: [
          shard("summaries/skills/s.json", { stealth: { summaryEs: "", status: "draft" } }),
        ],
      },
    });
    await expect(badSummary.source.list("skills")).rejects.toThrow(
      /summaries\/skills\/s\.json: entrada "stealth": campo "summaryEs"/,
    );
  });

  it("R60: un glosario inválido nombra glossary.es.json", async () => {
    const { source } = jsonSource({}, { "skills:stealth": { es: "", verified: false } });
    await expect(source.get("skills", "stealth")).rejects.toThrow(/glossary\.es\.json/);
  });

  it("un fallo de carga no se cachea: el siguiente intento vuelve a informar", async () => {
    let failing = true;
    const { source } = jsonSource({
      skills: {
        SHARDS: [
          {
            file: "skills.json",
            load: async () => {
              if (failing) throw new Error("disco");
              return { default: CONTRACT_ENTRIES };
            },
          },
        ],
        SUMMARIES: [],
      },
    });
    await expect(source.list("skills")).rejects.toThrow("disco");
    failing = false;
    expect(await source.list("skills")).toHaveLength(2);
  });

  it("el glosario real (glossary.es.json) se carga de forma perezosa por defecto", async () => {
    const { source } = jsonSource();
    const withDefaultGlossary = new JsonRulesDataSource({
      definition: (category) => ({
        shape: getCategory(category).shape,
        schema: BaseEntrySchema,
        loadShards: async () => ({
          SHARDS: [shard("skills.json", CONTRACT_ENTRIES)],
          SUMMARIES: [],
        }),
      }),
    });
    expect((await withDefaultGlossary.get("skills", "stealth"))?.entry.id).toBe("stealth");
    expect(source.getLegalNotice().oglText).toContain("OPEN GAME LICENSE");
  });
});
