import { Link } from "react-router";
import { es } from "../../i18n/es";
import { Page } from "../../shell/page";

// R31: sustituye al contenido de la sección cuando el rol no basta.
export function ForbiddenPage() {
  return (
    <Page title={es.forbidden.title}>
      <p>{es.forbidden.message}</p>
      <Link className="ph-button" to="/">
        {es.common.backHome}
      </Link>
    </Page>
  );
}
