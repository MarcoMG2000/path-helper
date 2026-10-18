import { Outlet } from "react-router";
import { es } from "../i18n/es";
import { useUser } from "../session/session-context";
import { Footer } from "./footer";
import { Nav } from "./nav";
import type { AppSection } from "./sections";
import { MAIN_ID, SkipLink } from "./skip-link";

// R36: enlace de salto como primer enfocable y landmarks header, nav, main y footer.
export function AppLayout({ sections }: { sections: readonly AppSection[] }) {
  const user = useUser();
  return (
    <div className="ph-app">
      <SkipLink />
      <header className="ph-header">
        <div className="ph-header__inner">
          <span className="ph-brand">{es.appName}</span>
          <span className="ph-user">{es.layout.signedInAs(user.name, es.roles[user.role])}</span>
        </div>
        <Nav sections={sections} role={user.role} />
      </header>
      <main id={MAIN_ID} className="ph-main" tabIndex={-1}>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
