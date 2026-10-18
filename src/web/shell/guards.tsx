import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import type { Role } from "../../shared";
import { ForbiddenPage } from "../features/errors/forbidden-page";
import { useSession } from "../session/session-context";
import { PublicLayout } from "./public-layout";
import { Splash } from "./splash";

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

// R28: solo rutas internas. Rechaza `//host`, esquemas, barras invertidas (algunos navegadores las
// tratan como `/`) y caracteres de control (se eliminan al analizar la URL: `/\t/evil.com`).
export function safeRedirectTarget(from: unknown): string {
  if (typeof from !== "string") return "/";
  if (!from.startsWith("/") || from.startsWith("//")) return "/";
  if (from.includes("\\") || CONTROL_CHARS.test(from)) return "/";
  const path = from.split(/[?#]/)[0] ?? "";
  if (path === "/login" || path.startsWith("/login/")) return "/";
  return from;
}

function fromOf(state: unknown): unknown {
  return typeof state === "object" && state !== null
    ? (state as { from?: unknown }).from
    : undefined;
}

// R25, R26, R16: sin sesión -> /login (guardando `from`); cargando -> indicador; error -> reintentar.
export function RequireAuth({ children }: { children: ReactNode }) {
  const { state } = useSession();
  const location = useLocation();
  if (state.status === "authenticated") return children;
  if (state.status === "anonymous") {
    const target = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/login" replace state={{ from: target }} />;
  }
  return (
    <PublicLayout>
      <Splash />
    </PublicLayout>
  );
}

// R31: la guarda de rol es solo UX; el servidor decide (403/404).
export function RequireRole({ roles, children }: { roles: readonly Role[]; children: ReactNode }) {
  const { state } = useSession();
  if (state.status !== "authenticated" || !roles.includes(state.user.role)) {
    return <ForbiddenPage />;
  }
  return children;
}

// R27: /login con sesión redirige al destino `from` (si es válido) o a `/`.
export function PublicOnly({ children }: { children: ReactNode }) {
  const { state } = useSession();
  const location = useLocation();
  if (state.status === "loading") return <Splash />;
  if (state.status === "authenticated") {
    return <Navigate to={safeRedirectTarget(fromOf(location.state))} replace />;
  }
  return children;
}
