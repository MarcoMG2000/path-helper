// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { err, ok, type UserDto } from "../../../src/shared";
import { ServicesProvider } from "../../../src/web/api/services";
import {
  SessionProvider,
  useSession,
  type SessionValue,
} from "../../../src/web/session/session-context";
import { makeFakeSessionChannel } from "../helpers/fake-session-channel";
import { apiError, GM, makeServices, PLAYER } from "../helpers/fake-services";
import { renderWithSession } from "../helpers/render-app";
import { SENTINEL_PIN } from "../helpers/sentinel";

function makeProbe() {
  const holder: { session: SessionValue | null } = { session: null };
  function Probe() {
    const session = useSession();
    holder.session = session;
    const { state } = session;
    return (
      <p data-testid="status">
        {state.status}
        {state.status === "authenticated" ? `:${state.user.name}` : ""}
        {state.status === "anonymous" && state.notice ? `:${state.notice}` : ""}
      </p>
    );
  }
  return {
    Probe,
    get: () => {
      if (!holder.session) throw new Error("sin sesión");
      return holder.session;
    },
  };
}

const statusText = () => screen.getByTestId("status").textContent;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("SessionProvider", () => {
  it("R13: al montar consulta me una vez y está en loading hasta recibir la respuesta", async () => {
    const services = makeServices({ me: GM });
    const gate = deferred<ReturnType<typeof ok<UserDto>>>();
    services.auth.me.mockImplementation(() => gate.promise);
    const { Probe } = makeProbe();
    renderWithSession(<Probe />, { services });
    expect(statusText()).toBe("loading");
    expect(services.auth.me).toHaveBeenCalledTimes(1);
    await act(async () => gate.resolve(ok(GM)));
    expect(statusText()).toBe("authenticated:Gandalf");
    expect(services.auth.me).toHaveBeenCalledTimes(1);
  });

  it("R14: me 200 pasa a authenticated con {id, name, role}", async () => {
    const { Probe, get } = makeProbe();
    renderWithSession(<Probe />, { services: makeServices({ me: PLAYER }) });
    await waitFor(() => expect(statusText()).toBe("authenticated:Marta"));
    expect(get().state).toEqual({ status: "authenticated", user: PLAYER });
  });

  it("R15: me 401 pasa a anonymous sin aviso", async () => {
    const { Probe, get } = makeProbe();
    renderWithSession(<Probe />, { services: makeServices() });
    await waitFor(() => expect(statusText()).toBe("anonymous"));
    expect(get().state).toEqual({ status: "anonymous" });
  });

  it("R16: me con red caída o 5xx pasa a error y reload repite la consulta", async () => {
    for (const failure of [
      apiError("network", { status: 0 }),
      apiError("internal_error", { status: 500 }),
    ]) {
      const services = makeServices({ me: failure });
      const { Probe, get } = makeProbe();
      const view = renderWithSession(<Probe />, { services });
      await waitFor(() => expect(statusText()).toBe("error"));
      services.auth.me.mockResolvedValue(ok(GM));
      act(() => get().reload());
      await waitFor(() => expect(statusText()).toBe("authenticated:Gandalf"));
      expect(services.auth.me).toHaveBeenCalledTimes(2);
      view.unmount();
    }
  });

  it("R17: login correcto pasa a authenticated y avisa al canal", async () => {
    const services = makeServices();
    services.auth.login.mockResolvedValue(ok(PLAYER));
    const channel = makeFakeSessionChannel();
    const { Probe, get } = makeProbe();
    renderWithSession(<Probe />, { services, channel });
    await waitFor(() => expect(statusText()).toBe("anonymous"));
    let result: Awaited<ReturnType<SessionValue["login"]>> | undefined;
    await act(async () => {
      result = await get().login("Marta", "1234");
    });
    expect(result?.ok).toBe(true);
    expect(statusText()).toBe("authenticated:Marta");
    expect(channel.posted).toEqual(["login"]);
  });

  it("R17: un login fallido mantiene anonymous, devuelve el error y no avisa al canal", async () => {
    const services = makeServices();
    services.auth.login.mockResolvedValue(err(apiError("invalid_credentials", { status: 401 })));
    const channel = makeFakeSessionChannel();
    const { Probe, get } = makeProbe();
    renderWithSession(<Probe />, { services, channel });
    await waitFor(() => expect(statusText()).toBe("anonymous"));
    let result: Awaited<ReturnType<SessionValue["login"]>> | undefined;
    await act(async () => {
      result = await get().login("Marta", "0000");
    });
    expect(result).toMatchObject({ ok: false, error: { code: "invalid_credentials" } });
    expect(statusText()).toBe("anonymous");
    expect(channel.posted).toEqual([]);
  });

  it("R18: un 401 unauthenticated con sesión activa pasa a anonymous con aviso expired", async () => {
    const services = makeServices({ me: PLAYER });
    const { Probe } = makeProbe();
    renderWithSession(<Probe />, { services });
    await waitFor(() => expect(statusText()).toBe("authenticated:Marta"));
    act(() => services.emitUnauthenticated());
    expect(statusText()).toBe("anonymous:expired");
  });

  it("R18: un 401 durante loading o anonymous no genera aviso", async () => {
    const services = makeServices();
    const { Probe } = makeProbe();
    renderWithSession(<Probe />, { services });
    act(() => services.emitUnauthenticated());
    await waitFor(() => expect(statusText()).toBe("anonymous"));
    act(() => services.emitUnauthenticated());
    expect(statusText()).toBe("anonymous");
  });

  it("R19: logout correcto pasa a anonymous y publica logout en el canal", async () => {
    const services = makeServices({ me: PLAYER });
    const channel = makeFakeSessionChannel();
    const { Probe, get } = makeProbe();
    renderWithSession(<Probe />, { services, channel });
    await waitFor(() => expect(statusText()).toBe("authenticated:Marta"));
    await act(async () => {
      await get().logout();
    });
    expect(statusText()).toBe("anonymous");
    expect(channel.posted).toEqual(["logout"]);
  });

  it("R20: si logout falla la sesión se mantiene y no se publica nada", async () => {
    const services = makeServices({ me: PLAYER });
    services.auth.logout.mockResolvedValue(err(apiError("network", { status: 0 })));
    const channel = makeFakeSessionChannel();
    const { Probe, get } = makeProbe();
    renderWithSession(<Probe />, { services, channel });
    await waitFor(() => expect(statusText()).toBe("authenticated:Marta"));
    let result: Awaited<ReturnType<SessionValue["logout"]>> | undefined;
    await act(async () => {
      result = await get().logout();
    });
    expect(result?.ok).toBe(false);
    expect(statusText()).toBe("authenticated:Marta");
    expect(channel.posted).toEqual([]);
  });

  it("R21: logout recibido por el canal con sesión activa -> anonymous signed-out-elsewhere sin llamar al servidor", async () => {
    const services = makeServices({ me: PLAYER });
    const channel = makeFakeSessionChannel();
    const { Probe } = makeProbe();
    renderWithSession(<Probe />, { services, channel });
    await waitFor(() => expect(statusText()).toBe("authenticated:Marta"));
    act(() => channel.receive("logout"));
    expect(statusText()).toBe("anonymous:signed-out-elsewhere");
    expect(services.auth.logout).not.toHaveBeenCalled();
    expect(channel.posted).toEqual([]);
  });

  it("R22: login recibido por el canal con sesión anónima vuelve a consultar me", async () => {
    const services = makeServices();
    const channel = makeFakeSessionChannel();
    const { Probe } = makeProbe();
    renderWithSession(<Probe />, { services, channel });
    await waitFor(() => expect(statusText()).toBe("anonymous"));
    services.auth.me.mockResolvedValue(ok(GM));
    act(() => channel.receive("login"));
    await waitFor(() => expect(statusText()).toBe("authenticated:Gandalf"));
    expect(services.auth.me).toHaveBeenCalledTimes(2);
  });

  it("R22: login recibido con sesión ya activa no consulta me", async () => {
    const services = makeServices({ me: GM });
    const channel = makeFakeSessionChannel();
    const { Probe } = makeProbe();
    renderWithSession(<Probe />, { services, channel });
    await waitFor(() => expect(statusText()).toBe("authenticated:Gandalf"));
    act(() => channel.receive("login"));
    expect(services.auth.me).toHaveBeenCalledTimes(1);
  });

  it("R24: el estado solo contiene id, name, role y avisos (sin PIN ni token)", async () => {
    const services = makeServices();
    services.auth.login.mockResolvedValue(
      ok({ ...PLAYER, token: "secreto", pin: SENTINEL_PIN } as UserDto),
    );
    const channel = makeFakeSessionChannel();
    const { Probe, get } = makeProbe();
    const view = renderWithSession(<Probe />, { services, channel });
    await waitFor(() => expect(statusText()).toBe("anonymous"));
    await act(async () => {
      await get().login("Marta", SENTINEL_PIN);
    });
    const serialized = JSON.stringify(get().state);
    expect(serialized).not.toContain(SENTINEL_PIN);
    expect(serialized).not.toContain("secreto");
    expect(Object.keys((get().state as { user: object }).user).sort()).toEqual([
      "id",
      "name",
      "role",
    ]);
    expect(view.container.innerHTML).not.toContain(SENTINEL_PIN);
    expect(JSON.stringify(channel.posted)).not.toContain(SENTINEL_PIN);
  });

  it("R13: con StrictMode (doble montaje) prevalece la última respuesta y no queda un estado obsoleto", async () => {
    const services = makeServices();
    const first = deferred<ReturnType<typeof ok<UserDto>>>();
    const second = deferred<ReturnType<typeof ok<UserDto>>>();
    services.auth.me.mockImplementationOnce(() => first.promise);
    services.auth.me.mockImplementationOnce(() => second.promise);
    const { Probe } = makeProbe();
    render(
      <StrictMode>
        <MemoryRouter>
          <ServicesProvider services={services}>
            <SessionProvider>
              <Probe />
            </SessionProvider>
          </ServicesProvider>
        </MemoryRouter>
      </StrictMode>,
    );
    expect(services.auth.me).toHaveBeenCalledTimes(2);
    await act(async () => second.resolve(ok(GM)));
    await act(async () => first.resolve(ok(PLAYER)));
    expect(statusText()).toBe("authenticated:Gandalf");
  });

  it("clearNotice retira el aviso de sesión", async () => {
    const services = makeServices({ me: PLAYER });
    const { Probe, get } = makeProbe();
    renderWithSession(<Probe />, { services });
    await waitFor(() => expect(statusText()).toBe("authenticated:Marta"));
    act(() => services.emitUnauthenticated());
    expect(statusText()).toBe("anonymous:expired");
    act(() => get().clearNotice());
    expect(statusText()).toBe("anonymous");
  });
});
