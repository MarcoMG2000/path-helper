import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// Helper de comparación con los valores de referencia de conjuros (`spell-golden.json`, R20) que
// usan los tests de los lotes D1-D5. Compara solo claves de nivel CRB: las demás no existen en los
// datos importados (R97).

export const SpellGoldenSchema = z.strictObject({
  name: z.string(),
  school: z.string(),
  subschool: z.string().optional(),
  levels: z.record(z.string(), z.number().int()),
  /** Claves de nivel CRB que el conjuro NO debe tener (p. ej. sorcerer/wizard en Cure Light Wounds). */
  absentLevelKeys: z.array(z.string()).optional(),
  castingTime: z.strictObject({ unit: z.string(), amount: z.number() }).optional(),
  savingThrow: z
    .strictObject({
      kind: z.string(),
      effect: z.string().optional(),
      harmless: z.boolean().optional(),
    })
    .optional(),
  spellResistance: z
    .strictObject({ applies: z.string(), harmless: z.boolean().optional() })
    .optional(),
  components: z.strictObject({ material: z.boolean(), rawContains: z.string() }).optional(),
  /** Pertenencia a dominios: la comprueba el Lote Z contra `domains`. */
  domainNames: z.array(z.string()).optional(),
  domainsNote: z.string().optional(),
});
export type SpellGolden = z.infer<typeof SpellGoldenSchema>;

const GoldenFileSchema = z.record(z.string(), z.unknown());

export function loadSpellGoldens(): Record<string, SpellGolden> {
  const path = fileURLToPath(new URL("../fixtures/spell-golden.json", import.meta.url));
  const file = GoldenFileSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  const out: Record<string, SpellGolden> = {};
  for (const [id, value] of Object.entries(file)) {
    if (id.startsWith("_")) continue;
    out[id] = SpellGoldenSchema.parse(value);
  }
  return out;
}

/** Ids con golden cuya inicial cae en `[from, to]` (rango de un lote de conjuros). */
export function goldenIdsInRange(
  goldens: Record<string, SpellGolden>,
  from: string,
  to: string,
): string[] {
  return Object.keys(goldens)
    .filter((id) => id[0]! >= from && id[0]! <= to)
    .sort();
}

type Rec = Record<string, unknown>;
const rec = (value: unknown): Rec =>
  typeof value === "object" && value !== null ? (value as Rec) : {};

/**
 * Compara un conjuro con su golden y devuelve las diferencias (vacío = coincide). No lanza: el
 * llamador decide si una diferencia es un fallo o una discrepancia con la fuente para anotar.
 */
export function compareSpellToGolden(spell: unknown, golden: SpellGolden): string[] {
  const s = rec(spell);
  const diffs: string[] = [];
  const check = (label: string, actual: unknown, expected: unknown): void => {
    if (actual !== expected) {
      diffs.push(`${label}: esperado ${JSON.stringify(expected)}, hay ${JSON.stringify(actual)}`);
    }
  };
  check("name", s["name"], golden.name);
  check("school", s["school"], golden.school);
  check("subschool", s["subschool"], golden.subschool);
  const levels = rec(s["levels"]);
  for (const [key, level] of Object.entries(golden.levels))
    check(`levels.${key}`, levels[key], level);
  for (const key of golden.absentLevelKeys ?? []) {
    if (Object.hasOwn(levels, key))
      diffs.push(`levels.${key}: no debería existir (hay ${String(levels[key])})`);
  }
  if (golden.castingTime) {
    const c = rec(s["castingTime"]);
    check("castingTime.unit", c["unit"], golden.castingTime.unit);
    check("castingTime.amount", c["amount"], golden.castingTime.amount);
  }
  if (golden.savingThrow) {
    const t = rec(s["savingThrow"]);
    check("savingThrow.kind", t["kind"], golden.savingThrow.kind);
    if (golden.savingThrow.effect !== undefined)
      check("savingThrow.effect", t["effect"], golden.savingThrow.effect);
    if (golden.savingThrow.harmless !== undefined)
      check("savingThrow.harmless", t["harmless"], golden.savingThrow.harmless);
  }
  if (golden.spellResistance) {
    const r = rec(s["spellResistance"]);
    check("spellResistance.applies", r["applies"], golden.spellResistance.applies);
    if (golden.spellResistance.harmless !== undefined) {
      check("spellResistance.harmless", r["harmless"], golden.spellResistance.harmless);
    }
  }
  if (golden.components) {
    const c = rec(s["components"]);
    check("components.material", c["material"], golden.components.material);
    if (typeof c["raw"] !== "string" || !c["raw"].includes(golden.components.rawContains)) {
      diffs.push(`components.raw no contiene "${golden.components.rawContains}"`);
    }
  }
  return diffs;
}
