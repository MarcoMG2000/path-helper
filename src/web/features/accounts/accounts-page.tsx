import { useCallback, useEffect, useRef, useState } from "react";
import type { AccountDto } from "../../../shared";
import type { ApiError } from "../../api/http-client";
import { useServices } from "../../api/services";
import { Alert } from "../../components/alert";
import { errorMessage } from "../../i18n/error-message";
import { es } from "../../i18n/es";
import { Page } from "../../shell/page";
import { useUser } from "../../session/session-context";
import { AccountRow } from "./account-row";
import { CreateAccountForm } from "./create-account-form";

type ListState =
  | { status: "loading" }
  | { status: "error"; error: ApiError }
  | { status: "ready"; accounts: AccountDto[] };

export function AccountsPage() {
  const { accounts } = useServices();
  const me = useUser();
  const [list, setList] = useState<ListState>({ status: "loading" });
  const alive = useRef(true);

  // `silent` recarga sin pasar por «cargando»: las filas conservan su mensaje (R68).
  const load = useCallback(
    async (silent: boolean) => {
      if (!silent) setList({ status: "loading" });
      const result = await accounts.list();
      if (!alive.current) return;
      setList(
        result.ok
          ? { status: "ready", accounts: result.value }
          : silent
            ? (previous) => previous
            : { status: "error", error: result.error },
      );
    },
    [accounts],
  );

  useEffect(() => {
    alive.current = true;
    void load(false);
    return () => {
      alive.current = false;
    };
  }, [load]);

  function replace(updated: AccountDto) {
    setList((previous) =>
      previous.status === "ready"
        ? {
            status: "ready",
            accounts: previous.accounts.map((a) => (a.id === updated.id ? updated : a)),
          }
        : previous,
    );
  }

  function append(created: AccountDto) {
    setList((previous) =>
      previous.status === "ready"
        ? { status: "ready", accounts: [...previous.accounts, created] }
        : previous,
    );
  }

  return (
    <Page title={es.accounts.title}>
      <CreateAccountForm onCreated={append} />
      <section aria-labelledby="accounts-list">
        <h2 id="accounts-list">{es.accounts.list.title}</h2>
        {list.status === "loading" ? <p role="status">{es.common.loading}</p> : null}
        {list.status === "error" ? (
          <>
            <Alert kind="error">{es.accounts.list.loadFailed(errorMessage(list.error))}</Alert>
            <button
              type="button"
              className="ph-button ph-button--primary"
              onClick={() => void load(false)}
            >
              {es.common.retry}
            </button>
          </>
        ) : null}
        {list.status === "ready" && list.accounts.length === 0 ? (
          <p>{es.accounts.list.empty}</p>
        ) : null}
        {list.status === "ready" && list.accounts.length > 0 ? (
          <ul className="ph-list">
            {list.accounts.map((account) => (
              <AccountRow
                key={account.id}
                account={account}
                isSelf={account.id === me.id}
                onChange={replace}
                onNotFound={() => void load(true)}
              />
            ))}
          </ul>
        ) : null}
      </section>
    </Page>
  );
}
