import { Outlet } from "react-router";
import type { ReactNode } from "react";
import { es } from "../i18n/es";
import { Footer } from "./footer";
import { MAIN_ID, SkipLink } from "./skip-link";

// Layout sin navegación (login, legal, pantallas de carga). Como ruta de layout renderiza <Outlet />.
export function PublicLayout({ children }: { children?: ReactNode }) {
  return (
    <div className="ph-app ph-app--public">
      <SkipLink />
      <header className="ph-header">
        <div className="ph-header__inner">
          <span className="ph-brand">{es.appName}</span>
        </div>
      </header>
      <main id={MAIN_ID} className="ph-main" tabIndex={-1}>
        {children ?? <Outlet />}
      </main>
      <Footer />
    </div>
  );
}
