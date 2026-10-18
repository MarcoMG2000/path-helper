// @vitest-environment jsdom
import { act, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { err, ok, type UserDto } from "../../../../src/shared";
import type { ApiResult } from "../../../../src/web/api/http-client";
import { es } from "../../../../src/web/i18n/es";
import { loadSections } from "../../../../src/web/shell/load-sections";
import { useConsoleSpies } from "../../helpers/console-spy";
import { deferred } from "../../helpers/deferred";
import { apiError, makeServices, PLAYER, type FakeServices } from "../../helpers/fake-services";
import { renderApp } from "../../helpers/render-app";
import { SENTINEL_PIN } from "../../helpers/sentinel";

const sections = loadSections();
const consoleSpies = useConsoleSpies();

async function openLogin(services: FakeServices = makeServices()) {
  const app = renderApp({ route: "/login", sections, services });
  await screen.findByRole("heading", { level: 1, name: es.login.title });
  return app;
}

const nameInput = () => screen.getByLabelText(es.login.name) as HTMLInputElement;
const pinInput = () =>
  screen.getByLabelText(es.login.pin, { selector: "input" }) as HTMLInputElement;
const submit = () => screen.getByRole("button", { name: es.login.submit });

async function fill(app: Awaited<ReturnType<typeof openLogin>>, name: string, pin: string) {
  if (name) await app.user.type(nameInput(), name);
  if (pin) await app.user.type(pinInput(), pin);
}

describe("LoginPage", () => {
  it("R41: muestra los campos Nombre y PIN con su label y un botón de envío", async () => {
    await openLogin();
    expect(nameInput().tagName).toBe("INPUT");
    expect(pinInput().tagName).toBe("INPUT");
    expect(submit().getAttribute("type")).toBe("submit");
    expect(submit().closest("form")).not.toBeNull();
  });

  it("R42: enviar con nombre y PIN vacíos muestra errores junto a los campos y no llama a la API", async () => {
    const services = makeServices();
    const app = await openLogin(services);
    await app.user.click(submit());
    const alerts = screen.getAllByRole("alert").map((a) => a.textContent);
    expect(alerts).toEqual([es.login.nameRequired, es.login.pinRequired]);
    expect(nameInput().getAttribute("aria-invalid")).toBe("true");
    expect(pinInput().getAttribute("aria-invalid")).toBe("true");
    expect(services.auth.login).not.toHaveBeenCalled();
  });

  it("R42: con solo el nombre vacío (o solo espacios) el error está en el nombre", async () => {
    const services = makeServices();
    const app = await openLogin(services);
    await fill(app, "   ", "1234");
    await app.user.click(submit());
    expect(screen.getAllByRole("alert").map((a) => a.textContent)).toEqual([es.login.nameRequired]);
    expect(pinInput().getAttribute("aria-invalid")).toBeNull();
    expect(services.auth.login).not.toHaveBeenCalled();
  });

  it("R42: con solo el PIN vacío el error está en el PIN", async () => {
    const services = makeServices();
    const app = await openLogin(services);
    await fill(app, "Marta", "");
    await app.user.click(submit());
    expect(screen.getAllByRole("alert").map((a) => a.textContent)).toEqual([es.login.pinRequired]);
    expect(services.auth.login).not.toHaveBeenCalled();
  });

  it("R43: llama a login una sola vez; mientras tanto deshabilita el botón y marca aria-busy", async () => {
    const services = makeServices();
    const gate = deferred<ApiResult<UserDto>>();
    services.auth.login.mockImplementation(() => gate.promise);
    const app = await openLogin(services);
    await fill(app, "Marta", "1234");
    const form = submit().closest("form")!;
    await app.user.dblClick(submit());
    await app.user.keyboard("{Enter}");
    expect(services.auth.login).toHaveBeenCalledTimes(1);
    expect(services.auth.login).toHaveBeenCalledWith("Marta", "1234");
    const busyButton = screen.getByRole("button", {
      name: es.login.submitting,
    }) as HTMLButtonElement;
    expect(busyButton.disabled).toBe(true);
    expect(form.getAttribute("aria-busy")).toBe("true");
    await act(async () => gate.resolve(ok(PLAYER)));
    await screen.findByRole("heading", { level: 1, name: es.home.greeting(PLAYER.name) });
    expect(services.auth.login).toHaveBeenCalledTimes(1);
  });

  it("R44: invalid_credentials muestra el mensaje genérico, conserva el nombre, vacía el PIN y enfoca el PIN", async () => {
    const services = makeServices();
    services.auth.login.mockResolvedValue(err(apiError("invalid_credentials", { status: 401 })));
    const app = await openLogin(services);
    await fill(app, "Marta", "0000");
    await app.user.click(submit());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(es.errors.invalid_credentials);
    expect(alert.textContent).toContain("Nombre o PIN incorrectos");
    expect(nameInput().value).toBe("Marta");
    expect(pinInput().value).toBe("");
    expect(document.activeElement).toBe(pinInput());
  });

  it("R44: el mensaje es el mismo para nombre desconocido, PIN erróneo y cuenta deshabilitada", async () => {
    const texts = new Set<string | null>();
    for (const name of ["Desconocido", "Marta", "Deshabilitada"]) {
      const services = makeServices();
      services.auth.login.mockResolvedValue(err(apiError("invalid_credentials", { status: 401 })));
      const app = await openLogin(services);
      await fill(app, name, "1111");
      await app.user.click(submit());
      texts.add((await screen.findByRole("alert")).textContent);
      app.unmount();
    }
    expect(texts.size).toBe(1);
  });

  it("R45: locked muestra el bloqueo con la espera calculada y vacía el PIN", async () => {
    const services = makeServices();
    services.auth.login.mockResolvedValue(
      err(apiError("locked", { status: 429, retryAfterSeconds: 900 })),
    );
    const app = await openLogin(services);
    await fill(app, "Marta", "1234");
    await app.user.click(submit());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(es.errors.locked("15 minutos"));
    expect(pinInput().value).toBe("");
    expect(nameInput().value).toBe("Marta");
  });

  it("R45: sin Retry-After el bloqueo habla de «unos minutos»", async () => {
    const services = makeServices();
    services.auth.login.mockResolvedValue(err(apiError("locked", { status: 429 })));
    const app = await openLogin(services);
    await fill(app, "Marta", "1234");
    await app.user.click(submit());
    expect((await screen.findByRole("alert")).textContent).toBe(es.errors.locked("unos minutos"));
  });

  it.each(["network", "unexpected", "validation_error", "bad_origin"] as const)(
    "R47: %s muestra su propio mensaje en un role=alert y conserva el nombre",
    async (code) => {
      const services = makeServices();
      services.auth.login.mockResolvedValue(
        err(apiError(code, { status: code === "network" ? 0 : 400 })),
      );
      const app = await openLogin(services);
      await fill(app, "Marta", "1234");
      await app.user.click(submit());
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toBe(es.errors[code]);
      expect(nameInput().value).toBe("Marta");
    },
  );

  it("R48: el formulario declara method=post y los atributos de autocompletado", async () => {
    await openLogin();
    const form = submit().closest("form")!;
    expect(form.getAttribute("method")).toBe("post");
    expect(nameInput().getAttribute("autocomplete")).toBe("username");
    expect(nameInput().getAttribute("autocapitalize")).toBe("none");
    expect(nameInput().getAttribute("spellcheck")).toBe("false");
    expect(pinInput().type).toBe("password");
    expect(pinInput().getAttribute("inputmode")).toBe("numeric");
    expect(pinInput().getAttribute("autocomplete")).toBe("current-password");
  });

  it("R50: el aviso de sesión caducada se muestra en un role=status y se retira al enviar", async () => {
    const services = makeServices({ me: PLAYER });
    const app = renderApp({ route: "/perfil", sections, services });
    await screen.findByRole("heading", { level: 1, name: es.profile.title });
    act(() => services.emitUnauthenticated());
    const notice = await screen.findByText(es.session.expired);
    expect(notice.getAttribute("role")).toBe("status");
    services.auth.login.mockResolvedValue(err(apiError("invalid_credentials", { status: 401 })));
    await fill(app, "Marta", "1234");
    await app.user.click(submit());
    await screen.findByRole("alert");
    expect(screen.queryByText(es.session.expired)).toBeNull();
  });

  it("R50: cerrar sesión en otra pestaña muestra el aviso correspondiente", async () => {
    const services = makeServices({ me: PLAYER });
    const app = renderApp({ route: "/perfil", sections, services });
    await screen.findByRole("heading", { level: 1, name: es.profile.title });
    act(() => app.channel.receive("logout"));
    const notice = await screen.findByText(es.session.signedOutElsewhere);
    expect(notice.getAttribute("role")).toBe("status");
  });

  it("R50: sin aviso en la primera visita", async () => {
    await openLogin();
    expect(screen.queryByText(es.session.expired)).toBeNull();
    expect(screen.queryByText(es.session.signedOutElsewhere)).toBeNull();
  });

  it("R51: el PIN no queda en almacenamiento, cookies, URL, history.state ni DOM (login fallido y correcto)", async () => {
    const services = makeServices();
    services.auth.login.mockResolvedValueOnce(
      err(apiError("invalid_credentials", { status: 401 })),
    );
    const app = await openLogin(services);
    const assertClean = () => {
      expect(JSON.stringify({ ...window.localStorage })).not.toContain(SENTINEL_PIN);
      expect(JSON.stringify({ ...window.sessionStorage })).not.toContain(SENTINEL_PIN);
      expect(document.cookie).not.toContain(SENTINEL_PIN);
      expect(window.location.href).not.toContain(SENTINEL_PIN);
      expect(JSON.stringify(window.history.state)).not.toContain(SENTINEL_PIN);
      const routerLocation = app.location();
      expect(
        JSON.stringify([routerLocation.pathname, routerLocation.search, routerLocation.state]),
      ).not.toContain(SENTINEL_PIN);
    };

    await fill(app, "Marta", SENTINEL_PIN);
    await app.user.click(submit());
    await screen.findByRole("alert");
    assertClean();
    expect(document.body.innerHTML).not.toContain(SENTINEL_PIN);

    services.auth.login.mockResolvedValue(ok(PLAYER));
    await fill(app, "", SENTINEL_PIN);
    await app.user.click(submit());
    await screen.findByRole("heading", { level: 1, name: es.home.greeting(PLAYER.name) });
    assertClean();
    expect(document.body.innerHTML).not.toContain(SENTINEL_PIN);
    expect(services.auth.login).toHaveBeenLastCalledWith("Marta", SENTINEL_PIN);
  });

  it("R86: no escribe en la consola en ningún flujo de login (éxito, error o bloqueo)", async () => {
    const services = makeServices();
    services.auth.login
      .mockResolvedValueOnce(err(apiError("invalid_credentials", { status: 401 })))
      .mockResolvedValueOnce(err(apiError("locked", { status: 429, retryAfterSeconds: 60 })))
      .mockResolvedValueOnce(err(apiError("network", { status: 0 })))
      .mockResolvedValueOnce(ok(PLAYER));
    const app = await openLogin(services);
    await fill(app, "Marta", "1111");
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await app.user.click(submit());
      if (attempt < 3) {
        await screen.findByRole("alert");
        await waitFor(() => expect(pinInput().value).toBe(""));
        await app.user.type(pinInput(), "1111");
      }
    }
    await screen.findByRole("heading", { level: 1, name: es.home.greeting(PLAYER.name) });
    consoleSpies.expectSilent();
  });
});
