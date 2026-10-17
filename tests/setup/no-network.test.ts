import { describe, expect, it } from "vitest";
import unitConfig from "../../vitest.config";
import intConfig from "../../vitest.int.config";

describe("setup sin red (R50)", () => {
  it("R50: globalThis.fetch lanza en los tests unitarios", () => {
    expect(() => fetch("https://www.aonprd.com/")).toThrow(/Red prohibida/);
    expect(() => globalThis.fetch("http://localhost:1/")).toThrow(/R50/);
  });

  it("R50: la configuración unitaria registra el setup y la de integración no", () => {
    expect(unitConfig.test?.setupFiles).toEqual(["tests/setup/no-network.ts"]);
    expect(intConfig.test?.setupFiles).toBeUndefined();
  });

  it("R50: un fetch inyectado sigue funcionando", async () => {
    const fake = (async () => new Response("ok")) as typeof fetch;
    expect(await (await fake("https://x.test/")).text()).toBe("ok");
  });
});
