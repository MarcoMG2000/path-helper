import { z } from "zod";

// Correcciones manuales sobre la capa SRD (R49).
export const OverrideSchema = z.strictObject({
  id: z.string().min(1),
  field: z.string().min(1), // ruta con puntos; los índices de array son números (`table.3.special`)
  value: z.unknown(),
  reason: z.string().min(1),
  evidence: z.string().min(1),
});
export type Override = z.infer<typeof OverrideSchema>;

export const OverrideFileSchema = z.array(OverrideSchema);

export function getAtPath(target: unknown, path: string): unknown {
  let current: unknown = target;
  for (const segment of path.split(".")) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** Escribe `value` en `path` (crea objetos intermedios). Devuelve false si el camino es inválido. */
export function setAtPath(target: unknown, path: string, value: unknown): boolean {
  const parts = path.split(".");
  let current: unknown = target;
  for (const part of parts.slice(0, -1)) {
    if (typeof current !== "object" || current === null) return false;
    const record = current as Record<string, unknown>;
    if (record[part] === undefined) record[part] = {};
    current = record[part];
  }
  const last = parts[parts.length - 1];
  if (last === undefined || typeof current !== "object" || current === null) return false;
  (current as Record<string, unknown>)[last] = value;
  return true;
}

/** Igualdad estructural de JSON (el orden de las claves es irrelevante). */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) =>
    jsonEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}
