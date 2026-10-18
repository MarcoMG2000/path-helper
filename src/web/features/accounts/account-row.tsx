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
// Elemento al que se devuelve el foco cuando termina la acción (R90).
type FocusTarget = "reset" | "toggle" | "unlock" | "confirm" | "pin";
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
  const resetButton = useRef<HTMLButtonElement>(null);
  const toggleButton = useRef<HTMLButtonElement>(null);
  const unlockButton = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const [wantFocus, setWantFocus] = useState<FocusTarget | null>(null);
  const isGm = account.role === "gm";

  // Gestión del foco (R90): los paneles de la fila montan y desmontan controles, y los botones
  // se deshabilitan mientras dura la acción; sin esto el foco caería a <body>. Se aplica cuando
  // el elemento destino ya está montado y habilitado.
  useEffect(() => {
    if (!wantFocus || busy) return;
    const targets = {
      reset: resetButton,
      toggle: toggleButton,
      unlock: unlockButton,
      confirm: confirmButton,
      pin: pinInput,
    };
    targets[wantFocus].current?.focus();
    setWantFocus(null);
  }, [wantFocus, busy, mode]);

  function fail(error: ApiError) {
    setMessage({ kind: "error", text: errorMessage(error) });
    if (error.code === "not_found") onNotFound();
  }

  // Ejecuta una acción de la fila: deshabilita los botones mientras dura (R70). Al terminar
  // devuelve el foco al destino indicado según haya ido bien (`onSuccess`) o mal (`onFailure`).
  async function run<T>(
    action: () => Promise<ApiResult<T>>,
    onDone: (value: T) => void,
    focus: { onSuccess: FocusTarget; onFailure: FocusTarget },
  ) {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const result = await action();
    setBusy(false);
    if (result.ok) onDone(result.value);
    else fail(result.error);
    setWantFocus(result.ok ? focus.onSuccess : focus.onFailure);
  }

  function submitResetPin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pinSchema.safeParse(pin).success) {
      setPinError(t.newPinInvalid);
      setWantFocus("pin");
      return;
    }
    setPinError(undefined);
    void run(
      () => accounts.resetPin(account.id, pin),
      () => {
        setMode("idle");
        setMessage({ kind: "success", text: t.resetSuccess });
      },
      { onSuccess: "reset", onFailure: "pin" },
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
      { onSuccess: "toggle", onFailure: disabled ? "confirm" : "toggle" },
    );
  }

  function unlock() {
    void run(
      () => accounts.unlock(account.id),
      () => setMessage({ kind: "success", text: t.unlockSuccess }),
      { onSuccess: "unlock", onFailure: "unlock" },
    );
  }

  // Al cancelar, el foco vuelve al botón que abrió el panel.
  function closePanel(origin: FocusTarget) {
    setMode("idle");
    setWantFocus(origin);
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
            ref={resetButton}
            disabled={busy}
            onClick={() => {
              setMessage(null);
              setMode("reset-pin");
              setWantFocus("pin");
            }}
          >
            {t.resetPin}
          </button>
          {account.disabled ? (
            <button
              type="button"
              className="ph-button"
              aria-label={t.enableFor(account.name)}
              ref={toggleButton}
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
              ref={toggleButton}
              disabled={busy}
              onClick={() => {
                setMessage(null);
                setMode("confirm-disable");
                setWantFocus("confirm");
              }}
            >
              {t.disable}
            </button>
          )}
          <button
            type="button"
            className="ph-button"
            aria-label={t.unlockFor(account.name)}
            ref={unlockButton}
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
              ref={confirmButton}
              disabled={busy}
              onClick={() => setDisabled(true)}
            >
              {t.confirmDisableYes}
            </button>
            <button
              type="button"
              className="ph-button"
              disabled={busy}
              onClick={() => closePanel("toggle")}
            >
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
            <button
              type="button"
              className="ph-button"
              disabled={busy}
              onClick={() => closePanel("reset")}
            >
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
