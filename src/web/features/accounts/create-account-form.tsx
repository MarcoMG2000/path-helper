import { useState, type FormEvent } from "react";
import { nameSchema, pinSchema, type AccountDto } from "../../../shared";
import type { ApiError } from "../../api/http-client";
import { useServices } from "../../api/services";
import { Alert } from "../../components/alert";
import { FormField } from "../../components/form-field";
import { PinField } from "../../components/pin-field";
import { TextInput } from "../../components/text-input";
import { errorMessage } from "../../i18n/error-message";
import { es } from "../../i18n/es";

interface Errors {
  name?: string;
  pin?: string;
}

// R60-R62: validación con nameSchema/pinSchema de shared antes de llamar a la API.
export function CreateAccountForm({ onCreated }: { onCreated: (account: AccountDto) => void }) {
  const { accounts } = useServices();
  const t = es.accounts.create;
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setFailure(null);
    setCreated(null);
    const parsedName = nameSchema.safeParse(name);
    const parsedPin = pinSchema.safeParse(pin);
    const found: Errors = {};
    if (!parsedName.success) found.name = t.nameInvalid;
    if (!parsedPin.success) found.pin = t.pinInvalid;
    setErrors(found);
    if (!parsedName.success || !parsedPin.success) return;

    setBusy(true);
    const result = await accounts.create(parsedName.data, parsedPin.data);
    setBusy(false);
    setPin("");
    if (result.ok) {
      setName("");
      setCreated(result.value.name);
      onCreated(result.value);
    } else if (result.error.code === "name_taken") {
      setErrors({ name: errorMessage(result.error) });
    } else {
      setFailure(result.error);
    }
  }

  return (
    <form noValidate aria-busy={busy} onSubmit={onSubmit} className="ph-card">
      <h2>{t.title}</h2>
      {created !== null ? <Alert kind="success">{t.success(created)}</Alert> : null}
      <FormField id="new-account-name" label={t.name} hint={t.nameHint} error={errors.name}>
        {(control) => (
          <TextInput
            {...control}
            value={name}
            onChange={setName}
            autoComplete="off"
            autoCapitalize="words"
            spellCheck={false}
          />
        )}
      </FormField>
      <FormField id="new-account-pin" label={t.pin} hint={t.pinHint} error={errors.pin}>
        {(control) => (
          <PinField
            {...control}
            label={t.pin}
            value={pin}
            onChange={setPin}
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
