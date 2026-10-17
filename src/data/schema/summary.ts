import { z } from "zod";

// Capa ES: resúmenes por id de entrada (R28). Viven aparte de la capa SRD.
export const SUMMARY_MAX_LENGTH = 300;

export const SummaryEntrySchema = z.strictObject({
  summaryEs: z.string().min(1).max(SUMMARY_MAX_LENGTH),
  status: z.enum(["draft", "reviewed"]),
});
export type SummaryEntry = z.infer<typeof SummaryEntrySchema>;

export const SummaryFileSchema = z.record(z.string(), SummaryEntrySchema);
export type SummaryFile = z.infer<typeof SummaryFileSchema>;

const NUMERIC_TOKEN = /\d+d\d+|[+\-−–]\d+|\d+/g;

function normalize(text: string): string {
  return text.replace(/[−–]/g, "-");
}

export function numericTokens(text: string): string[] {
  return normalize(text).match(NUMERIC_TOKEN) ?? [];
}

/**
 * R30: toda cifra, dado o modificador del resumen debe aparecer en el `textEn`.
 * Un `+N` del resumen se acepta si el texto trae `+N` o el número `N` sin signo;
 * un `-N` exige `-N`. Devuelve los tokens del resumen que no aparecen (vacío = correcto).
 */
export function checkNumericFidelity(summaryEs: string, textEn: string): string[] {
  const inText = numericTokens(textEn);
  const exact = new Set(inText);
  const unsigned = new Set(inText.filter((t) => /^\d/.test(t)));
  return numericTokens(summaryEs).filter((token) => {
    if (exact.has(token)) return false;
    if (token.startsWith("+") && unsigned.has(token.slice(1))) return false;
    return true;
  });
}
