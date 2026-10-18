import type { ComponentType } from "react";
import type { RouteObject } from "react-router";
import type { Role } from "../../shared";

// Contrato de extensión del shell: una feature añade `src/web/features/<x>/section.tsx` con
// `export default defineSection({...})` (o un array) y no toca el shell. La autorización real
// sigue en el servidor; roles/guardas aquí son solo experiencia de usuario.
export interface AppSection {
  /** kebab-case único: "accounts", "character-sheet". */
  id: string;
  /** Ruta absoluta de primer nivel: "/cuentas". */
  path: string;
  /** Texto de navegación YA traducido (viene de es.*). */
  label: string;
  /** Quién la ve y puede entrar. */
  roles: readonly Role[];
  /** Posición en la navegación (menor = antes). */
  order: number;
  /** Si tiene `children`, debe renderizar <Outlet />. */
  Component: ComponentType;
  /** Subrutas relativas ("/ficha/:id" -> path "/ficha", child ":id"). */
  children?: RouteObject[];
  /** true = ruta sin entrada en la navegación. */
  hidden?: boolean;
}

export function defineSection(section: AppSection): AppSection {
  return section;
}

export const RESERVED_PATHS: readonly string[] = ["/", "/login", "/legal", "/api", "/health"];

function isReserved(path: string): boolean {
  return RESERVED_PATHS.some(
    (reserved) => path === reserved || (reserved !== "/" && path.startsWith(`${reserved}/`)),
  );
}

// R35: lanza un error que nombra el `id` ofensor.
export function validateSections(sections: readonly AppSection[]): void {
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const section of sections) {
    const where = `Sección "${section.id}"`;
    if (ids.has(section.id)) throw new Error(`${where}: id duplicado`);
    ids.add(section.id);
    if (!section.path.startsWith("/") || section.path.length < 2 || section.path.endsWith("/")) {
      throw new Error(`${where}: ruta inválida "${section.path}"`);
    }
    if (isReserved(section.path)) {
      throw new Error(`${where}: la ruta "${section.path}" está reservada`);
    }
    if (paths.has(section.path)) throw new Error(`${where}: ruta duplicada "${section.path}"`);
    paths.add(section.path);
  }
}

export function sortSections(sections: readonly AppSection[]): AppSection[] {
  return [...sections].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

/** Secciones con entrada en la navegación para ese rol, ya ordenadas. */
export function visibleSections(sections: readonly AppSection[], role: Role): AppSection[] {
  return sortSections(sections.filter((s) => !s.hidden && s.roles.includes(role)));
}
