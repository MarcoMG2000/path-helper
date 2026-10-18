import { describe, expect, it, vi } from "vitest";
import { createServices } from "../../../src/web/api/services";
import { errorResponse, makeFakeFetch } from "../helpers/fake-fetch";

describe("createServices", () => {
  it("R8: un 401 unauthenticated de cualquier módulo llega a los suscriptores", async () => {
    const { fetchFn } = makeFakeFetch(errorResponse(401, "unauthenticated"));
    const services = createServices({ fetchFn });
    const handler = vi.fn();
    services.onUnauthenticated(handler);
    const result = await services.accounts.list();
    expect(result).toMatchObject({ ok: false, error: { code: "unauthenticated" } });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("R18: tras cancelar la suscripción el handler deja de recibir avisos", async () => {
    const { fetchFn } = makeFakeFetch(errorResponse(401, "unauthenticated"));
    const services = createServices({ fetchFn });
    const handler = vi.fn();
    const stop = services.onUnauthenticated(handler);
    stop();
    await services.auth.me();
    expect(handler).not.toHaveBeenCalled();
  });

  it("R8: invalid_credentials del login no se notifica como sesión caducada", async () => {
    const { fetchFn } = makeFakeFetch(errorResponse(401, "invalid_credentials"));
    const services = createServices({ fetchFn });
    const handler = vi.fn();
    services.onUnauthenticated(handler);
    await services.auth.login("a", "b");
    expect(handler).not.toHaveBeenCalled();
  });

  it("R1: checkHealth usa el fetch inyectado sobre /health", async () => {
    const fake = makeFakeFetch(Response.json({ status: "ok" }));
    const services = createServices({ fetchFn: fake.fetchFn });
    expect(await services.checkHealth()).toEqual({ ok: true, value: { status: "ok" } });
    expect(fake.calls[0]?.url).toBe("/health");
  });
});
