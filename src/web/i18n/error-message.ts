import type { ApiError } from "../api/http-client";
import { es } from "./es";
import { formatWait } from "./format";

/** Mensaje en español de un error de la API (la UI usa `code`, nunca el `message` del servidor). */
export function errorMessage(error: Pick<ApiError, "code" | "retryAfterSeconds">): string {
  const text = es.errors[error.code];
  return typeof text === "function" ? text(formatWait(error.retryAfterSeconds)) : text;
}
