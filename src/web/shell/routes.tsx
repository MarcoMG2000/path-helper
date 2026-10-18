import { useRoutes, type RouteObject } from "react-router";
import { NotFoundPage } from "../features/errors/not-found-page";
import { HomePage } from "../features/home/home-page";
import { LegalPage } from "../features/legal/legal-page";
import { LoginPage } from "../features/login/login-page";
import { AppLayout } from "./app-layout";
import { PublicOnly, RequireAuth, RequireRole } from "./guards";
import { PublicLayout } from "./public-layout";
import type { AppSection } from "./sections";

// Árbol de rutas (design §8.1). Una sección añadida crea su ruta (con guarda de sesión y de rol)
// y su entrada de navegación sin tocar este fichero (R33).
export function buildRoutes(sections: readonly AppSection[]): RouteObject[] {
  return [
    {
      element: <PublicLayout />,
      children: [
        {
          path: "/login",
          element: (
            <PublicOnly>
              <LoginPage />
            </PublicOnly>
          ),
        },
        { path: "/legal", element: <LegalPage /> },
      ],
    },
    {
      element: (
        <RequireAuth>
          <AppLayout sections={sections} />
        </RequireAuth>
      ),
      children: [
        { index: true, element: <HomePage sections={sections} /> },
        ...sections.map((section): RouteObject => ({
          path: section.path,
          element: (
            <RequireRole roles={section.roles}>
              <section.Component />
            </RequireRole>
          ),
          children: section.children,
        })),
        { path: "*", element: <NotFoundPage /> },
      ],
    },
  ];
}

export function AppRoutes({ sections }: { sections: readonly AppSection[] }) {
  return useRoutes(buildRoutes(sections));
}
