import { collapseWhitespace } from "./text";

/** R45: encabezado fuera de la lista permitida de la categoría. */
export class SectionError extends Error {
  constructor(
    readonly page: string,
    readonly heading: string,
  ) {
    super(`encabezado no permitido "${heading}" en la página ${page}`);
  }
}

function norm(heading: string): string {
  return collapseWhitespace(heading).toLowerCase();
}

/**
 * Comprueba los encabezados de una página contra la lista permitida (sin distinguir mayúsculas).
 * Falla en el primero desconocido, nombrando la página y el encabezado (R45).
 */
export function assertAllowedHeadings(
  page: string,
  headings: readonly string[],
  allowed: readonly string[],
): void {
  const ok = new Set(allowed.map(norm));
  for (const heading of headings) {
    if (heading.trim() === "") continue;
    if (!ok.has(norm(heading))) throw new SectionError(page, heading);
  }
}
