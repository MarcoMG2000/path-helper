import { Link } from "react-router";
import { es } from "../../i18n/es";
import { Page } from "../../shell/page";

// R30: 404 dentro del layout, con enlace a `/`.
export function NotFoundPage() {
  return (
    <Page title={es.notFound.title}>
      <p>{es.notFound.message}</p>
      <Link className="ph-button" to="/">
        {es.common.backHome}
      </Link>
    </Page>
  );
}
