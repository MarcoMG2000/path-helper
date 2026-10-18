// @vitest-environment jsdom
import { act, screen, waitFor } from "@testing-library/react";
import { Outlet, useParams } from "react-router";
import { describe, expect, it } from "vitest";
import { ok, type UserDto } from "../../../src/shared";
import { es } from "../../../src/web/i18n/es";
import { safeRedirectTarget } from "../../../src/web/shell/guards";
import { loadSections } from "../../../src/web/shell/load-sections";
import { Page } from "../../../src/web/shell/page";
import { defineSection } from "../../../src/web/shell/sections";
import { apiError, GM, makeServices, PLAYER } from "../helpers/fake-services";
import { renderApp } from "../helpers/render-app";

const sections = loadSections();
const heading = (name: string) => screen.findByRole("heading", { level: 1, name });

function Ficha() {
  return (
    <Page title="Ficha de prueba">
      <Outlet />
    </Page>
  );
}
function FichaDetalle() {
  const { id } = useParams();
  return <p>{`detalle ${id}`}</p>;
}
const fichaSection = defineSection({
  id: "character-sheet",
  path: "/ficha",
  label: "Ficha",
  roles: ["player", "gm"],
  order: 10,
  Component: Ficha,
  children: [{ path: ":id", element: <FichaDetalle /> }],
});

describe("rutas y guardas", () => {
  it.each(["/", "/cuentas", "/perfil", "/no-existe", "/perfil?tab=1"])(
    "R25: anónimo en %s redirige a /login conservando el destino en state.from",
    async (route) => {
      const app = renderApp({ route, sections });
      await heading(es.login.title);
      expect(app.location().pathname).toBe("/login");
      expect(app.location().state).toEqual({ from: route });
    },
  );

  it("R25: /login anónimo no redirige y muestra el formulario", async () => {
    const app = renderApp({ route: "/login", sections });
    await heading(es.login.title);
    expect(app.location().pathname).toBe("/login");
    expect(app.location().state).toBeNull();
  });

  it("R26: con la sesión en loading muestra el indicador (role=status) sin contenido ni redirección", async () => {
    const services = makeServices();
    services.auth.me.mockImplementation(() => new Promise(() => {}));
    const app = renderApp({ route: "/cuentas", sections, services });
    const status = await screen.findByRole("status");
    expect(status.textContent).toBe(es.session.checking);
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(services.accounts.list).not.toHaveBeenCalled();
    expect(app.location().pathname).toBe("/cuentas");
  });

  it("R16: si me falla por red se ofrece «Reintentar», que repite la consulta", async () => {
    const services = makeServices({ me: apiError("network", { status: 0 }) });
    const app = renderApp({ route: "/perfil", sections, services });
    await heading(es.session.checkFailed);
    expect(app.location().pathname).toBe("/perfil");
    services.auth.me.mockResolvedValue(ok(PLAYER));
    await app.user.click(screen.getByRole("button", { name: es.common.retry }));
    await heading(es.profile.title);
    expect(services.auth.me).toHaveBeenCalledTimes(2);
  });

  it("R27: con sesión, /login redirige a / si no hay destino", async () => {
    const app = renderApp({ route: "/login", sections, services: makeServices({ me: GM }) });
    await heading(es.home.greeting(GM.name));
    expect(app.location().pathname).toBe("/");
  });

  it("R27: con sesión, /login redirige al destino `from` válido", async () => {
    const app = renderApp({
      route: "/login",
      state: { from: "/cuentas" },
      sections,
      services: makeServices({ me: GM }),
    });
    await heading(es.accounts.title);
    expect(app.location().pathname).toBe("/cuentas");
  });

  it.each([
    ["//evil.com", "/"],
    ["https://evil.com", "/"],
    ["javascript:alert(1)", "/"],
    ["", "/"],
    ["/\\evil.com", "/"],
    ["/\t/evil.com", "/"],
    ["/login", "/"],
    ["/login?x=1", "/"],
    [42, "/"],
    [undefined, "/"],
    ["/cuentas", "/cuentas"],
    ["/perfil?a=1#b", "/perfil?a=1#b"],
  ] as [unknown, string][])("R28: safeRedirectTarget(%j) -> %s", (from, expected) => {
    expect(safeRedirectTarget(from)).toBe(expected);
  });

  it.each(["//evil.com", "https://evil.com", "javascript:alert(1)", ""])(
    "R28: un destino peligroso (%j) en la redirección tras login se ignora y se va a /",
    async (from) => {
      const app = renderApp({
        route: "/login",
        state: { from },
        sections,
        services: makeServices({ me: GM }),
      });
      await heading(es.home.greeting(GM.name));
      expect(app.location().pathname).toBe("/");
    },
  );

  it("R29: /legal se muestra sin sesión, con sesión cargando, con error y autenticado", async () => {
    const pending = makeServices();
    pending.auth.me.mockImplementation(() => new Promise(() => {}));
    for (const services of [
      makeServices(),
      pending,
      makeServices({ me: apiError("network", { status: 0 }) }),
      makeServices({ me: PLAYER }),
    ]) {
      const app = renderApp({ route: "/legal", sections, services });
      await heading(es.legal.title);
      await act(async () => {});
      expect(app.location().pathname).toBe("/legal");
      app.unmount();
    }
  });

  it("R30: una ruta desconocida con sesión muestra la 404 dentro del layout con enlace a /", async () => {
    renderApp({ route: "/no-existe", sections, services: makeServices({ me: PLAYER }) });
    await heading(es.notFound.title);
    expect(screen.getByRole("navigation", { name: es.a11y.mainNav })).toBeTruthy();
    const home = screen.getByRole("link", { name: es.common.backHome });
    expect(home.getAttribute("href")).toBe("/");
  });

  it("R31: un jugador en /cuentas ve «Sin permiso» y no se renderiza ni se carga la sección", async () => {
    const services = makeServices({ me: PLAYER });
    renderApp({ route: "/cuentas", sections, services });
    await heading(es.forbidden.title);
    expect(screen.queryByText(es.accounts.create.title)).toBeNull();
    expect(services.accounts.list).not.toHaveBeenCalled();
  });

  it("R31: el GM sí entra en /cuentas", async () => {
    renderApp({ route: "/cuentas", sections, services: makeServices({ me: GM }) });
    await heading(es.accounts.title);
  });

  it("R33: una sección inyectada crea su ruta (con subrutas) y su entrada de navegación sin tocar el shell", async () => {
    const all = [...sections, fichaSection];
    const app = renderApp({
      route: "/ficha/42",
      sections: all,
      services: makeServices({ me: PLAYER }),
    });
    await heading("Ficha de prueba");
    expect(screen.getByText("detalle 42")).toBeTruthy();
    expect(app.location().pathname).toBe("/ficha/42");
    const nav = screen.getByRole("navigation", { name: es.a11y.mainNav });
    const labels = Array.from(nav.querySelectorAll("a")).map((a) => a.textContent);
    expect(labels).toEqual([es.nav.home, "Ficha", es.nav.profile]);
  });

  it("R33: la sección inyectada también está protegida por sesión y por rol", async () => {
    const gmOnly = defineSection({
      ...fichaSection,
      id: "gm-only",
      path: "/solo-gm",
      roles: ["gm"],
    });
    const all = [...sections, gmOnly];
    const anonymous = renderApp({ route: "/solo-gm", sections: all });
    await heading(es.login.title);
    anonymous.unmount();
    renderApp({ route: "/solo-gm", sections: all, services: makeServices({ me: PLAYER }) });
    await heading(es.forbidden.title);
  });

  it("R25: al caducar la sesión (401) la app vuelve a /login con el aviso y el destino", async () => {
    const services = makeServices({ me: PLAYER });
    const app = renderApp({ route: "/perfil", sections, services });
    await heading(es.profile.title);
    act(() => services.emitUnauthenticated());
    await waitFor(() => expect(app.location().pathname).toBe("/login"));
    expect(screen.getByText(es.session.expired)).toBeTruthy();
    expect(app.location().state).toEqual({ from: "/perfil" });
  });

  it("R14: tras un login correcto desde /login se navega a la raíz", async () => {
    const services = makeServices();
    const user: UserDto = { id: "u1", name: "Marta", role: "player" };
    services.auth.login.mockResolvedValue(ok(user));
    const app = renderApp({ route: "/login", sections, services });
    await heading(es.login.title);
    await app.user.type(screen.getByLabelText(es.login.name), "Marta");
    await app.user.type(screen.getByLabelText(es.login.pin, { selector: "input" }), "1234");
    await app.user.click(screen.getByRole("button", { name: es.login.submit }));
    await heading(es.home.greeting("Marta"));
  });
});
