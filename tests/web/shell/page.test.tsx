// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { es } from "../../../src/web/i18n/es";
import { loadSections } from "../../../src/web/shell/load-sections";
import { Page } from "../../../src/web/shell/page";
import { GM, makeServices } from "../helpers/fake-services";
import { renderApp } from "../helpers/render-app";

describe("Page", () => {
  it("R37: al montar fija document.title y enfoca el h1", () => {
    render(
      <MemoryRouter>
        <Page title="Mi título" />
      </MemoryRouter>,
    );
    const h1 = screen.getByRole("heading", { level: 1, name: "Mi título" });
    expect(document.title).toBe(es.pageTitle("Mi título"));
    expect(document.activeElement).toBe(h1);
    expect(h1.getAttribute("tabindex")).toBe("-1");
  });

  it("R37: al cambiar el título actualiza document.title y vuelve a enfocar el h1", () => {
    const { rerender } = render(<Page title="Uno" />);
    (document.activeElement as HTMLElement | null)?.blur();
    rerender(<Page title="Dos" />);
    expect(document.title).toBe(es.pageTitle("Dos"));
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1, name: "Dos" }));
  });

  it("R37: al navegar entre pantallas la app mueve el foco al h1 de la nueva página", async () => {
    const app = renderApp({
      route: "/",
      sections: loadSections(),
      services: makeServices({ me: GM }),
    });
    await screen.findByRole("heading", { level: 1, name: es.home.greeting(GM.name) });
    await waitFor(() => expect(document.title).toBe(es.pageTitle(es.home.greeting(GM.name))));
    const nav = screen.getByRole("navigation", { name: es.a11y.mainNav });
    await app.user.click(within(nav).getByRole("link", { name: es.nav.profile }));
    const h1 = await screen.findByRole("heading", { level: 1, name: es.profile.title });
    await waitFor(() => expect(document.title).toBe(es.pageTitle(es.profile.title)));
    expect(document.activeElement).toBe(h1);
  });
});
