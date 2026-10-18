import { createContext, useContext, type ReactNode } from "react";
import { createAccountsApi, type AccountsApi } from "./accounts-api";
import { createAuthApi, type AuthApi } from "./auth-api";
import { fetchHealth } from "./health";
import { createHttpClient, type HttpClientDeps } from "./http-client";

// Inyección de dependencias de la UI: las features futuras añaden aquí sus módulos de API.
export interface AppServices {
  auth: AuthApi;
  accounts: AccountsApi;
  checkHealth: () => ReturnType<typeof fetchHealth>;
  /** Suscripción al evento «el servidor dijo 401 unauthenticated». */
  onUnauthenticated(handler: () => void): () => void;
}

// El emisor conecta el cliente HTTP (creado antes que React) con el SessionProvider.
export function createServices(deps: HttpClientDeps = {}): AppServices {
  const handlers = new Set<() => void>();
  const http = createHttpClient({
    ...deps,
    onUnauthenticated: () => {
      deps.onUnauthenticated?.();
      for (const handler of [...handlers]) handler();
    },
  });
  return {
    auth: createAuthApi(http),
    accounts: createAccountsApi(http),
    checkHealth: () => fetchHealth(deps.fetchFn),
    onUnauthenticated(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
  };
}

const ServicesContext = createContext<AppServices | null>(null);

export function ServicesProvider({
  services,
  children,
}: {
  services: AppServices;
  children: ReactNode;
}) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): AppServices {
  const services = useContext(ServicesContext);
  if (!services) throw new Error("useServices requiere un ServicesProvider");
  return services;
}
