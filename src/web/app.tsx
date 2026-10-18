import { useMemo } from "react";
import { ServicesProvider, type AppServices } from "./api/services";
import { loadSections } from "./shell/load-sections";
import { AppErrorBoundary } from "./shell/error-boundary";
import { AppRoutes } from "./shell/routes";
import type { AppSection } from "./shell/sections";
import { SessionProvider } from "./session/session-context";
import type { SessionChannel } from "./session/session-channel";

// El router (BrowserRouter / MemoryRouter) lo aporta quien monta la app: main.tsx o los tests.
export function App({
  services,
  sections,
  channel,
}: {
  services: AppServices;
  sections?: readonly AppSection[];
  channel?: SessionChannel;
}) {
  const resolved = useMemo(() => sections ?? loadSections(), [sections]);
  return (
    <AppErrorBoundary>
      <ServicesProvider services={services}>
        <SessionProvider channel={channel}>
          <AppRoutes sections={resolved} />
        </SessionProvider>
      </ServicesProvider>
    </AppErrorBoundary>
  );
}
