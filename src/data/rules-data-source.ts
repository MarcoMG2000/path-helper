import type { EntryOf } from "./categories";
import type { LegalNotice } from "./legal";
import type { EntryCategory } from "./schema/common";

/** Entrada de la capa SRD con la capa ES resuelta (R35). La UI decide cómo mostrar lo no verificado. */
export interface LocalizedEntry<T> {
  entry: T;
  /** Nombre en español del glosario; `null` si no hay clave (nunca lanza). */
  nameEs: string | null;
  nameEsVerified: boolean;
  /** Resumen ES; `null` si la categoría aún no lo tiene (R29 lo exige en validate, no en runtime). */
  summaryEs: string | null;
  summaryStatus: "draft" | "reviewed" | null;
}

/** Niveles de conjuro de una clase con lista: `"0".."9"` -> ids de conjuros. */
export type SpellListByLevel = Readonly<Record<string, readonly string[]>>;

/**
 * Punto de intercambio de `docs/architecture.md` §4. `get` de un id inexistente devuelve
 * `undefined` sin lanzar (R59); un fichero que no supera su schema lanza un error de
 * infraestructura que nombra fichero, id y campo (R60).
 */
export interface RulesDataSource {
  get<C extends EntryCategory>(
    category: C,
    id: string,
  ): Promise<LocalizedEntry<EntryOf<C>> | undefined>;
  list<C extends EntryCategory>(category: C): Promise<readonly LocalizedEntry<EntryOf<C>>[]>;
  /** Lista de conjuros de una clase con lista (R21); `undefined` para el resto (p. ej. `wizard`). */
  getSpellList(classId: string): Promise<SpellListByLevel | undefined>;
  getLegalNotice(): LegalNotice;
}
