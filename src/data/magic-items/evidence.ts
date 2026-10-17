// Comprobación de las evidencias de los efectos (R75): la frase literal debe contener el valor
// absoluto del efecto (o los dados). Una evidencia con rango («+1 to +5») o lista («+2, +4, or +6»)
// contiene el valor si este queda dentro del rango o aparece en la lista.

const DASHES = /[−–]/g;

function numbersOf(text: string): number[] {
  return (text.replace(DASHES, "-").match(/\d+/g) ?? []).map(Number);
}

/** `true` si `evidence` contiene `|value|` como número, o un rango «A to B» que lo incluye. */
export function evidenceContainsValue(evidence: string, value: number): boolean {
  const target = Math.abs(value);
  const text = evidence.replace(DASHES, "-");
  if (numbersOf(text).includes(target)) return true;
  const range = /(\d+)\s*(?:to|-)\s*[+-]?\s*(\d+)/gi;
  for (const m of text.matchAll(range)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a <= target && target <= b) return true;
  }
  return false;
}

/** `true` si `evidence` contiene los dados (`1d6`) tal cual. */
export function evidenceContainsDice(evidence: string, dice: string): boolean {
  return evidence.includes(dice);
}
