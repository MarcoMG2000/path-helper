import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getCategory } from "../../../src/data/categories";
import {
  findStaleIndexes,
  listShardFiles,
  listSummaryFiles,
  renderCategoryIndex,
  writeCategoryIndexes,
} from "../../../scripts/srd/lib/shard-index";
import { tempDir, writeFile } from "../helpers";

describe("shard-index (R61)", () => {
  it("lista los ficheros por patrón y respeta las exclusiones (spells/lists.json es spell-lists)", () => {
    const root = tempDir();
    const data = join(root, "src", "data");
    writeFile(root, "src/data/spells/b.json", "[]");
    writeFile(root, "src/data/spells/a.json", "[]");
    writeFile(root, "src/data/spells/lists.json", "{}");
    writeFile(root, "src/data/spells/index.ts", "");
    writeFile(root, "src/data/domains.json", "[]");
    writeFile(root, "src/data/equipment/weapons.json", "[]");
    expect(listShardFiles(data, getCategory("spells"))).toEqual(["spells/a.json", "spells/b.json"]);
    expect(listShardFiles(data, getCategory("spell-lists"))).toEqual(["spells/lists.json"]);
    expect(listShardFiles(data, getCategory("domains"))).toEqual(["domains.json"]);
    expect(listShardFiles(data, getCategory("weapons"))).toEqual(["equipment/weapons.json"]);
    expect(listShardFiles(data, getCategory("armor"))).toEqual([]);
  });

  it("lista los resúmenes de forma recursiva y ordenada", () => {
    const root = tempDir();
    writeFile(root, "src/data/summaries/classes/b/x.json", "{}");
    writeFile(root, "src/data/summaries/classes/a.json", "{}");
    expect(listSummaryFiles(join(root, "src", "data"), getCategory("classes"))).toEqual([
      "summaries/classes/a.json",
      "summaries/classes/b/x.json",
    ]);
  });

  it("renderiza imports estáticos relativos al directorio del índice", () => {
    const text = renderCategoryIndex(
      { dir: "weapons" },
      ["equipment/weapons.json"],
      ["summaries/weapons/w.json"],
    );
    expect(text).toContain('file: "equipment/weapons.json"');
    expect(text).toContain('import("../equipment/weapons.json")');
    expect(text).toContain('import("../summaries/weapons/w.json")');
    expect(renderCategoryIndex({ dir: "classes" }, ["classes/druid.json"], [])).toContain(
      'import("./druid.json")',
    );
    expect(renderCategoryIndex({ dir: "x" }, [], [])).toContain(
      "SHARDS: readonly ShardRef[] = [];",
    );
  });

  it("writeCategoryIndexes crea los 13 índices, es idempotente y findStaleIndexes detecta cambios", () => {
    const root = tempDir();
    expect(writeCategoryIndexes(root)).toHaveLength(13);
    expect(writeCategoryIndexes(root)).toEqual([]);
    expect(findStaleIndexes(root)).toEqual([]);
    writeFile(root, "src/data/classes/druid.json", "[]");
    expect(findStaleIndexes(root)).toEqual(["classes"]);
    expect(writeCategoryIndexes(root)).toEqual(["classes/index.ts"]);
    expect(readFileSync(join(root, "src/data/classes/index.ts"), "utf8")).toContain(
      'import("./druid.json")',
    );
    expect(findStaleIndexes(root)).toEqual([]);
  });
});
