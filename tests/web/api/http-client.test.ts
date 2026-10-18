import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createHttpClient } from "../../../src/web/api/http-client";
import { ERROR_CODES } from "../../../src/web/api/schemas";
import { errorResponse, headersOf, makeFakeFetch } from "../helpers/fake-fetch";

const itemSchema = z.object({ id: z.string() });

function get(client: ReturnType<typeof createHttpClient>) {
  return client.request({ method: "GET", path: "/api/x", schema: itemSchema });
}

describe("createHttpClient", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("R2: 2xx con cuerpo válido devuelve ok(valor)", async () => {
    const { fetchFn } = makeFakeFetch(Response.json({ id: "a", extra: 1 }));
    const result = await get(createHttpClient({ fetchFn }));
    expect(result).toEqual({ ok: true, value: { id: "a" } });
  });

  it("R2: 204 con schema null devuelve ok(undefined)", async () => {
    const { fetchFn } = makeFakeFetch(new Response(null, { status: 204 }));
    const result = await createHttpClient({ fetchFn }).request({
      method: "POST",
      path: "/api/x",
      schema: null,
    });
    expect(result).toEqual({ ok: true, value: undefined });
  });

  it("R3: 2xx con cuerpo que no cumple el schema devuelve unexpected con el status", async () => {
    const { fetchFn } = makeFakeFetch(Response.json({ id: 3 }, { status: 201 }));
    const result = await get(createHttpClient({ fetchFn }));
    expect(result).toEqual({ ok: false, error: { status: 201, code: "unexpected" } });
  });

  it("R3: 2xx con cuerpo que no es JSON devuelve unexpected", async () => {
    const { fetchFn } = makeFakeFetch(new Response("<html>", { status: 200 }));
    const result = await get(createHttpClient({ fetchFn }));
    expect(result).toEqual({ ok: false, error: { status: 200, code: "unexpected" } });
  });

  it.each(ERROR_CODES)("R4: el código de error %s se conserva con el status", async (code) => {
    const { fetchFn } = makeFakeFetch(errorResponse(418, code));
    const result = await get(createHttpClient({ fetchFn }));
    expect(result).toEqual({ ok: false, error: { status: 418, code } });
  });

  it("R4: la tabla cubre todos los ErrorCode de shared", () => {
    expect([...ERROR_CODES].sort()).toEqual(
      [
        "bad_origin",
        "cannot_disable_gm",
        "forbidden",
        "gm_exists",
        "internal_error",
        "invalid_credentials",
        "invalid_current_pin",
        "locked",
        "name_taken",
        "not_found",
        "unauthenticated",
        "validation_error",
      ].sort(),
    );
  });

  it("R5: un error sin cuerpo válido o con código desconocido devuelve unexpected", async () => {
    for (const response of [
      new Response("boom", { status: 500 }),
      Response.json({ nope: true }, { status: 400 }),
      errorResponse(400, "codigo_inventado"),
      Response.json({ error: { code: "locked" } }, { status: 429 }),
    ]) {
      const { fetchFn } = makeFakeFetch(response);
      const result = await get(createHttpClient({ fetchFn }));
      expect(result).toMatchObject({ ok: false, error: { code: "unexpected" } });
    }
  });

  it("R6: un fallo de fetch devuelve network con status 0 sin lanzar", async () => {
    const { fetchFn } = makeFakeFetch(new TypeError("fetch failed"));
    const result = await get(createHttpClient({ fetchFn }));
    expect(result).toEqual({ ok: false, error: { status: 0, code: "network" } });
  });

  it("R7: 429 con Retry-After entero positivo incluye retryAfterSeconds", async () => {
    const { fetchFn } = makeFakeFetch(errorResponse(429, "locked", { "Retry-After": "900" }));
    const result = await get(createHttpClient({ fetchFn }));
    expect(result).toEqual({
      ok: false,
      error: { status: 429, code: "locked", retryAfterSeconds: 900 },
    });
  });

  it.each(["", "0", "-5", "abc", "1.5", "Wed, 21 Oct 2026 07:28:00 GMT"])(
    "R7: Retry-After %j no se incluye",
    async (header) => {
      const headers: Record<string, string> = header === "" ? {} : { "Retry-After": header };
      const { fetchFn } = makeFakeFetch(errorResponse(429, "locked", headers));
      const result = await get(createHttpClient({ fetchFn }));
      expect(result).toEqual({ ok: false, error: { status: 429, code: "locked" } });
    },
  );

  it("R7: Retry-After en una respuesta que no es 429 se ignora", async () => {
    const { fetchFn } = makeFakeFetch(
      errorResponse(503, "internal_error", { "Retry-After": "30" }),
    );
    const result = await get(createHttpClient({ fetchFn }));
    expect(result).toEqual({ ok: false, error: { status: 503, code: "internal_error" } });
  });

  it("R8: 401 unauthenticated invoca onUnauthenticated una vez", async () => {
    const onUnauthenticated = vi.fn();
    const { fetchFn } = makeFakeFetch(errorResponse(401, "unauthenticated"));
    const result = await get(createHttpClient({ fetchFn, onUnauthenticated }));
    expect(result).toMatchObject({ ok: false, error: { status: 401, code: "unauthenticated" } });
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
  });

  it("R8: 401 invalid_credentials y otros errores no invocan onUnauthenticated", async () => {
    const onUnauthenticated = vi.fn();
    for (const response of [
      errorResponse(401, "invalid_credentials"),
      errorResponse(403, "forbidden"),
      new Response("x", { status: 401 }),
    ]) {
      const { fetchFn } = makeFakeFetch(response);
      await get(createHttpClient({ fetchFn, onUnauthenticated }));
    }
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });

  it("R9: con cuerpo envía JSON y Content-Type; sin cuerpo no envía ninguno", async () => {
    const fake = makeFakeFetch(new Response(null, { status: 204 }));
    const client = createHttpClient({ fetchFn: fake.fetchFn });
    await client.request({ method: "PUT", path: "/api/x", body: { a: 1 }, schema: null });
    await client.request({ method: "POST", path: "/api/x", schema: null });
    const [withBody, withoutBody] = fake.calls;
    expect(withBody?.init.body).toBe('{"a":1}');
    expect(headersOf(withBody!.init)["content-type"]).toBe("application/json");
    expect(withoutBody?.init.body).toBeUndefined();
    expect(headersOf(withoutBody!.init)).not.toHaveProperty("content-type");
  });

  it("R10: credentials same-origin y sin Authorization", async () => {
    const fake = makeFakeFetch(Response.json({ id: "a" }));
    await get(createHttpClient({ fetchFn: fake.fetchFn }));
    const init = fake.calls[0]!.init;
    expect(init.credentials).toBe("same-origin");
    expect(Object.keys(headersOf(init)).sort()).toEqual(["accept"]);
  });

  it("R10: no lee almacenamiento ni cookies del documento", async () => {
    const fake = makeFakeFetch(Response.json({ id: "a" }));
    const stubs = vi.stubGlobal("localStorage", {
      getItem: vi.fn(),
      setItem: vi.fn(),
    });
    try {
      await get(createHttpClient({ fetchFn: fake.fetchFn }));
      const storage = globalThis.localStorage as unknown as { getItem: ReturnType<typeof vi.fn> };
      expect(storage.getItem).not.toHaveBeenCalled();
    } finally {
      stubs.unstubAllGlobals();
    }
  });

  it("R1: añade baseUrl a la ruta y usa el método indicado", async () => {
    const fake = makeFakeFetch(Response.json({ id: "a" }));
    await get(createHttpClient({ fetchFn: fake.fetchFn, baseUrl: "http://127.0.0.1:9" }));
    expect(fake.calls[0]?.url).toBe("http://127.0.0.1:9/api/x");
    expect(fake.calls[0]?.init.method).toBe("GET");
  });

  it("R6: sin fetchFn inyectado lee globalThis.fetch en cada llamada", async () => {
    const client = createHttpClient();
    // El setup de no-network hace que el fetch real lance: se convierte en `network`.
    expect(await get(client)).toEqual({ ok: false, error: { status: 0, code: "network" } });
    globalThis.fetch = (async () => Response.json({ id: "tarde" })) as typeof fetch;
    expect(await get(client)).toEqual({ ok: true, value: { id: "tarde" } });
  });
});
