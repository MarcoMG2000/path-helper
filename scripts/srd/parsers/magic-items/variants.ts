import { slugify } from "../../../../src/data/schema/common";

// Variantes de precio (R68, R69) y nivel de lanzador de un objeto mágico.

export interface ParsedVariant {
  variantId: string;
  label: string;
  priceRaw: string;
  priceCp: number | null;
  bonusEquivalent?: number;
}

const COIN_CP: Readonly<Record<string, number>> = { gp: 100, sp: 10, cp: 1 };

/** «2,000 gp» -> 200000 (piezas de cobre). `undefined` si no es una cantidad entera de monedas. */
export function parseCoins(text: string): number | undefined {
  const match = /^(\d{1,3}(?:,\d{3})*|\d+)(\.\d+)?\s*(gp|sp|cp)\s*$/i.exec(text.trim());
  if (!match) return undefined;
  const amount = Number(match[1]!.replace(/,/g, "") + (match[2] ?? ""));
  const cp = amount * COIN_CP[match[3]!.toLowerCase()]!;
  return Number.isInteger(cp) ? cp : undefined;
}

/** Trozos separados por «, » fuera de paréntesis (los miles llevan coma sin espacio). */
export function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0 && text[i + 1] === " ") {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts.filter((p) => p !== "");
}

/** `+1` -> `plus-1`; el resto, slug del texto (`type i` -> `type-i`, `13` -> `13`). */
export function variantIdOf(label: string): string {
  const plus = /^\+\s*(\d+)$/.exec(label.trim());
  if (plus) return `plus-${plus[1]}`;
  return slugify(label);
}

const bonusOf = (text: string): number | undefined => {
  const match = /^\+\s*(\d+) bonus$/i.exec(text.trim());
  return match ? Number(match[1]) : undefined;
};

/**
 * Descompone el campo `Price` en variantes. Formas reconocidas (todas vistas en la fuente):
 * `N gp`, `+N bonus`, `+N gp` (sobreprecio fijo), `—`/vacío, `N gp (etiqueta)`, `etiqueta (N gp)`,
 * `etiqueta (+N bonus)`. Cualquier otra forma detiene el parseo (falla cerrado).
 */
export function parsePriceVariants(priceRaw: string, page: string): ParsedVariant[] {
  const raw = priceRaw.trim();
  if (raw === "" || raw === "—" || raw === "-") {
    return [{ variantId: "default", label: "default", priceRaw, priceCp: null }];
  }
  const asBonus = bonusOf(raw);
  if (asBonus !== undefined) {
    return [
      { variantId: "default", label: "default", priceRaw, priceCp: null, bonusEquivalent: asBonus },
    ];
  }
  const plusCoins = /^\+\s*(.+)$/.exec(raw);
  const single = parseCoins(plusCoins ? plusCoins[1]! : raw);
  if (single !== undefined) {
    return [{ variantId: "default", label: "default", priceRaw, priceCp: single }];
  }

  const variants: ParsedVariant[] = [];
  for (const token of splitTopLevel(raw)) {
    let label: string | undefined;
    let priceCp: number | null = null;
    let bonus: number | undefined;
    let m = /^(.+?)\s*\(\s*(\d[\d,]*(?:\.\d+)?\s*(?:gp|sp|cp))\s*\)$/i.exec(token);
    if (m && parseCoins(m[2]!) !== undefined && parseCoins(m[1]!) === undefined) {
      label = m[1]!.trim();
      priceCp = parseCoins(m[2]!)!;
    } else if ((m = /^(.+?)\s*\(\s*(\+\s*\d+ bonus)\s*\)$/i.exec(token))) {
      label = m[1]!.trim();
      bonus = bonusOf(m[2]!);
    } else if ((m = /^(\d[\d,]*(?:\.\d+)?\s*(?:gp|sp|cp))\s*\(\s*(.+?)\s*\)$/i.exec(token))) {
      const cp = parseCoins(m[1]!);
      if (cp !== undefined) {
        label = m[2]!.trim();
        priceCp = cp;
      }
    }
    if (label === undefined) {
      throw new Error(`${page}: precio no reconocido "${token}" en «${priceRaw}»`);
    }
    variants.push({
      variantId: variantIdOf(label),
      label,
      priceRaw: token,
      priceCp,
      ...(bonus === undefined ? {} : { bonusEquivalent: bonus }),
    });
  }
  const seen = new Set<string>();
  for (const v of variants) {
    if (v.variantId === "" || seen.has(v.variantId)) {
      throw new Error(
        `${page}: etiqueta de variante repetida o vacía "${v.label}" en «${priceRaw}»`,
      );
    }
    seen.add(v.variantId);
  }
  return variants;
}

const ORDINAL = /^(\d+)(?:st|nd|rd|th)$/i;

/**
 * Nivel de lanzador por variante. `CL 12th` -> igual para todas; `7th (lesser), 11th (normal)` ->
 * por etiqueta; `varies`/vacío -> `null`. Devuelve una función etiqueta -> nivel.
 */
export function casterLevels(clRaw: string): {
  forLabel: (label: string, single: boolean) => number | null;
  structured: boolean;
} {
  const raw = clRaw.trim();
  const direct = ORDINAL.exec(raw);
  if (direct) {
    const level = Number(direct[1]);
    return { forLabel: () => level, structured: true };
  }
  const byLabel = new Map<string, number>();
  for (const token of splitTopLevel(raw)) {
    const m = /^(\d+)(?:st|nd|rd|th)\s*\(\s*(.+?)\s*\)$/i.exec(token);
    if (!m) return { forLabel: () => null, structured: raw === "" || /^varies$/i.test(raw) };
    byLabel.set(m[2]!.toLowerCase(), Number(m[1]));
  }
  return { forLabel: (label) => byLabel.get(label.toLowerCase()) ?? null, structured: true };
}

/** `1 lb.` -> 1, `1/2 lb.` -> 0.5, `—` -> null. `undefined` si no se sabe leer (se informa). */
export function parseWeightLb(weightRaw: string): number | null | undefined {
  const raw = weightRaw.trim();
  if (raw === "" || raw === "—" || raw === "-") return null;
  const m = /^(?:(\d+)[\s-]+)?(\d+)\/(\d+)\s*lbs?\.?$/i.exec(raw);
  if (m) return Number(m[1] ?? 0) + Number(m[2]) / Number(m[3]);
  const n = /^(\d{1,3}(?:,\d{3})*|\d+)(\.\d+)?\s*lbs?\.?$/i.exec(raw);
  if (n) return Number(n[1]!.replace(/,/g, "") + (n[2] ?? ""));
  return undefined;
}
