/** Lo mínimo que `spellsForClass` necesita de un conjuro (acepta `Spell` completo). */
export interface SpellLevelsView {
  id: string;
  levels: Readonly<Record<string, number>>;
}

/**
 * R100: ids de los conjuros que tienen `levels[classKey]` (o, con `level`, igual a `level`),
 * ordenados por nivel y por `id`. `classKey` es cualquier clave de nivel: una clase del CRB
 * (también `sorcerer` y `wizard`, que no tienen `spell-lists`) o un dominio.
 */
export function spellsForClass(
  spells: readonly SpellLevelsView[],
  classKey: string,
  level?: number,
): string[] {
  const found: { id: string; level: number }[] = [];
  for (const spell of spells) {
    if (!Object.hasOwn(spell.levels, classKey)) continue;
    const spellLevel = spell.levels[classKey]!;
    if (level === undefined || spellLevel === level)
      found.push({ id: spell.id, level: spellLevel });
  }
  found.sort((a, b) => a.level - b.level || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return found.map((f) => f.id);
}
