// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ok } from "../../src/shared";
import type { HealthError } from "../../src/web/api/health";
import type { Result } from "../../src/shared";
import { es } from "../../src/web/i18n/es";
import { loadSections } from "../../src/web/shell/load-sections";
import { deferred } from "./helpers/deferred";
import { GM, makeServices } from "./helpers/fake-services";
import { renderApp } from "./helpers/render-app";

// Enmienda a f0 (R43/R44, design f1b §18): App ya no es la pantalla de salud; necesita router,
// servicios y sesión. HealthStatus pasa a la página de inicio y el nombre sigue en las cabeceras.
const sections = loadSections();

describe("App", () => {
  it("R44: la cabecera de la pantalla de acceso muestra el nombre de la aplicación de i18n/es", async () => {
    const app = renderApp({ route: "/", sections });
    await screen.findByRole("heading", { level: 1, name: es.login.title });
    expect(screen.getByRole("banner").textContent).toContain(es.appName);
    expect(app.location().pathname).toBe("/login");
  });

  it("R44: la cabecera del layout autenticado muestra el nombre de la aplicación", async () => {
    renderApp({ route: "/", sections, services: makeServices({ me: GM }) });
    await screen.findByRole("heading", { level: 1, name: es.home.greeting(GM.name) });
    expect(screen.getByRole("banner").textContent).toContain(es.appName);
  });

  it("R43: HealthStatus (en Inicio) muestra loading y después el estado de la API", async () => {
    const services = makeServices({ me: GM });
    const gate = deferred<Result<{ status: "ok" }, HealthError>>();
    services.checkHealth.mockImplementation(() => gate.promise);
    renderApp({ route: "/", sections, services });
    expect(await screen.findByText(es.health.loading)).toBeTruthy();
    gate.resolve(ok({ status: "ok" }));
    await waitFor(() => expect(screen.getByText(es.health.ok)).toBeTruthy());
  });
});
