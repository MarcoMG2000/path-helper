// Capa data: datasets del Core Rulebook (JSON) + schemas + validador.
// No puede importar de server ni de web (ver eslint.config.js).
export { CATEGORIES, getCategory, type CategoryDef, type EntryOf } from "./categories";
export { CATEGORY_IDS, type Category, type EntryCategory } from "./schema/common";
export type { LocalizedEntry, RulesDataSource, SpellListByLevel } from "./rules-data-source";
export { JsonRulesDataSource, DataValidationError } from "./json-rules-data-source";
export { InMemoryRulesDataSource } from "./in-memory-rules-data-source";
export { getLegalNotice, type LegalNotice } from "./legal";
