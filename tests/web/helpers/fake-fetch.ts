// `fetch` falso que registra las llamadas y devuelve respuestas preparadas (patrón de health.test.ts).
export interface RecordedCall {
  url: string;
  init: RequestInit;
}

export interface FakeFetch {
  fetchFn: typeof fetch;
  calls: RecordedCall[];
}

type Planned = Response | Error;

/** Cada llamada consume la siguiente respuesta; la última se repite si se agotan. */
export function makeFakeFetch(...planned: Planned[]): FakeFetch {
  const calls: RecordedCall[] = [];
  let index = 0;
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    const next = planned[Math.min(index, planned.length - 1)];
    index += 1;
    if (next === undefined) throw new Error("fake-fetch sin respuestas preparadas");
    if (next instanceof Error) throw next;
    return next.clone();
  }) as typeof fetch;
  return { fetchFn, calls };
}

export function headersOf(init: RequestInit): Record<string, string> {
  const result: Record<string, string> = {};
  new Headers(init.headers).forEach((value, name) => {
    result[name.toLowerCase()] = value;
  });
  return result;
}

export function errorResponse(
  status: number,
  code: string,
  extraHeaders: Record<string, string> = {},
): Response {
  return Response.json(
    { error: { code, message: "mensaje del servidor" } },
    {
      status,
      headers: extraHeaders,
    },
  );
}
