import { glossaryKey } from "./schema/glossary";
import type { Category } from "./schema/common";
import type { LocalizedEntry } from "./rules-data-source";

export interface LocalizationData {
  /** `glossary.es.json` fusionado: `<categoría>:<id>` -> entrada. */
  glossary: Readonly<Record<string, { es: string; verified: boolean }>>;
  /** Resúmenes de la categoría: `id` -> resumen. */
  summaries: Readonly<Record<string, { summaryEs: string; status: "draft" | "reviewed" }>>;
}

/** Une la capa SRD con la capa ES (R35). Sin glosario o resumen devuelve `null`, nunca lanza. */
export function localize<T extends { id: string }>(
  category: Category,
  entry: T,
  data: LocalizationData,
): LocalizedEntry<T> {
  const name = data.glossary[glossaryKey(category, entry.id)];
  const summary = data.summaries[entry.id];
  return {
    entry,
    nameEs: name?.es ?? null,
    nameEsVerified: name?.verified ?? false,
    summaryEs: summary?.summaryEs ?? null,
    summaryStatus: summary?.status ?? null,
  };
}
