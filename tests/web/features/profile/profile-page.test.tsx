// @vitest-environment jsdom
import { act, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { err, ok } from "../../../../src/shared";
import type { ApiResult } from "../../../../src/web/api/http-client";
import { es } from "../../../../src/web/i18n/es";
import { loadSections } from "../../../../src/web/shell/load-sections";
import { useConsoleSpies } from "../../helpers/console-spy";
import { deferred } from "../../helpers/deferred";
import { apiError, GM, makeServices, PLAYER, type FakeServices } from "../../helpers/fake-services";
import { renderApp } from "../../helpers/render-app";

const sections = loadSections();
const consoleSpies = useConsoleSpies();
const t = es.profile.changePin;

async function openProfile(services: FakeServices = makeServices({ me: PLAYER })) {
  const app = renderApp({ route: "/perfil", sections, services });
  await screen.findByRole("heading", { level: 1, name: es.profile.title });
  return app;
}

const field = (label: string) =>
  screen.getByLabelText(label, { selector: "input" }) as HTMLInputElement;
const submit = () => screen.getByRole("button", { name: t.submit });

async function fillForm(
  app: Awaited<ReturnType<typeof openProfile>>,
  current: string,
  next: string,
  repeat: string,
) {
  if (current) await app.user.type(field(t.current), current);
  if (next) await app.user.type(field(t.next), next);
  if (repeat) await app.user.type(field(t.repeat), repeat);
}

describe("ProfilePage", () => {
  it("R52: muestra el nombre y el rol traducido del jugador y del GM", async () => {
    const player = await openProfile();
    const dl = screen.getByText(es.profile.name).closest("dl")!;
    expect(dl.textContent).toContain("Marta");
    expect(dl.textContent).toContain(es.roles.player);
    player.unmount();
    await openProfile(makeServices({ me: GM }));
    const gmList = screen.getByText(es.profile.name).closest("dl")!;
    expect(gmList.textContent).toContain("Gandalf");
    expect(gmList.textContent).toContain("GM");
  });

  it.each([
    ["PIN actual vacío", "", "5678", "5678", t.currentRequired],
    ["PIN nuevo con 3 dígitos", "1234", "567", "567", t.nextInvalid],
    ["PIN nuevo con 9 dígitos", "1234", "123456789", "123456789", t.nextInvalid],
    ["PIN nuevo con letras", "1234", "56a8", "56a8", t.nextInvalid],
    ["repetición distinta", "1234", "5678", "5679", t.mismatch],
  ])(
    "R53: %s -> error junto al campo y sin llamar a la API",
    async (_name, current, next, repeat, message) => {
      const services = makeServices({ me: PLAYER });
      const app = await openProfile(services);
      await fillForm(app, current, next, repeat);
      await app.user.click(submit());
      const alert = screen.getByText(message);
      expect(alert.getAttribute("role")).toBe("alert");
      const invalid = document.querySelector('[aria-invalid="true"]');
      expect(invalid).not.toBeNull();
      expect(invalid?.getAttribute("aria-describedby")).toContain(alert.id);
      expect(services.auth.changePin).not.toHaveBeenCalled();
    },
  );

  it("R54: un cambio correcto confirma que se cerraron las demás sesiones, vacía los campos y mantiene la sesión", async () => {
    const services = makeServices({ me: PLAYER });
    const app = await openProfile(services);
    await fillForm(app, "1234", "5678", "5678");
    await app.user.click(submit());
    const status = await screen.findByText(t.success);
    expect(status.getAttribute("role")).toBe("status");
    expect(services.auth.changePin).toHaveBeenCalledWith("1234", "5678");
    expect(field(t.current).value).toBe("");
    expect(field(t.next).value).toBe("");
    expect(field(t.repeat).value).toBe("");
    expect(screen.getByRole("heading", { level: 1, name: es.profile.title })).toBeTruthy();
    expect(app.location().pathname).toBe("/perfil");
  });

  it("R55: invalid_current_pin marca el campo del PIN actual, vacía los tres campos y mantiene la sesión", async () => {
    const services = makeServices({ me: PLAYER });
    services.auth.changePin.mockResolvedValue(
      err(apiError("invalid_current_pin", { status: 403 })),
    );
    const app = await openProfile(services);
    await fillForm(app, "0000", "5678", "5678");
    await app.user.click(submit());
    const alert = await screen.findByText(es.errors.invalid_current_pin as string);
    expect(alert.getAttribute("role")).toBe("alert");
    expect(field(t.current).getAttribute("aria-invalid")).toBe("true");
    expect(field(t.current).getAttribute("aria-describedby")).toContain(alert.id);
    expect(field(t.current).value).toBe("");
    expect(field(t.next).value).toBe("");
    expect(field(t.repeat).value).toBe("");
    expect(app.location().pathname).toBe("/perfil");
    expect(screen.getByRole("heading", { level: 1, name: es.profile.title })).toBeTruthy();
  });

  it("R56: locked muestra el bloqueo con la espera formateada y vacía los campos", async () => {
    const services = makeServices({ me: PLAYER });
    services.auth.changePin.mockResolvedValue(
      err(apiError("locked", { status: 429, retryAfterSeconds: 7500 })),
    );
    const app = await openProfile(services);
    await fillForm(app, "1234", "5678", "5678");
    await app.user.click(submit());
    const alert = await screen.findByText(es.errors.locked("2 horas y 5 minutos"));
    expect(alert.getAttribute("role")).toBe("alert");
    expect(field(t.current).value).toBe("");
    expect(field(t.next).value).toBe("");
    expect(field(t.repeat).value).toBe("");
  });

  it("R54: el botón se deshabilita mientras la petición está en curso", async () => {
    const services = makeServices({ me: PLAYER });
    const gate = deferred<ApiResult<void>>();
    services.auth.changePin.mockImplementation(() => gate.promise);
    const app = await openProfile(services);
    await fillForm(app, "1234", "5678", "5678");
    await app.user.click(submit());
    const busy = screen.getByRole("button", { name: t.submitting }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    await app.user.keyboard("{Enter}");
    expect(services.auth.changePin).toHaveBeenCalledTimes(1);
    await act(async () => gate.resolve(ok(undefined)));
    await screen.findByText(t.success);
  });

  it("R57: «Cerrar sesión» llama a logout y muestra /login", async () => {
    const services = makeServices({ me: PLAYER });
    const app = await openProfile(services);
    await app.user.click(screen.getByRole("button", { name: es.profile.logout.button }));
    await screen.findByRole("heading", { level: 1, name: es.login.title });
    expect(services.auth.logout).toHaveBeenCalledTimes(1);
    expect(app.location().pathname).toBe("/login");
    expect(app.channel.posted).toEqual(["logout"]);
  });

  it("R20: si logout falla se mantiene la sesión y se muestra «No se pudo cerrar la sesión»", async () => {
    const services = makeServices({ me: PLAYER });
    services.auth.logout.mockResolvedValue(err(apiError("network", { status: 0 })));
    const app = await openProfile(services);
    await app.user.click(screen.getByRole("button", { name: es.profile.logout.button }));
    const alert = await screen.findByText(es.session.logoutFailed);
    expect(alert.getAttribute("role")).toBe("alert");
    expect(app.location().pathname).toBe("/perfil");
    expect(screen.getByRole("heading", { level: 1, name: es.profile.title })).toBeTruthy();
    expect(app.channel.posted).toEqual([]);
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: es.profile.logout.button }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
  });

  it("R86: no escribe en la consola al cambiar el PIN (éxito y errores) ni al fallar el logout", async () => {
    const services = makeServices({ me: PLAYER });
    services.auth.changePin
      .mockResolvedValueOnce(err(apiError("invalid_current_pin", { status: 403 })))
      .mockResolvedValueOnce(err(apiError("locked", { status: 429, retryAfterSeconds: 60 })))
      .mockResolvedValueOnce(ok(undefined));
    services.auth.logout.mockResolvedValue(err(apiError("internal_error", { status: 500 })));
    const app = await openProfile(services);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await fillForm(app, "1234", "5678", "5678");
      await app.user.click(submit());
      await waitFor(() => expect(services.auth.changePin).toHaveBeenCalledTimes(attempt + 1));
      await waitFor(() => expect(field(t.current).value).toBe(""));
    }
    await app.user.click(screen.getByRole("button", { name: es.profile.logout.button }));
    await screen.findByText(es.session.logoutFailed);
    consoleSpies.expectSilent();
  });
});
