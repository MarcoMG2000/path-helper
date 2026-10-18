import { NavLink } from "react-router";
import type { Role } from "../../shared";
import { es } from "../i18n/es";
import { visibleSections, type AppSection } from "./sections";

// R32: Inicio + secciones del rol, ordenadas; NavLink marca la actual con aria-current="page".
export function Nav({ sections, role }: { sections: readonly AppSection[]; role: Role }) {
  return (
    <nav className="ph-nav" aria-label={es.a11y.mainNav}>
      <ul className="ph-nav__list">
        <li className="ph-nav__item">
          <NavLink className="ph-nav__link" to="/" end>
            {es.nav.home}
          </NavLink>
        </li>
        {visibleSections(sections, role).map((section) => (
          <li className="ph-nav__item" key={section.id}>
            <NavLink className="ph-nav__link" to={section.path}>
              {section.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
