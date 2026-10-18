import { describe, expect, it } from "vitest";
import { createAccountsApi } from "../../../src/web/api/accounts-api";
import { createHttpClient } from "../../../src/web/api/http-client";
import { makeFakeFetch } from "../helpers/fake-fetch";

const account = {
  id: "a/b c",
  name: "Marta",
  role: "player",
  disabled: false,
  createdAt: "2026-10-18T10:00:00.000Z",
};

function setup(response: Response) {
  const fake = makeFakeFetch(response);
  return { api: createAccountsApi(createHttpClient({ fetchFn: fake.fetchFn })), calls: fake.calls };
}

describe("createAccountsApi", () => {
  it("R12: list hace GET /api/accounts", async () => {
    const { api, calls } = setup(Response.json([account]));
    expect(await api.list()).toEqual({ ok: true, value: [account] });
    expect(calls[0]?.url).toBe("/api/accounts");
    expect(calls[0]?.init.method).toBe("GET");
  });

  it("R12: create hace POST /api/accounts con {name, pin}", async () => {
    const { api, calls } = setup(Response.json(account, { status: 201 }));
    expect(await api.create("Marta", "1234")).toEqual({ ok: true, value: account });
    expect(calls[0]?.url).toBe("/api/accounts");
    expect(calls[0]?.init.method).toBe("POST");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ name: "Marta", pin: "1234" });
  });

  it("R12: resetPin hace PUT /api/accounts/:id/pin con {pin} y el id codificado", async () => {
    const { api, calls } = setup(new Response(null, { status: 204 }));
    expect(await api.resetPin("a/b c", "4321")).toEqual({ ok: true, value: undefined });
    expect(calls[0]?.url).toBe("/api/accounts/a%2Fb%20c/pin");
    expect(calls[0]?.init.method).toBe("PUT");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ pin: "4321" });
  });

  it("R12: setDisabled hace PATCH /api/accounts/:id con {disabled}", async () => {
    const { api, calls } = setup(Response.json({ ...account, disabled: true }));
    const result = await api.setDisabled("a/b c", true);
    expect(result).toEqual({ ok: true, value: { ...account, disabled: true } });
    expect(calls[0]?.url).toBe("/api/accounts/a%2Fb%20c");
    expect(calls[0]?.init.method).toBe("PATCH");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ disabled: true });
  });

  it("R12: unlock hace POST /api/accounts/:id/unlock sin cuerpo", async () => {
    const { api, calls } = setup(new Response(null, { status: 204 }));
    expect(await api.unlock("a/b c")).toEqual({ ok: true, value: undefined });
    expect(calls[0]?.url).toBe("/api/accounts/a%2Fb%20c/unlock");
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.body).toBeUndefined();
  });
});
