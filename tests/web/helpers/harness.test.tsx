// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GM, makeServices } from "./fake-services";
import { renderApp } from "./render-app";

// T2: jsdom + Testing Library + el setup `no-network` conviven.
describe("harness de tests de UI", () => {
  it("renderiza la app con servicios falsos sin tocar la red", async () => {
    renderApp({ route: "/", services: makeServices({ me: GM }) });
    expect(await screen.findByRole("heading", { level: 1 })).toBeTruthy();
    expect(globalThis.fetch).toBeTypeOf("function");
    expect(() => globalThis.fetch("/x")).toThrow(/Red prohibida/);
  });
});
