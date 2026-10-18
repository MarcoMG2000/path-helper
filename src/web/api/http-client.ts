import type { z } from "zod";
import { err, ok, type ErrorCode, type Result } from "../../shared";
import { errorBodySchema } from "./schemas";

export type ClientErrorCode = ErrorCode | "network" | "unexpected";

export interface ApiError {
  /** 0 = no hubo respuesta (red). */
  status: number;
  code: ClientErrorCode;
  /** Solo en 429 con `Retry-After` entero positivo. */
  retryAfterSeconds?: number;
}

export type ApiResult<T> = Result<T, ApiError>;

export interface RequestSpec<T> {
  method: "GET" | "POST" | "PUT" | "PATCH";
  /** Ruta absoluta bajo "/api". */
  path: string;
  /** Se serializa a JSON (R9). */
  body?: unknown;
  /** Schema del cuerpo de éxito; `null` = se espera 204 sin cuerpo. */
  schema: z.ZodType<T> | null;
}

export interface HttpClient {
  request<T>(spec: RequestSpec<T>): Promise<ApiResult<T>>;
}

export interface HttpClientDeps {
  /** Por defecto se lee `globalThis.fetch` en cada llamada (los tests unitarios lo prohíben). */
  fetchFn?: typeof fetch;
  /** "" = mismo origen; los tests de integración pasan la URL del servidor. */
  baseUrl?: string;
  /** 401 con código `unauthenticated` (R8). */
  onUnauthenticated?: () => void;
}

// Un único punto de red hacia /api (R1): nunca lanza (R6), devuelve Result.
export function createHttpClient(deps: HttpClientDeps = {}): HttpClient {
  const baseUrl = deps.baseUrl ?? "";

  async function request<T>(spec: RequestSpec<T>): Promise<ApiResult<T>> {
    const fetchFn = deps.fetchFn ?? ((input, init) => globalThis.fetch(input, init));
    const headers: Record<string, string> = { Accept: "application/json" };
    const init: RequestInit = { method: spec.method, headers, credentials: "same-origin" };
    if (spec.body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(spec.body);
    }

    let response: Response;
    try {
      response = await fetchFn(`${baseUrl}${spec.path}`, init);
    } catch {
      return err({ status: 0, code: "network" });
    }

    if (response.ok) return readSuccess(response, spec.schema);
    return readFailure(response, deps.onUnauthenticated);
  }

  return { request };
}

async function readSuccess<T>(
  response: Response,
  schema: z.ZodType<T> | null,
): Promise<ApiResult<T>> {
  if (schema === null) return ok(undefined as T);
  try {
    const parsed = schema.safeParse(await response.json());
    if (parsed.success) return ok(parsed.data);
  } catch {
    // cuerpo ilegible: se trata como inesperado
  }
  return err({ status: response.status, code: "unexpected" });
}

async function readFailure(
  response: Response,
  onUnauthenticated: (() => void) | undefined,
): Promise<ApiResult<never>> {
  let code: ClientErrorCode = "unexpected";
  try {
    const parsed = errorBodySchema.safeParse(await response.json());
    if (parsed.success) code = parsed.data.error.code;
  } catch {
    // sin cuerpo de error válido
  }

  const error: ApiError = { status: response.status, code };
  if (response.status === 429) {
    const seconds = parseRetryAfter(response.headers.get("Retry-After"));
    if (seconds !== undefined) error.retryAfterSeconds = seconds;
  }
  if (response.status === 401 && code === "unauthenticated") onUnauthenticated?.();
  return err(error);
}

function parseRetryAfter(header: string | null): number | undefined {
  if (header === null || !/^\d+$/.test(header)) return undefined;
  const seconds = Number(header);
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : undefined;
}
