import { useEffect, useRef, useState, type FormEvent } from "react";
import { pinSchema, type AccountDto } from "../../../shared";
import type { ApiError, ApiResult } from "../../api/http-client";
import { useServices } from "../../api/services";
import { Alert } from "../../components/alert";
import { FormField } from "../../components/form-field";
import { PinField } from "../../components/pin-field";
import { errorMessage } from "../../i18n/error-message";
import { es } from "../../i18n/es";

type Mode = "idle" | "confirm-disable" | "reset-pin";
type Message = { kind: "success" | "error"; text: string } | null;

interface AccountRowProps {
  account: AccountDto;
  isSelf: boolean;
  /** Cuenta actualizada por el servidor (deshabilitar/habilitar). */
  onChange: (account: AccountDto) => void;
  /** `not_found`: la lista se recarga (R68). */
  onNotFound: () => void;
}

// Confirmaciones en la propia fila (sin diálogos modales): R63-R70.
export function AccountRow({ account, isSelf, onChange, onNotFound }: AccountRowProps) {
  const { accounts } = useServices();
  const t = es.accounts.row;
  const [mode, setMode] = useState<Mode>("idle");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | undefined>();
  const pinInput = useRef<HTMLInputElement>(null);
  const isGm = account.role === "gm";

  useEffect(() => {
    if (mode === "reset-pin") pinInput.current?.focus();
  }, [mode]);

  function fail(error: ApiError) {
    setMessage({ kind: "error", text: errorMessage(error) });
    if (error.code === "not_found") onNotFound();
  }

  // Ejecuta una acción de la fila: deshabilita los botones mientras dura (R70).
  async function run<T>(action: () => Promise<ApiResult<T>>, onDone: (value: T) => void) {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const result = await action();
    setBusy(false);
    if (result.ok) onDone(result.value);
    else fail(result.error);
  }

  function submitResetPin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pinSchema.safeParse(pin).success) {
      setPinError(t.newPinInvalid);
      return;
    }
    setPinError(undefined);
    void run(
      () => accounts.resetPin(account.id, pin),
      () => {
        setMode("idle");
        setMessage({ kind: "success", text: t.resetSuccess });
      },
    ).finally(() => setPin(""));
  }

  function setDisabled(disabled: boolean) {
    void run(
      () => accounts.setDisabled(account.id, disabled),
      (updated) => {
        setMode("idle");
        onChange(updated);
        setMessage({ kind: "success", text: disabled ? t.disableSuccess : t.enableSuccess });
      },
    );
  }

  function unlock() {
    void run(
      () => accounts.unlock(account.id),
      () => setMessage({ kind: "success", text: t.unlockSuccess }),
    );
  }

  function closePanel() {
    setMode("idle");
    setPin("");
    setPinError(undefined);
  }

  const pinFieldId = `reset-pin-${account.id}`;
  const confirmId = `confirm-disable-${account.id}`;

  return (
    <li className="ph-account">
      <div className="ph-account__head">
        <span className="ph-account__name">
          {account.name}
          {isSelf ? ` ${t.you}` : ""}
        </span>
        <span className="ph-account__meta">
          {t.meta(es.roles[account.role], !account.disabled)}
        </span>
      </div>

      {isGm ? <p className="ph-account__meta">{t.gmHint}</p> : null}

      {!isGm && mode === "idle" ? (
        <div className="ph-actions">
          <button
            type="button"
            className="ph-button"
            aria-label={t.resetPinFor(account.name)}
            disabled={busy}
            onClick={() => {
              setMessage(null);
              setMode("reset-pin");
            }}
          >
            {t.resetPin}
          </button>
          {account.disabled ? (
            <button
              type="button"
              className="ph-button"
              aria-label={t.enableFor(account.name)}
              disabled={busy}
              onClick={() => setDisabled(false)}
            >
              {t.enable}
            </button>
          ) : (
            <button
              type="button"
              className="ph-button"
              aria-label={t.disableFor(account.name)}
              disabled={busy}
              onClick={() => {
                setMessage(null);
                setMode("confirm-disable");
              }}
            >
              {t.disable}
            </button>
          )}
          <button
            type="button"
            className="ph-button"
            aria-label={t.unlockFor(account.name)}
            disabled={busy}
            onClick={unlock}
          >
            {t.unlock}
          </button>
        </div>
      ) : null}

      {!isGm && mode === "confirm-disable" ? (
        <div role="group" aria-labelledby={confirmId}>
          <p id={confirmId}>{t.confirmDisable(account.name)}</p>
          <div className="ph-actions">
            <button
              type="button"
              className="ph-button ph-button--primary"
              disabled={busy}
              onClick={() => setDisabled(true)}
            >
              {t.confirmDisableYes}
            </button>
            <button type="button" className="ph-button" disabled={busy} onClick={closePanel}>
              {es.common.cancel}
            </button>
          </div>
        </div>
      ) : null}

      {!isGm && mode === "reset-pin" ? (
        <form noValidate aria-busy={busy} onSubmit={submitResetPin}>
          <FormField id={pinFieldId} label={t.newPin} hint={t.newPinHint} error={pinError}>
            {(control) => (
              <PinField
                {...control}
                label={t.newPin}
                value={pin}
                onChange={setPin}
                autoComplete="new-password"
                enterKeyHint="go"
                disabled={busy}
                inputRef={pinInput}
              />
            )}
          </FormField>
          <div className="ph-actions">
            <button type="submit" className="ph-button ph-button--primary" disabled={busy}>
              {t.savePin}
            </button>
            <button type="button" className="ph-button" disabled={busy} onClick={closePanel}>
              {es.common.cancel}
            </button>
          </div>
        </form>
      ) : null}

      {message ? (
        <div className="ph-account__message">
          <Alert kind={message.kind}>{message.text}</Alert>
        </div>
      ) : null}
    </li>
  );
}
