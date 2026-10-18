import { describe, expect, it } from "vitest";
import { createAuthApi } from "../../../src/web/api/auth-api";
import { createHttpClient } from "../../../src/web/api/http-client";
import { headersOf, makeFakeFetch } from "../helpers/fake-fetch";

const user = { id: "u1", name: "Marta", role: "player" };

function setup(response: Response) {
  const fake = makeFakeFetch(response);
  return { api: createAuthApi(createHttpClient({ fetchFn: fake.fetchFn })), calls: fake.calls };
}

describe("createAuthApi", () => {
  it("R11: login hace POST /api/auth/login con {name, pin}", async () => {
    const { api, calls } = setup(Response.json(user));
    const result = await api.login("Marta", "1234");
    expect(result).toEqual({ ok: true, value: user });
    expect(calls[0]?.url).toBe("/api/auth/login");
    expect(calls[0]?.init.method).toBe("POST");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ name: "Marta", pin: "1234" });
  });

  it("R11: me hace GET /api/auth/me sin cuerpo", async () => {
    const { api, calls } = setup(Response.json(user));
    expect(await api.me()).toEqual({ ok: true, value: user });
    expect(calls[0]?.url).toBe("/api/auth/me");
    expect(calls[0]?.init.method).toBe("GET");
    expect(calls[0]?.init.body).toBeUndefined();
  });

  it("R11: logout hace POST /api/auth/logout sin cuerpo ni Content-Type", async () => {
    const { api, calls } = setup(new Response(null, { status: 204 }));
    expect(await api.logout()).toEqual({ ok: true, value: undefined });
    expect(calls[0]?.url).toBe("/api/auth/logout");
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.body).toBeUndefined();
    expect(headersOf(calls[0]!.init)).not.toHaveProperty("content-type");
  });

  it("R11: changePin hace PUT /api/auth/pin con {currentPin, newPin}", async () => {
    const { api, calls } = setup(new Response(null, { status: 204 }));
    expect(await api.changePin("1234", "5678")).toEqual({ ok: true, value: undefined });
    expect(calls[0]?.url).toBe("/api/auth/pin");
    expect(calls[0]?.init.method).toBe("PUT");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      currentPin: "1234",
      newPin: "5678",
    });
  });

  it("R11: login con un usuario de rol desconocido es unexpected", async () => {
    const { api } = setup(Response.json({ ...user, role: "admin" }));
    expect(await api.login("a", "b")).toMatchObject({ ok: false, error: { code: "unexpected" } });
  });
});
