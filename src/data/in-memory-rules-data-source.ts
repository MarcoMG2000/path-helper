import type { EntryOf } from "./categories";
import { getLegalNotice, type LegalNotice } from "./legal";
import { localize, type LocalizationData } from "./localize";
import type { LocalizedEntry, RulesDataSource, SpellListByLevel } from "./rules-data-source";
import type { Category, EntryCategory } from "./schema/common";

export interface InMemoryData {
  entries?: Partial<Record<EntryCategory, readonly { id: string }[]>>;
  spellLists?: Readonly<Record<string, SpellListByLevel>>;
  glossary?: LocalizationData["glossary"];
  summaries?: Partial<Record<Category, LocalizationData["summaries"]>>;
  legalNotice?: LegalNotice;
}

/** Fake para f4/f6/f8 y tests: no valida ni toca disco (R58). */
export class InMemoryRulesDataSource implements RulesDataSource {
  constructor(private readonly data: InMemoryData = {}) {}

  private localized<C extends EntryCategory>(category: C): LocalizedEntry<EntryOf<C>>[] {
    const loc = {
      glossary: this.data.glossary ?? {},
      summaries: this.data.summaries?.[category] ?? {},
    };
    return (this.data.entries?.[category] ?? []).map(
      (entry) => localize(category, entry, loc) as LocalizedEntry<EntryOf<C>>,
    );
  }

  async get<C extends EntryCategory>(
    category: C,
    id: string,
  ): Promise<LocalizedEntry<EntryOf<C>> | undefined> {
    return this.localized(category).find((item) => (item.entry as { id: string }).id === id);
  }

  async list<C extends EntryCategory>(category: C): Promise<readonly LocalizedEntry<EntryOf<C>>[]> {
    return this.localized(category);
  }

  async getSpellList(classId: string): Promise<SpellListByLevel | undefined> {
    return this.data.spellLists?.[classId];
  }

  getLegalNotice(): LegalNotice {
    return this.data.legalNotice ?? getLegalNotice();
  }
}
