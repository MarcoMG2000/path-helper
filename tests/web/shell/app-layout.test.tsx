// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { es } from "../../../src/web/i18n/es";
import { loadSections } from "../../../src/web/shell/load-sections";
import { GM, makeServices, PLAYER } from "../helpers/fake-services";
import { renderApp } from "../helpers/render-app";

const sections = loadSections();

describe("AppLayout", () => {
  it("R36: el enlace «Saltar al contenido» es el primer elemento enfocable y apunta al main", async () => {
    const app = renderApp({ route: "/", sections, services: makeServices({ me: GM }) });
    await screen.findByRole("heading", { level: 1 });
    (document.activeElement as HTMLElement | null)?.blur();
    await app.user.tab();
    const skip = screen.getByRole("link", { name: es.a11y.skipToContent });
    expect(document.activeElement).toBe(skip);
    expect(skip.getAttribute("href")).toBe("#contenido");
    expect(screen.getByRole("main").id).toBe("contenido");
  });

  it("R36: expone los landmarks header, nav con aria-label, main y footer", async () => {
    renderApp({ route: "/", sections, services: makeServices({ me: PLAYER }) });
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByRole("banner")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: es.a11y.mainNav })).toBeTruthy();
    expect(screen.getByRole("main")).toBeTruthy();
    expect(screen.getByRole("contentinfo")).toBeTruthy();
  });

  it("R36: hay un único h1 por pantalla", async () => {
    renderApp({ route: "/perfil", sections, services: makeServices({ me: PLAYER }) });
    await screen.findByRole("heading", { level: 1, name: es.profile.title });
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("R36: la cabecera muestra el nombre y el rol del usuario", async () => {
    renderApp({ route: "/", sections, services: makeServices({ me: GM }) });
    await screen.findByRole("heading", { level: 1 });
    const banner = screen.getByRole("banner");
    expect(banner.textContent).toContain(es.layout.signedInAs("Gandalf", es.roles.gm));
    expect(banner.textContent).toContain(es.appName);
  });

  it("R38: el pie del layout de la app enlaza al aviso legal", async () => {
    renderApp({ route: "/perfil", sections, services: makeServices({ me: PLAYER }) });
    await screen.findByRole("heading", { level: 1, name: es.profile.title });
    const footer = screen.getByRole("contentinfo");
    const link = Array.from(footer.querySelectorAll("a")).find(
      (a) => a.textContent === es.layout.legalLink,
    );
    expect(link?.getAttribute("href")).toBe("/legal");
  });

  it("R38: el pie también aparece en las páginas de error (404 y sin permiso)", async () => {
    const notFound = renderApp({
      route: "/nada",
      sections,
      services: makeServices({ me: PLAYER }),
    });
    await screen.findByRole("heading", { level: 1, name: es.notFound.title });
    expect(screen.getByRole("contentinfo").querySelector('a[href="/legal"]')).toBeTruthy();
    notFound.unmount();
    renderApp({ route: "/cuentas", sections, services: makeServices({ me: PLAYER }) });
    await screen.findByRole("heading", { level: 1, name: es.forbidden.title });
    expect(screen.getByRole("contentinfo").querySelector('a[href="/legal"]')).toBeTruthy();
  });
});
