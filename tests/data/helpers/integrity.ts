import { BaseEntrySchema, CATEGORY_IDS, type Category } from "../../../src/data/schema/common";
import {
  defaultContext,
  emptyDataset,
  type IntegrityContext,
  type LoadedDataset,
} from "../../../src/data/integrity/types";

/** Contexto en el que toda categoría usa el schema base (independiente de los stubs de los lotes). */
export function baseContext(extra: Partial<IntegrityContext> = {}): IntegrityContext {
  const schemas: Partial<Record<Category, typeof BaseEntrySchema>> = {};
  for (const id of CATEGORY_IDS) schemas[id] = BaseEntrySchema;
  return { ...defaultContext(), schemas, ...extra };
}

export function dataset(partial: Partial<LoadedDataset> = {}): LoadedDataset {
  return { ...emptyDataset(), ...partial };
}
