// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { err } from "../../../../src/shared";
import { es } from "../../../../src/web/i18n/es";
import { loadSections } from "../../../../src/web/shell/load-sections";
import { defineSection } from "../../../../src/web/shell/sections";
import { GM, makeServices, PLAYER } from "../../helpers/fake-services";
import { renderApp } from "../../helpers/render-app";

const sections = [
  ...loadSections(),
  defineSection({
    id: "oculta",
    path: "/oculta",
    label: "Pantalla oculta",
    roles: ["player", "gm"],
    order: 1,
    Component: () => null,
    hidden: true,
  }),
];

describe("HomePage", () => {
  it("R40: muestra el nombre y un acceso a cada sección visible para el GM", async () => {
    renderApp({ route: "/", sections, services: makeServices({ me: GM }) });
    await screen.findByRole("heading", { level: 1, name: es.home.greeting("Gandalf") });
    const main = screen.getByRole("main");
    const links = within(main).getAllByRole("link");
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      [es.nav.accounts, "/cuentas"],
      [es.nav.profile, "/perfil"],
    ]);
  });

  it("R40: el jugador no ve accesos a secciones de GM ni a las ocultas", async () => {
    renderApp({ route: "/", sections, services: makeServices({ me: PLAYER }) });
    await screen.findByRole("heading", { level: 1, name: es.home.greeting("Marta") });
    const labels = within(screen.getByRole("main"))
      .getAllByRole("link")
      .map((a) => a.textContent);
    expect(labels).toEqual([es.nav.profile]);
  });

  it("R40: muestra el estado de la API (HealthStatus) con el servicio inyectado", async () => {
    const services = makeServices({ me: GM });
    renderApp({ route: "/", sections, services });
    expect(await screen.findByText(es.health.ok)).toBeTruthy();
    expect(services.checkHealth).toHaveBeenCalledTimes(1);
  });

  it("R40: si la API no responde, HealthStatus muestra el error", async () => {
    const services = makeServices({ me: GM });
    services.checkHealth.mockResolvedValue(err("network"));
    renderApp({ route: "/", sections, services });
    expect(await screen.findByText(es.health.error)).toBeTruthy();
  });
});
