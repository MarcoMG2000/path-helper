// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { err, ok, type AccountDto } from "../../../../src/shared";
import type { ApiResult } from "../../../../src/web/api/http-client";
import { es } from "../../../../src/web/i18n/es";
import { loadSections } from "../../../../src/web/shell/load-sections";
import { useConsoleSpies } from "../../helpers/console-spy";
import { deferred } from "../../helpers/deferred";
import {
  apiError,
  GM,
  makeAccount,
  makeServices,
  type FakeServices,
} from "../../helpers/fake-services";
import { renderApp } from "../../helpers/render-app";

const sections = loadSections();
const consoleSpies = useConsoleSpies();
const row = es.accounts.row;
const create = es.accounts.create;

const gmAccount = makeAccount({ id: GM.id, name: "Gandalf", role: "gm" });
const marta = makeAccount({ id: "p1", name: "Marta" });
const pedro = makeAccount({ id: "p2", name: "Pedro", disabled: true });
const ACCOUNTS = [gmAccount, marta, pedro];

function setup(accountsList: AccountDto[] = ACCOUNTS) {
  const services = makeServices({ me: GM, accountsList });
  return services;
}

async function openAccounts(services: FakeServices = setup()) {
  const app = renderApp({ route: "/cuentas", sections, services });
  await screen.findByRole("heading", { level: 1, name: es.accounts.title });
  return app;
}

async function openReady(services: FakeServices = setup()) {
  const app = await openAccounts(services);
  await screen.findByText(/Marta/);
  return app;
}

function rowOf(name: string): HTMLElement {
  const item = within(screen.getByRole("main"))
    .getAllByRole("listitem")
    .find((li) => li.querySelector(".ph-account__name")?.textContent?.startsWith(name));
  if (!item) throw new Error(`Sin fila para ${name}`);
  return item;
}

const buttonIn = (item: HTMLElement, name: string | RegExp) =>
  within(item).getByRole("button", { name });
const nameField = () => screen.getByLabelText(create.name) as HTMLInputElement;
const pinField = () => screen.getByLabelText(create.pin, { selector: "input" }) as HTMLInputElement;
const createSubmit = () => screen.getByRole("button", { name: create.submit });

describe("AccountsPage: lista", () => {
  it("R58: carga las cuentas con un indicador de carga y una fila por cuenta (nombre, rol y estado)", async () => {
    const services = setup();
    const gate = deferred<ApiResult<AccountDto[]>>();
    services.accounts.list.mockImplementation(() => gate.promise);
    await openAccounts(services);
    expect(screen.getByText(es.common.loading).getAttribute("role")).toBe("status");
    await act(async () => gate.resolve(ok(ACCOUNTS)));
    expect(services.accounts.list).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(es.common.loading)).toBeNull();
    expect(within(screen.getByRole("main")).getAllByRole("listitem")).toHaveLength(3);
    expect(rowOf("Gandalf").textContent).toContain("GM");
    expect(rowOf("Marta").textContent).toContain(`${es.roles.player} · ${row.active}`);
    expect(rowOf("Pedro").textContent).toContain(`${es.roles.player} · ${row.disabled}`);
  });

  it("R58: marca la cuenta propia con «(tú)»", async () => {
    await openReady();
    expect(rowOf("Gandalf").textContent).toContain(row.you);
    expect(rowOf("Marta").textContent).not.toContain(row.you);
  });

  it("R59: si la carga falla muestra el mensaje del código y «Reintentar» repite la carga", async () => {
    const services = setup();
    services.accounts.list.mockResolvedValueOnce(err(apiError("network", { status: 0 })));
    await openAccounts(services);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(es.errors.network);
    await (
      await import("@testing-library/user-event")
    ).default
      .setup()
      .click(screen.getByRole("button", { name: es.common.retry }));
    await screen.findByText(/Marta/);
    expect(services.accounts.list).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("R58: una lista vacía muestra el texto de ayuda", async () => {
    await openAccounts(setup([]));
    expect(await screen.findByText(es.accounts.list.empty)).toBeTruthy();
  });
});

describe("AccountsPage: alta", () => {
  it("R60: un alta válida llama a create, añade la cuenta, confirma y vacía el formulario", async () => {
    const services = setup();
    const app = await openReady(services);
    await app.user.type(nameField(), "Lucía");
    await app.user.type(pinField(), "4321");
    await app.user.click(createSubmit());
    await screen.findByText(create.success("Lucía"));
    expect(services.accounts.create).toHaveBeenCalledWith("Lucía", "4321");
    expect(screen.getByText(create.success("Lucía")).getAttribute("role")).toBe("status");
    expect(rowOf("Lucía").textContent).toContain(row.active);
    expect(nameField().value).toBe("");
    expect(pinField().value).toBe("");
  });

  it("R60: recorta los espacios del nombre antes de enviarlo", async () => {
    const services = setup();
    const app = await openReady(services);
    await app.user.type(nameField(), "  Lucía  ");
    await app.user.type(pinField(), "4321");
    await app.user.click(createSubmit());
    await screen.findByText(create.success("Lucía"));
    expect(services.accounts.create).toHaveBeenCalledWith("Lucía", "4321");
  });

  it.each([
    ["nombre vacío", "", "1234", "name"],
    ["nombre de solo espacios", "   ", "1234", "name"],
    ["nombre de 33 caracteres", "a".repeat(33), "1234", "name"],
    ["nombre con carácter de control", "a\u0001b", "1234", "name"],
    ["nombre con carácter de formato (RLO)", "a\u202eb", "1234", "name"],
    ["nombre con carácter de ancho cero", "a\u200bb", "1234", "name"],
    ["PIN de 3 dígitos", "Lucía", "123", "pin"],
    ["PIN de 9 dígitos", "Lucía", "123456789", "pin"],
    ["PIN con letras", "Lucía", "12a4", "pin"],
    ["PIN vacío", "Lucía", "", "pin"],
  ])("R61: %s -> error junto al campo y sin llamar a la API", async (_label, name, pin, which) => {
    const services = setup();
    await openReady(services);
    fireEvent.change(nameField(), { target: { value: name } });
    fireEvent.change(pinField(), { target: { value: pin } });
    fireEvent.click(createSubmit());
    const field = which === "name" ? nameField() : pinField();
    await waitFor(() => expect(field.getAttribute("aria-invalid")).toBe("true"));
    const alert = document.getElementById(field.getAttribute("aria-describedby")!.split(" ")[0]!);
    expect(alert?.getAttribute("role")).toBe("alert");
    expect(alert?.textContent).toBe(which === "name" ? create.nameInvalid : create.pinInvalid);
    expect(services.accounts.create).not.toHaveBeenCalled();
  });

  it("R62: name_taken marca el nombre, conserva los valores salvo el PIN", async () => {
    const services = setup();
    services.accounts.create.mockResolvedValue(err(apiError("name_taken", { status: 409 })));
    const app = await openReady(services);
    await app.user.type(nameField(), "marta");
    await app.user.type(pinField(), "4321");
    await app.user.click(createSubmit());
    const alert = await screen.findByText(es.errors.name_taken as string);
    expect(alert.getAttribute("role")).toBe("alert");
    expect(nameField().getAttribute("aria-invalid")).toBe("true");
    expect(nameField().value).toBe("marta");
    expect(pinField().value).toBe("");
    expect(within(screen.getByRole("main")).getAllByRole("listitem")).toHaveLength(3);
  });

  it("R60: otros errores del alta se muestran en un role=alert del formulario", async () => {
    const services = setup();
    services.accounts.create.mockResolvedValue(err(apiError("network", { status: 0 })));
    const app = await openReady(services);
    await app.user.type(nameField(), "Lucía");
    await app.user.type(pinField(), "4321");
    await app.user.click(createSubmit());
    const alert = await screen.findByText(es.errors.network as string);
    expect(alert.getAttribute("role")).toBe("alert");
    expect(nameField().value).toBe("Lucía");
  });
});

describe("AccountsPage: acciones de fila", () => {
  it("R63: restablecer el PIN abre un panel, llama a resetPin con el id y confirma en la fila", async () => {
    const services = setup();
    const app = await openReady(services);
    const item = rowOf("Marta");
    await app.user.click(buttonIn(item, row.resetPinFor("Marta")));
    const input = within(item).getByLabelText(row.newPin, { selector: "input" });
    expect(document.activeElement).toBe(input);
    await app.user.type(input, "9999");
    await app.user.click(within(item).getByRole("button", { name: row.savePin }));
    await within(item).findByText(row.resetSuccess);
    expect(services.accounts.resetPin).toHaveBeenCalledWith("p1", "9999");
    expect(within(item).queryByLabelText(row.newPin)).toBeNull();
    expect(within(item).getByText(row.resetSuccess).getAttribute("role")).toBe("status");
  });

  it("R63: cancelar cierra el panel sin llamar a la API", async () => {
    const services = setup();
    const app = await openReady(services);
    const item = rowOf("Marta");
    await app.user.click(buttonIn(item, row.resetPinFor("Marta")));
    await app.user.type(within(item).getByLabelText(row.newPin, { selector: "input" }), "9999");
    await app.user.click(within(item).getByRole("button", { name: es.common.cancel }));
    expect(within(item).queryByLabelText(row.newPin)).toBeNull();
    expect(services.accounts.resetPin).not.toHaveBeenCalled();
  });

  it("R63: un PIN inválido en el panel muestra el error y no llama a la API", async () => {
    const services = setup();
    const app = await openReady(services);
    const item = rowOf("Marta");
    await app.user.click(buttonIn(item, row.resetPinFor("Marta")));
    await app.user.type(within(item).getByLabelText(row.newPin, { selector: "input" }), "12");
    await app.user.click(within(item).getByRole("button", { name: row.savePin }));
    expect(within(item).getByText(row.newPinInvalid).getAttribute("role")).toBe("alert");
    expect(services.accounts.resetPin).not.toHaveBeenCalled();
  });

  it("R64: deshabilitar pide confirmación en la fila y solo al confirmar llama a setDisabled(id, true)", async () => {
    const services = setup();
    const app = await openReady(services);
    const item = rowOf("Marta");
    await app.user.click(buttonIn(item, row.disableFor("Marta")));
    expect(within(item).getByText(row.confirmDisable("Marta"))).toBeTruthy();
    expect(services.accounts.setDisabled).not.toHaveBeenCalled();
    await app.user.click(within(item).getByRole("button", { name: row.confirmDisableYes }));
    await within(item).findByText(row.disableSuccess);
    expect(services.accounts.setDisabled).toHaveBeenCalledWith("p1", true);
    expect(item.textContent).toContain(`${es.roles.player} · ${row.disabled}`);
    expect(within(item).getByRole("button", { name: row.enableFor("Marta") })).toBeTruthy();
    expect(within(item).queryByRole("button", { name: row.disableFor("Marta") })).toBeNull();
  });

  it("R64: cancelar la confirmación no llama a la API y deja la cuenta como estaba", async () => {
    const services = setup();
    const app = await openReady(services);
    const item = rowOf("Marta");
    await app.user.click(buttonIn(item, row.disableFor("Marta")));
    await app.user.click(within(item).getByRole("button", { name: es.common.cancel }));
    expect(services.accounts.setDisabled).not.toHaveBeenCalled();
    expect(within(item).getByRole("button", { name: row.disableFor("Marta") })).toBeTruthy();
    expect(item.textContent).toContain(row.active);
  });

  it("R65: habilitar llama a setDisabled(id, false) y actualiza la fila a «Activa»", async () => {
    const services = setup();
    const app = await openReady(services);
    const item = rowOf("Pedro");
    await app.user.click(buttonIn(item, row.enableFor("Pedro")));
    await within(item).findByText(row.enableSuccess);
    expect(services.accounts.setDisabled).toHaveBeenCalledWith("p2", false);
    expect(item.textContent).toContain(`${es.roles.player} · ${row.active}`);
    expect(within(item).getByRole("button", { name: row.disableFor("Pedro") })).toBeTruthy();
  });

  it("R66: «Desbloquear» está en todas las filas de jugadores y llama a unlock con el id", async () => {
    const services = setup();
    const app = await openReady(services);
    expect(
      within(rowOf("Marta")).getByRole("button", { name: row.unlockFor("Marta") }),
    ).toBeTruthy();
    expect(
      within(rowOf("Pedro")).getByRole("button", { name: row.unlockFor("Pedro") }),
    ).toBeTruthy();
    const item = rowOf("Pedro");
    await app.user.click(buttonIn(item, row.unlockFor("Pedro")));
    await within(item).findByText(row.unlockSuccess);
    expect(services.accounts.unlock).toHaveBeenCalledWith("p2");
    expect(within(item).getByText(row.unlockSuccess).getAttribute("role")).toBe("status");
  });

  it("R67: la fila del GM no ofrece acciones e indica que su PIN se cambia en «Mi perfil»", async () => {
    await openReady();
    const item = rowOf("Gandalf");
    expect(within(item).queryAllByRole("button")).toHaveLength(0);
    expect(within(item).getByText(row.gmHint)).toBeTruthy();
  });

  it("R68: not_found muestra el error en la fila y recarga la lista", async () => {
    const services = setup();
    services.accounts.unlock.mockResolvedValue(err(apiError("not_found", { status: 404 })));
    const app = await openReady(services);
    const item = rowOf("Marta");
    await app.user.click(buttonIn(item, row.unlockFor("Marta")));
    const alert = await within(item).findByText(es.errors.not_found as string);
    expect(alert.getAttribute("role")).toBe("alert");
    await waitFor(() => expect(services.accounts.list).toHaveBeenCalledTimes(2));
    expect(within(rowOf("Marta")).getByText(es.errors.not_found as string)).toBeTruthy();
  });

  it.each(["network", "forbidden", "unexpected", "validation_error"] as const)(
    "R69: el error %s se muestra en un role=alert de la fila sin alterar la cuenta",
    async (code) => {
      const services = setup();
      services.accounts.setDisabled.mockResolvedValue(
        err(apiError(code, { status: code === "network" ? 0 : 400 })),
      );
      const app = await openReady(services);
      const item = rowOf("Marta");
      await app.user.click(buttonIn(item, row.disableFor("Marta")));
      await app.user.click(within(item).getByRole("button", { name: row.confirmDisableYes }));
      const alert = await within(item).findByText(es.errors[code] as string);
      expect(alert.getAttribute("role")).toBe("alert");
      expect(item.textContent).toContain(`${es.roles.player} · ${row.active}`);
      expect(services.accounts.list).toHaveBeenCalledTimes(1);
    },
  );

  it("R69: un error de restablecer PIN también se muestra en la fila", async () => {
    const services = setup();
    services.accounts.resetPin.mockResolvedValue(err(apiError("forbidden", { status: 403 })));
    const app = await openReady(services);
    const item = rowOf("Marta");
    await app.user.click(buttonIn(item, row.resetPinFor("Marta")));
    await app.user.type(within(item).getByLabelText(row.newPin, { selector: "input" }), "9999");
    await app.user.click(within(item).getByRole("button", { name: row.savePin }));
    expect(
      (await within(item).findByText(es.errors.forbidden as string)).getAttribute("role"),
    ).toBe("alert");
  });

  it("R70: mientras una acción está en curso se deshabilitan los botones de esa fila (y solo de esa)", async () => {
    const services = setup();
    const gate = deferred<ApiResult<void>>();
    services.accounts.unlock.mockImplementation(() => gate.promise);
    const app = await openReady(services);
    const item = rowOf("Marta");
    await app.user.click(buttonIn(item, row.unlockFor("Marta")));
    const buttons = within(item).getAllByRole("button") as HTMLButtonElement[];
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.every((b) => b.disabled)).toBe(true);
    const others = within(rowOf("Pedro")).getAllByRole("button") as HTMLButtonElement[];
    expect(others.every((b) => !b.disabled)).toBe(true);
    await act(async () => gate.resolve(ok(undefined)));
    await within(item).findByText(row.unlockSuccess);
    expect(
      (within(item).getAllByRole("button") as HTMLButtonElement[]).every((b) => !b.disabled),
    ).toBe(true);
  });

  it("R86: no escribe en la consola en el alta ni en las acciones de fila (incluidos los errores)", async () => {
    const services = setup();
    services.accounts.create.mockResolvedValueOnce(err(apiError("name_taken", { status: 409 })));
    services.accounts.unlock.mockResolvedValueOnce(err(apiError("not_found", { status: 404 })));
    services.accounts.setDisabled.mockResolvedValueOnce(err(apiError("network", { status: 0 })));
    const app = await openReady(services);
    await app.user.type(nameField(), "Marta");
    await app.user.type(pinField(), "4321");
    await app.user.click(createSubmit());
    await screen.findByText(es.errors.name_taken as string);
    const item = rowOf("Marta");
    await app.user.click(buttonIn(item, row.unlockFor("Marta")));
    await within(item).findByText(es.errors.not_found as string);
    await app.user.click(buttonIn(rowOf("Marta"), row.disableFor("Marta")));
    await app.user.click(
      within(rowOf("Marta")).getByRole("button", { name: row.confirmDisableYes }),
    );
    await within(rowOf("Marta")).findByText(es.errors.network as string);
    consoleSpies.expectSilent();
  });
});

describe("AccountsPage: gestión del foco en los paneles de la fila", () => {
  const confirmYes = (item: HTMLElement) =>
    within(item).getByRole("button", { name: row.confirmDisableYes });

  it("R90: al abrir «Deshabilitar» el foco va al primer botón de la confirmación", async () => {
    const app = await openReady();
    const item = rowOf("Marta");
    await app.user.click(buttonIn(item, row.disableFor("Marta")));
    expect(document.activeElement).toBe(confirmYes(item));
  });

  it("R90: «Cancelar» de la confirmación devuelve el foco al botón «Deshabilitar»", async () => {
    const app = await openReady();
    const item = rowOf("Marta");
    await app.user.click(buttonIn(item, row.disableFor("Marta")));
    await app.user.click(within(item).getByRole("button", { name: es.common.cancel }));
    expect(document.activeElement).toBe(buttonIn(item, row.disableFor("Marta")));
  });

  it("R90: «Cancelar» del panel de PIN devuelve el foco al botón «Restablecer PIN»", async () => {
    const app = await openReady();
    const item = rowOf("Marta");
    await app.user.click(buttonIn(item, row.resetPinFor("Marta")));
    expect(document.activeElement).toBe(
      within(item).getByLabelText(row.newPin, { selector: "input" }),
    );
    await app.user.click(within(item).getByRole("button", { name: es.common.cancel }));
    expect(document.activeElement).toBe(buttonIn(item, row.resetPinFor("Marta")));
  });

  it("R90: tras restablecer el PIN con éxito el foco vuelve a «Restablecer PIN»", async () => {
    const app = await openReady();
    const item = rowOf("Marta");
    await app.user.click(buttonIn(item, row.resetPinFor("Marta")));
    await app.user.type(within(item).getByLabelText(row.newPin, { selector: "input" }), "9999");
    await app.user.click(within(item).getByRole("button", { name: row.savePin }));
    await within(item).findByText(row.resetSuccess);
    expect(document.activeElement).toBe(buttonIn(item, row.resetPinFor("Marta")));
  });

  it("R90: un error al restablecer o un PIN inválido devuelven el foco al campo de PIN", async () => {
    const services = setup();
    services.accounts.resetPin.mockResolvedValueOnce(err(apiError("network", { status: 0 })));
    const app = await openReady(services);
    const item = rowOf("Marta");
    await app.user.click(buttonIn(item, row.resetPinFor("Marta")));
    const input = () => within(item).getByLabelText(row.newPin, { selector: "input" });
    await app.user.type(input(), "12");
    await app.user.click(within(item).getByRole("button", { name: row.savePin }));
    expect(document.activeElement).toBe(input());
    await app.user.clear(input());
    await app.user.type(input(), "9999");
    await app.user.click(within(item).getByRole("button", { name: row.savePin }));
    await within(item).findByText(es.errors.network as string);
    expect(document.activeElement).toBe(input());
  });

  it("R90: tras deshabilitar el foco queda en «Habilitar»; tras habilitar, en «Deshabilitar»", async () => {
    const app = await openReady();
    const item = rowOf("Marta");
    await app.user.click(buttonIn(item, row.disableFor("Marta")));
    await app.user.click(confirmYes(item));
    await within(item).findByText(row.disableSuccess);
    expect(document.activeElement).toBe(buttonIn(item, row.enableFor("Marta")));
    await app.user.click(buttonIn(item, row.enableFor("Marta")));
    await within(item).findByText(row.enableSuccess);
    expect(document.activeElement).toBe(buttonIn(item, row.disableFor("Marta")));
  });

  it("R90: un error al deshabilitar devuelve el foco a la confirmación; «Desbloquear» conserva el foco", async () => {
    const services = setup();
    services.accounts.setDisabled.mockResolvedValueOnce(err(apiError("network", { status: 0 })));
    const app = await openReady(services);
    const item = rowOf("Marta");
    await app.user.click(buttonIn(item, row.disableFor("Marta")));
    await app.user.click(confirmYes(item));
    await within(item).findByText(es.errors.network as string);
    expect(document.activeElement).toBe(confirmYes(item));
    await app.user.click(within(item).getByRole("button", { name: es.common.cancel }));
    await app.user.click(buttonIn(item, row.unlockFor("Marta")));
    await within(item).findByText(row.unlockSuccess);
    expect(document.activeElement).toBe(buttonIn(item, row.unlockFor("Marta")));
  });
});
