import { useState, type FormEvent } from "react";
import { pinSchema } from "../../../shared";
import type { ApiError } from "../../api/http-client";
import { useServices } from "../../api/services";
import { Alert } from "../../components/alert";
import { FormField } from "../../components/form-field";
import { PinField } from "../../components/pin-field";
import { errorMessage } from "../../i18n/error-message";
import { es } from "../../i18n/es";

interface Errors {
  current?: string;
  next?: string;
  repeat?: string;
}

// R53-R56: validación local con pinSchema; los tres campos se vacían siempre tras la respuesta.
export function ChangePinForm() {
  const { auth } = useServices();
  const t = es.profile.changePin;
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setFailure(null);
    setDone(false);
    const found: Errors = {};
    if (current === "") found.current = t.currentRequired;
    if (!pinSchema.safeParse(next).success) found.next = t.nextInvalid;
    else if (repeat !== next) found.repeat = t.mismatch;
    setErrors(found);
    if (found.current || found.next || found.repeat) return;

    setBusy(true);
    const result = await auth.changePin(current, next);
    setBusy(false);
    setCurrent("");
    setNext("");
    setRepeat("");
    if (result.ok) {
      setDone(true);
    } else if (result.error.code === "invalid_current_pin") {
      setErrors({ current: errorMessage(result.error) });
    } else {
      setFailure(result.error);
    }
  }

  return (
    <form noValidate aria-busy={busy} onSubmit={onSubmit} className="ph-card">
      <h2>{t.title}</h2>
      {done ? <Alert kind="success">{t.success}</Alert> : null}
      <FormField id="pin-current" label={t.current} error={errors.current}>
        {(control) => (
          <PinField
            {...control}
            label={t.current}
            value={current}
            onChange={setCurrent}
            autoComplete="current-password"
          />
        )}
      </FormField>
      <FormField id="pin-next" label={t.next} hint={t.hint} error={errors.next}>
        {(control) => (
          <PinField
            {...control}
            label={t.next}
            value={next}
            onChange={setNext}
            autoComplete="new-password"
          />
        )}
      </FormField>
      <FormField id="pin-repeat" label={t.repeat} error={errors.repeat}>
        {(control) => (
          <PinField
            {...control}
            label={t.repeat}
            value={repeat}
            onChange={setRepeat}
            autoComplete="new-password"
            enterKeyHint="go"
          />
        )}
      </FormField>
      {failure ? <Alert kind="error">{errorMessage(failure)}</Alert> : null}
      <button
        type="submit"
        className="ph-button ph-button--primary ph-button--block"
        disabled={busy}
      >
        {busy ? t.submitting : t.submit}
      </button>
    </form>
  );
}
