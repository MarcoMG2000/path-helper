// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { es } from "../../../src/web/i18n/es";
import { loadSections } from "../../../src/web/shell/load-sections";
import { apiError, makeServices } from "../helpers/fake-services";
import { renderApp } from "../helpers/render-app";

const sections = loadSections();

function expectLegalLink() {
  const footer = screen.getByRole("contentinfo");
  const link = footer.querySelector('a[href="/legal"]');
  expect(link?.textContent).toBe(es.layout.legalLink);
}

describe("PublicLayout", () => {
  it("R38: el pie de /login enlaza al aviso legal", async () => {
    renderApp({ route: "/login", sections });
    await screen.findByRole("heading", { level: 1, name: es.login.title });
    expectLegalLink();
  });

  it("R38: el pie de /legal enlaza al aviso legal", async () => {
    renderApp({ route: "/legal", sections });
    await screen.findByRole("heading", { level: 1, name: es.legal.title });
    expectLegalLink();
  });

  it("R38: el pie también está en las pantallas de carga y de error de sesión", async () => {
    const pending = makeServices();
    pending.auth.me.mockImplementation(() => new Promise(() => {}));
    const loading = renderApp({ route: "/perfil", sections, services: pending });
    await screen.findByRole("status");
    expectLegalLink();
    loading.unmount();
    renderApp({
      route: "/perfil",
      sections,
      services: makeServices({ me: apiError("network", { status: 0 }) }),
    });
    await screen.findByRole("heading", { level: 1, name: es.session.checkFailed });
    expectLegalLink();
  });

  it("R36: el layout público ofrece landmarks, salto al contenido y no tiene navegación", async () => {
    renderApp({ route: "/login", sections });
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByRole("banner")).toBeTruthy();
    expect(screen.getByRole("main").id).toBe("contenido");
    expect(screen.getByRole("link", { name: es.a11y.skipToContent })).toBeTruthy();
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});
