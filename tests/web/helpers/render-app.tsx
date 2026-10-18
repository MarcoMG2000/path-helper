import { cleanup, render, type RenderResult } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MemoryRouter, parsePath, useLocation, type Location } from "react-router";
import { afterEach } from "vitest";
import { App } from "../../../src/web/app";
import { ServicesProvider } from "../../../src/web/api/services";
import { SessionProvider } from "../../../src/web/session/session-context";
import type { AppSection } from "../../../src/web/shell/sections";
import type { ReactNode } from "react";
import type { FakeSessionChannel } from "./fake-session-channel";
import { makeFakeSessionChannel } from "./fake-session-channel";
import { makeServices, type FakeServices } from "./fake-services";

// No hay globals de Vitest: Testing Library no se limpia solo.
afterEach(cleanup);

export interface RenderOptions {
  route?: string;
  /** `location.state` de la entrada inicial. */
  state?: unknown;
  services?: FakeServices;
  sections?: readonly AppSection[];
  channel?: FakeSessionChannel;
}

export interface RenderedApp extends RenderResult {
  user: UserEvent;
  services: FakeServices;
  channel: FakeSessionChannel;
  location: () => Location;
}

/** Monta la App completa con MemoryRouter, servicios falsos y un canal de sesión falso. */
export function renderApp(options: RenderOptions = {}): RenderedApp {
  const services = options.services ?? makeServices();
  const channel = options.channel ?? makeFakeSessionChannel();
  let current: Location | undefined;
  function Probe() {
    current = useLocation();
    return null;
  }
  const entry = { ...parsePath(options.route ?? "/"), state: options.state };
  const result = render(
    <MemoryRouter initialEntries={[entry]}>
      <Probe />
      <App services={services} sections={options.sections} channel={channel} />
    </MemoryRouter>,
  );
  return {
    ...result,
    user: userEvent.setup(),
    services,
    channel,
    location: () => {
      if (!current) throw new Error("Probe sin renderizar");
      return current;
    },
  };
}

/** Monta solo un componente dentro del proveedor de sesión (sin rutas de la app). */
export function renderWithSession(
  ui: ReactNode,
  options: Pick<RenderOptions, "services" | "channel" | "route"> = {},
): RenderedApp {
  const services = options.services ?? makeServices();
  const channel = options.channel ?? makeFakeSessionChannel();
  let current: Location | undefined;
  function Probe() {
    current = useLocation();
    return null;
  }
  const result = render(
    <MemoryRouter initialEntries={[options.route ?? "/"]}>
      <Probe />
      <ServicesProvider services={services}>
        <SessionProvider channel={channel}>{ui}</SessionProvider>
      </ServicesProvider>
    </MemoryRouter>,
  );
  return {
    ...result,
    user: userEvent.setup(),
    services,
    channel,
    location: () => {
      if (!current) throw new Error("Probe sin renderizar");
      return current;
    },
  };
}
