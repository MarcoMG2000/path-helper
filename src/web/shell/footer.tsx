import { Link } from "react-router";
import { es } from "../i18n/es";

// R38: el aviso legal se enlaza desde el pie de todas las pantallas.
export function Footer() {
  return (
    <footer className="ph-footer">
      <Link className="ph-footer__link" to="/legal">
        {es.layout.legalLink}
      </Link>
    </footer>
  );
}
