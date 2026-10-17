import { CRB_CLASS_IDS, type Spell } from "../schema/spell";
import { SpellListsSchema } from "../schema/spell-list";
import { classifySpellFields, type SpellStructuredFields } from "../spells/fields";
import { isRecord, validEntries } from "./helpers";
import type { IntegrityIssue, IntegrityRule } from "./types";

// R21, R22: las listas de clase (`spells/lists.json`) y `spells[].levels` deben contar lo mismo.
// R92: las claves de `levels` pertenecen al catálogo CRB o son el id de un dominio (R95: una clase
// sin lista, como sorcerer o wizard, no necesita entrada en `spell-lists`).
// R96: los campos estructurados de cada conjuro coinciden con `classifySpellFields(raw)`.

const FIELDS = [
  "castingTime",
  "components",
  "range",
  "targeting",
  "duration",
  "savingThrow",
  "spellResistance",
] as const satisfies readonly (keyof SpellStructuredFields)[];

/** Serialización canónica (claves ordenadas, `undefined` omitido) para comparar objetos. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (isRecord(v)) {
      return Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    }
    return v;
  });
}

function rawOf(spell: Spell): Parameters<typeof classifySpellFields>[0] {
  return {
    castingTime: spell.castingTime.raw,
    components: spell.components.raw,
    range: spell.range.raw,
    targeting: spell.targeting,
    duration: spell.duration.raw,
    savingThrow: spell.savingThrow.raw,
    spellResistance: spell.spellResistance.raw,
  };
}

export const spellListsRule: IntegrityRule = (data, ctx) => {
  const issues: IntegrityIssue[] = [];
  const spells = validEntries(data, "spells", ctx) as readonly Spell[];

  // Claves de nivel válidas: catálogo CRB + ids de dominio (leídos sin validar, solo el `id`).
  const domainIds = new Set<string>();
  for (const domain of data.entries.domains ?? []) {
    if (isRecord(domain) && typeof domain["id"] === "string") domainIds.add(domain["id"]);
  }

  for (const spell of spells) {
    // R92
    for (const key of Object.keys(spell.levels)) {
      if (!(CRB_CLASS_IDS as readonly string[]).includes(key) && !domainIds.has(key)) {
        issues.push({
          category: "spells",
          id: spell.id,
          rule: "spells.level-key",
          message:
            `la clave de nivel "${key}" no es una clase del CRB (${CRB_CLASS_IDS.join(", ")}) ` +
            "ni el id de un dominio (¿clase de otro libro o errata?)",
        });
      }
    }
    // R96
    const expected = classifySpellFields(rawOf(spell));
    for (const field of FIELDS) {
      if (canonical(spell[field]) !== canonical(expected[field])) {
        issues.push({
          category: "spells",
          id: spell.id,
          rule: "spells.structured-field",
          message:
            `el campo ${field} no coincide con classifySpellFields(raw): ` +
            `guardado ${canonical(spell[field])}, esperado ${canonical(expected[field])}`,
        });
      }
    }
  }

  // R21 y R22: solo si ya existe `spells/lists.json`.
  if (data.spellLists === undefined) return issues;
  const parsed = SpellListsSchema.safeParse(data.spellLists);
  if (!parsed.success) return issues; // la regla `schema` informa del formato

  const allIds = new Set<string>();
  for (const raw of data.entries.spells ?? []) {
    if (isRecord(raw) && typeof raw["id"] === "string") allIds.add(raw["id"]);
  }
  const levelsById = new Map<string, Spell["levels"]>(spells.map((s) => [s.id, s.levels]));

  for (const [classId, byLevel] of Object.entries(parsed.data)) {
    const listed = new Set<string>(); // "<id>@<nivel>"
    for (const [level, ids] of Object.entries(byLevel ?? {})) {
      for (const id of ids) {
        listed.add(`${id}@${level}`);
        if (!allIds.has(id)) {
          issues.push({
            category: "spell-lists",
            id: classId,
            rule: "spell-lists.unknown-spell",
            message: `${classId}, nivel ${level}: el conjuro "${id}" no existe en spells`,
          });
        } else if (levelsById.has(id) && levelsById.get(id)![classId] !== Number(level)) {
          const declared = levelsById.get(id)![classId];
          issues.push({
            category: "spell-lists",
            id: classId,
            rule: "spell-lists.level-mismatch",
            message:
              `${classId}: la lista pone "${id}" en el nivel ${level} y spells[].levels.${classId} ` +
              `es ${declared === undefined ? "inexistente" : declared}`,
          });
        }
      }
    }
    for (const spell of spells) {
      const level = spell.levels[classId];
      if (level !== undefined && !listed.has(`${spell.id}@${level}`)) {
        issues.push({
          category: "spell-lists",
          id: classId,
          rule: "spell-lists.missing-from-list",
          message: `${classId}: "${spell.id}" tiene nivel ${level} en spells[].levels pero no figura en la lista de ese nivel`,
        });
      }
    }
  }
  return issues;
};
