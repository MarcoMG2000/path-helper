/** Normalización de texto para comparaciones y para el `textEn` (sin HTML). */

/** Espacios, NBSP y saltos colapsados a un espacio; sin espacios en los extremos. */
export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim(); // \s ya incluye NBSP
}

/** Comillas y guiones tipográficos a ASCII; útil para comparar con otra fuente. */
export function normalizePunctuation(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...");
}

/** Tokens en minúsculas alfanuméricos (para la similitud del `--crosscheck`, R56). */
export function tokenize(text: string): string[] {
  return normalizePunctuation(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

/** Similitud de Jaccard sobre el conjunto de tokens normalizados (0..1; 1 si ambos vacíos). */
export function jaccard(a: string, b: string): number {
  const sa = new Set(tokenize(a));
  const sb = new Set(tokenize(b));
  if (sa.size === 0 && sb.size === 0) return 1;
  let inter = 0;
  for (const token of sa) if (sb.has(token)) inter++;
  return inter / (sa.size + sb.size - inter);
}
