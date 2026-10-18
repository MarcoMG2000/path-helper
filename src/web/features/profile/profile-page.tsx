import { useState } from "react";
import { Alert } from "../../components/alert";
import { es } from "../../i18n/es";
import { Page } from "../../shell/page";
import { useSession, useUser } from "../../session/session-context";
import { ChangePinForm } from "./change-pin-form";

export function ProfilePage() {
  const user = useUser();
  const { logout } = useSession();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function onLogout() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const result = await logout();
    setBusy(false);
    // Si falla se mantiene la sesión y se avisa (R20): no se finge un cierre que no ocurrió.
    if (!result.ok) setFailed(true);
  }

  return (
    <Page title={es.profile.title}>
      <dl className="ph-card">
        <dt>{es.profile.name}</dt>
        <dd>{user.name}</dd>
        <dt>{es.profile.role}</dt>
        <dd>{es.roles[user.role]}</dd>
      </dl>
      <ChangePinForm />
      <section className="ph-card" aria-labelledby="profile-session">
        <h2 id="profile-session">{es.profile.logout.title}</h2>
        {failed ? <Alert kind="error">{es.session.logoutFailed}</Alert> : null}
        <button type="button" className="ph-button" disabled={busy} onClick={onLogout}>
          {es.profile.logout.button}
        </button>
      </section>
    </Page>
  );
}
