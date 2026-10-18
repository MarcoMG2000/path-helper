import { Alert } from "../components/alert";
import { es } from "../i18n/es";
import { useSession } from "../session/session-context";
import { Page } from "./page";

// Contenido (sin layout) para las sesiones `loading` y `error`.
export function Splash() {
  const { state, reload } = useSession();
  if (state.status === "error") {
    return (
      <Page title={es.session.checkFailed}>
        <Alert kind="error">{es.session.checkFailedHint}</Alert>
        <button type="button" className="ph-button ph-button--primary" onClick={reload}>
          {es.common.retry}
        </button>
      </Page>
    );
  }
  return <p role="status">{es.session.checking}</p>;
}
