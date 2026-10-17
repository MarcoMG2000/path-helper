import type { AnyNode } from "domhandler";
import { CRB_SOURCE_REF_PREFIX } from "../../../src/data/schema/common";
import type { AbilityType } from "../../../src/data/schema/class-feature";
import { collapseWhitespace } from "../lib/text";

// Utilidades compartidas por los parsers del Lote A (classes, class-features, domains). Puras.

export function isCrbLabel(label: string): boolean {
  return label.startsWith(CRB_SOURCE_REF_PREFIX);
}

/** Etiqueta CRB de una lista de etiquetas de fuente; `undefined` si no hay ninguna. */
export function crbLabelOf(labels: readonly string[]): string | undefined {
  return labels.find(isCrbLabel);
}

/** Nombre de libro de una etiqueta (`Chronicle of Legends pg. 28` -> `Chronicle of Legends`). */
export function bookOfLabel(label: string): string {
  return label.replace(/\s+pg\.\s*\d+.*$/i, "").trim();
}

export interface NameWithMarker {
  name: string;
  abilityType: AbilityType;
}

/** `Smite Evil (Su)` -> { name: "Smite Evil", abilityType: "Su" }; sin marcador -> null. */
export function splitMarker(raw: string): NameWithMarker {
  const text = collapseWhitespace(raw);
  const match = /^(.*?)\s*\((Ex|Su|Sp)\)$/.exec(text);
  if (match) return { name: match[1]!.trim(), abilityType: match[2] as "Ex" | "Su" | "Sp" };
  return { name: text, abilityType: null };
}

/** Quita el `:` inicial que deja la etiqueta en negrita (`: At 1st level...`). */
export function stripLeadingColon(markdown: string): string {
  return markdown.replace(/^\s*:\s*/, "").trim();
}

/**
 * Elimina las notas editoriales de Archives of Nethys (`Note from Nethys: ...`), que no son texto
 * del SRD. Devuelve el Markdown sin ellas y cuántas se quitaron.
 */
export function removeNethysNotes(markdown: string): { markdown: string; removed: number } {
  let removed = 0;
  const kept = markdown.split(/\n{2,}/).filter((block) => {
    if (/^\*Note from Nethys\*/.test(block.trim())) {
      removed++;
      return false;
    }
    return true;
  });
  return { markdown: kept.join("\n\n").trim(), removed };
}

/** Primer `Nth level` de un texto (`At 8th level`, `A 1st-level bard`...); `undefined` si no hay. */
export function firstLevelMention(text: string): number | undefined {
  const match = /\b(\d{1,2})(?:st|nd|rd|th)(?:[- ]level)\b/i.exec(text);
  if (!match) return undefined;
  const level = Number(match[1]);
  return level >= 1 && level <= 20 ? level : undefined;
}

/** Divide por comas que no están dentro de paréntesis. */
export function splitTopLevelCommas(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      out.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim() !== "") out.push(current.trim());
  return out.filter((s) => s !== "");
}

/** Último segmento de un id con puntos (`rogue.talent.bleeding-attack` -> `bleeding-attack`). */
export function lastSegment(id: string): string {
  return id.split(".").at(-1)!;
}

// --- recorrido de nodos hermanos --------------------------------------------------------------

function isBlankText(node: AnyNode): boolean {
  return node.type === "text" && node.data.trim() === "";
}

function prevSignificant(nodes: readonly AnyNode[], index: number): number {
  let i = index - 1;
  while (i >= 0 && isBlankText(nodes[i]!)) i--;
  return i;
}

function isTag(node: AnyNode | undefined, ...names: string[]): boolean {
  return node !== undefined && node.type === "tag" && names.includes(node.name);
}

/**
 * Verdadero si el nodo abre un párrafo: es el primero, o lo precede un salto doble, una tabla
 * (+ un salto) o un encabezado. Distingue `<b>Etiqueta</b>:` de cabecera de las negritas del texto.
 */
export function isParagraphStart(nodes: readonly AnyNode[], index: number): boolean {
  const p1 = prevSignificant(nodes, index);
  if (p1 < 0) return true;
  const prev = nodes[p1];
  if (isTag(prev, "table", "div", "h1", "h2", "h3", "h4", "h5", "h6")) return true;
  if (!isTag(prev, "br")) return false;
  const p2 = prevSignificant(nodes, p1);
  if (p2 < 0) return true;
  return isTag(nodes[p2], "br", "table", "div", "h1", "h2", "h3", "h4", "h5", "h6");
}

/** El nodo siguiente es texto que empieza por `:` seguido de contenido (no un `:` suelto). */
export function followedByColonText(nodes: readonly AnyNode[], index: number): boolean {
  const next = nodes[index + 1];
  return next !== undefined && next.type === "text" && /^\s*:\s*\S/.test(next.data);
}
