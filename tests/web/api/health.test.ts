import { describe, expect, it } from "vitest";
import { fetchHealth } from "../../../src/web/api/health";

const fakeFetch = (response: Response | Error): typeof fetch =>
  (async () => {
    if (response instanceof Error) throw response;
    return response;
  }) as typeof fetch;

describe("fetchHealth", () => {
  it("R41: 200 con {status: ok} devuelve ok", async () => {
    const result = await fetchHealth(fakeFetch(Response.json({ status: "ok" })));
    expect(result).toEqual({ ok: true, value: { status: "ok" } });
  });

  it("R42: una respuesta no 200 devuelve err bad-status", async () => {
    const result = await fetchHealth(fakeFetch(Response.json({ status: "ok" }, { status: 500 })));
    expect(result).toEqual({ ok: false, error: "bad-status" });
  });

  it("R42: un cuerpo con otra forma devuelve err bad-body", async () => {
    const result = await fetchHealth(fakeFetch(Response.json({ status: "fail" })));
    expect(result).toEqual({ ok: false, error: "bad-body" });
  });

  it("R42: un cuerpo que no es JSON devuelve err bad-body", async () => {
    const result = await fetchHealth(fakeFetch(new Response("no es json", { status: 200 })));
    expect(result).toEqual({ ok: false, error: "bad-body" });
  });

  it("R42: un fallo de red devuelve err network sin lanzar", async () => {
    const result = await fetchHealth(fakeFetch(new TypeError("fetch failed")));
    expect(result).toEqual({ ok: false, error: "network" });
  });
});
