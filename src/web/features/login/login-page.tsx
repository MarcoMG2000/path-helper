import { useRef, useState, type FormEvent } from "react";
import type { ApiError } from "../../api/http-client";
import { Alert } from "../../components/alert";
import { FormField } from "../../components/form-field";
import { PinField } from "../../components/pin-field";
import { TextInput } from "../../components/text-input";
import { errorMessage } from "../../i18n/error-message";
import { es } from "../../i18n/es";
import { Page } from "../../shell/page";
import { useSession } from "../../session/session-context";

interface FieldErrors {
  name?: string;
  pin?: string;
}

// El PIN vive solo en el estado de este formulario: se vacía tras cada respuesta y nunca va al
// contexto de sesión, a la URL, al almacenamiento ni a la consola (R24, R51, R86).
export function LoginPage() {
  const { state, login, clearNotice } = useSession();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const pinInput = useRef<HTMLInputElement>(null);

  const notice = state.status === "anonymous" ? state.notice : undefined;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    clearNotice();
    setFailure(null);
    const trimmed = name.trim();
    const errors: FieldErrors = {};
    if (trimmed === "") errors.name = es.login.nameRequired;
    if (pin === "") errors.pin = es.login.pinRequired;
    setFieldErrors(errors);
    if (errors.name || errors.pin) return;

    inFlight.current = true;
    setBusy(true);
    const result = await login(trimmed, pin);
    inFlight.current = false;
    setBusy(false);
    setPin("");
    if (!result.ok) {
      setFailure(result.error);
      pinInput.current?.focus();
    }
  }

  return (
    <Page title={es.login.title}>
      {notice ? (
        <Alert kind="info">
          {notice === "expired" ? es.session.expired : es.session.signedOutElsewhere}
        </Alert>
      ) : null}
      <form method="post" noValidate aria-busy={busy} onSubmit={onSubmit} className="ph-card">
        <FormField id="login-name" label={es.login.name} error={fieldErrors.name}>
          {(control) => (
            <TextInput
              {...control}
              value={name}
              onChange={setName}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
            />
          )}
        </FormField>
        <FormField id="login-pin" label={es.login.pin} error={fieldErrors.pin}>
          {(control) => (
            <PinField
              {...control}
              label={es.login.pin}
              value={pin}
              onChange={setPin}
              autoComplete="current-password"
              enterKeyHint="go"
              inputRef={pinInput}
            />
          )}
        </FormField>
        {failure ? <Alert kind="error">{errorMessage(failure)}</Alert> : null}
        <button
          type="submit"
          className="ph-button ph-button--primary ph-button--block"
          disabled={busy}
        >
          {busy ? es.login.submitting : es.login.submit}
        </button>
      </form>
    </Page>
  );
}
