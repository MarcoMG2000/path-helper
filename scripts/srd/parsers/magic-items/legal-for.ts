// Restricción de uso de las habilidades especiales (R81): `legalFor`. Solo estructura lo que el
// texto dice de forma inequívoca; lo demás queda como «restricción sin estructurar» y la entrada
// se marca `needsReview` (nunca se inventa una restricción).

export type WeaponRange = "melee" | "ranged" | "any";
export type DamageLetter = "B" | "P" | "S";

export interface WeaponLegalFor {
  range: WeaponRange;
  damageTypes?: DamageLetter[];
  weaponIds?: string[];
  raw: string;
}

export interface ArmorLegalFor {
  categories?: ("light" | "medium" | "heavy")[];
  raw: string;
}

export interface LegalResult<T> {
  legalFor: T;
  /** Motivo de revisión humana (restricción que no se sabe estructurar o que contradice el índice). */
  reviewReason?: string;
}

/** Divide en frases por punto final (tolera cierres tipográficos). */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])["”’)]*\s+(?=[A-Z(“"])/)
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

/** Frases de restricción de uso (no cualquier «only» de la descripción). */
const RESTRICTIVE =
  /\b(?:can (?:only )?be (?:placed|added)|cannot be (?:placed|added)|can't be (?:placed|added)|can have this (?:special )?ability|must be (?:a|an) (?:piercing|slashing|bludgeoning|melee|ranged)|only (?:piercing|slashing|bludgeoning)[a-z ]* weapons? can be)\b/i;

const DAMAGE_WORDS: Readonly<Record<string, DamageLetter>> = {
  piercing: "P",
  slashing: "S",
  bludgeoning: "B",
};

/** Frases que parecen restringir dónde puede ir la habilidad. */
export function restrictiveSentences(description: string): string[] {
  return splitSentences(description).filter(
    (s) => RESTRICTIVE.test(s) && /\b(weapons?|ammunition|armor|shields?)\b/i.test(s),
  );
}

/**
 * `legalFor` de una habilidad de arma. `indexRange` es la lectura independiente de los índices de
 * AoN (lista de calidades cuerpo a cuerpo / a distancia): una frase que la contradiga marca revisión.
 */
export function weaponLegalFor(
  description: string,
  indexRange: WeaponRange,
): LegalResult<WeaponLegalFor> {
  const sentences = restrictiveSentences(description).filter((s) => /\bweapons?\b/i.test(s));
  if (sentences.length === 0) return { legalFor: { range: indexRange, raw: "" } };
  const raw = sentences.join(" ");
  if (sentences.length > 1) {
    return {
      legalFor: { range: indexRange, raw },
      reviewReason: `varias frases de restricción: ${raw}`,
    };
  }
  const sentence = sentences[0]!;
  let range: WeaponRange | undefined;
  const damage: DamageLetter[] = [];
  const hasMelee = /\bmelee\b/i.test(sentence);
  const hasRanged = /\branged\b/i.test(sentence);
  const thrown = /\bthat can be thrown\b/i.test(sentence);
  if (hasMelee && !hasRanged) range = "melee";
  else if (hasRanged && !hasMelee) range = "ranged";
  else if (thrown && !hasMelee && !hasRanged) range = "ranged";
  for (const [word, letter] of Object.entries(DAMAGE_WORDS)) {
    if (new RegExp(`\\b${word}\\b`, "i").test(sentence)) damage.push(letter);
  }
  const structured =
    /^(?:This (?:special )?ability )?(?:can (?:only )?be placed (?:only )?(?:on|upon) (?:a |an )?(?:ranged |melee )?weapons?(?: that can be thrown)?|Only (?:piercing|slashing|bludgeoning)(?: or (?:piercing|slashing|bludgeoning))? melee weapons can be \w+|A \w+ weapon must be a (?:piercing|slashing|bludgeoning) melee weapon)\.?$/i.test(
      sentence,
    );
  if (range === undefined || !structured) {
    return {
      legalFor: { range: indexRange, raw },
      reviewReason: `restricción sin estructurar: ${raw}`,
    };
  }
  const legalFor: WeaponLegalFor = {
    range,
    ...(damage.length > 0 ? { damageTypes: damage.sort() } : {}),
    raw,
  };
  if (range !== indexRange) {
    return {
      legalFor,
      reviewReason: `la frase dice ${range} pero los índices de AoN clasifican la habilidad como ${indexRange}`,
    };
  }
  return { legalFor };
}

/** `legalFor` de una habilidad de armadura o escudo (categorías ligera/intermedia/pesada). */
export function armorLegalFor(description: string): LegalResult<ArmorLegalFor> {
  const sentences = restrictiveSentences(description).filter((s) =>
    /\b(armor|shield|armors|shields)\b/i.test(s),
  );
  if (sentences.length === 0) return { legalFor: { raw: "" } };
  const raw = sentences.join(" ");
  const categories: ("light" | "medium" | "heavy")[] = [];
  for (const word of ["light", "medium", "heavy"] as const) {
    if (new RegExp(`\\b${word}\\b`, "i").test(raw)) categories.push(word);
  }
  const structured =
    categories.length > 0 &&
    (/^This (?:special )?ability can (?:only )?be (?:placed|added) (?:only )?(?:on|to) (?:light|medium|heavy)(?:(?:, | or | and )(?:light|medium|heavy))* (?:armor|shields?)\.?$/i.test(
      raw,
    ) ||
      /^Only (?:light|medium|heavy)(?:(?:, | or | and )(?:light|medium|heavy))* (?:armors?|shields?) can have this (?:special )?ability\.?$/i.test(
        raw,
      ));
  if (!structured) {
    return { legalFor: { raw }, reviewReason: `restricción sin estructurar: ${raw}` };
  }
  return { legalFor: { categories, raw } };
}
