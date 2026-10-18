import { es } from "./es";

/** El español solo distingue 1 / resto: no hace falta ICU. */
export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function count(n: number, [one, many]: readonly [string, string]): string {
  return `${n} ${plural(n, one, many)}`;
}

// R46: minutos redondeados hacia arriba (mínimo 1); desde 60 minutos, horas y minutos restantes.
export function formatWait(seconds?: number): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return es.wait.unknown;
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  if (minutes < 60) return count(minutes, es.wait.minute);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hoursText = count(hours, es.wait.hour);
  return rest === 0 ? hoursText : `${hoursText} ${es.wait.and} ${count(rest, es.wait.minute)}`;
}
